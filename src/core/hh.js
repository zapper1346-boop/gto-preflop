/**
 * 手牌历史解析（PokerStars / GGPoker 风格）
 *
 * 只解析翻前：座位、按钮位、英雄手牌、翻前动作序列。
 * 支持的决策节点：
 *  1) 英雄首次行动且前面没人加注  → 开牌 RFI
 *  2) 英雄首次行动且前面只有一次加注 → 面对开池 (vs RFI)
 *  3) 英雄开池后被 3-bet，再次行动 → 面对 3-Bet
 * 其余情况（多人加注、冷 4-bet、平跟入池等）标记为暂不支持。
 */

import { handClassOf, RANKS } from "./cards.js";

const VALID_RANK = new Set(RANKS.concat(["T"]));
const VALID_SUIT = new Set(["s", "h", "d", "c"]);

function normalizeCardText(text) {
  // 支持 "As", "A♠", "10s"
  const s = String(text).trim().replace(/10/g, "T");
  const rank = s[0]?.toUpperCase();
  const suitMap = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
  const suit = suitMap[s[1]] || s[1]?.toLowerCase();
  if (!VALID_RANK.has(rank) || !VALID_SUIT.has(suit)) return null;
  return { rank, suit };
}

/** 把整段文本拆成一手一手 */
export function splitHands(text) {
  const lines = String(text).split(/\r?\n/);
  const chunks = [];
  let cur = [];
  const isStart = (l) => /^(?:PokerStars |GGPoker |Winamax )?(?:Hand #|Poker Hand #)/i.test(l.trim());
  for (const line of lines) {
    if (isStart(line) && cur.join("\n").includes("HOLE CARDS")) {
      chunks.push(cur.join("\n"));
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length) chunks.push(cur.join("\n"));
  return chunks.filter((c) => /HOLE CARDS/i.test(c));
}

export function parseHand(chunk) {
  const errors = [];
  const seats = [...chunk.matchAll(/^Seat (\d+): (.+?) \(/gm)].map((m) => ({
    seat: Number(m[1]),
    name: m[2].trim(),
  }));
  if (!seats.length) errors.push("找不到座位信息");

  const btn = /Seat #(\d+) is the button/i.exec(chunk);
  const buttonSeat = btn ? Number(btn[1]) : null;
  if (!buttonSeat) errors.push("找不到按钮位");

  const heroMatch = /Dealt to (.+?) \[([^\]]+)\]/i.exec(chunk);
  if (!heroMatch) errors.push("找不到「Dealt to」手牌");
  const heroName = heroMatch ? heroMatch[1].trim() : null;
  const cards = heroMatch
    ? heroMatch[2]
        .trim()
        .split(/\s+/)
        .map(normalizeCardText)
        .filter(Boolean)
    : [];
  if (cards.length !== 2) errors.push("手牌解析失败");

  // 只取翻前段
  const holeAt = chunk.search(/\*\*\* HOLE CARDS \*\*\*/i);
  const flopAt = chunk.search(/\*\*\* (FLOP|SHOW DOWN|SUMMARY|TURN|RIVER) \*\*\*/i);
  const preflopText = holeAt >= 0 ? chunk.slice(holeAt, flopAt > holeAt ? flopAt : undefined) : chunk;

  const actions = [...preflopText.matchAll(/^(.+?): (folds|checks|calls|raises|bets|is all-in)/gim)].map((m) => ({
    name: m[1].trim(),
    action: m[2].toLowerCase() === "is all-in" ? "raises" : m[2].toLowerCase(),
  }));

  const n = seats.length;
  const formatId = n === 6 ? "6max_cash_100" : n === 9 ? "9max_mtt_50" : null;
  if (!formatId) errors.push(`${n} 人桌暂不支持（只支持 6 / 9 人桌）`);

  return { heroName, cards, seats, buttonSeat, actions, playerCount: n, formatId, errors };
}

/** 根据按钮位把座位映射成位置名 */
export function seatPositions(hand, positions) {
  const occupied = hand.seats.slice().sort((a, b) => a.seat - b.seat);
  const bi = occupied.findIndex((s) => s.seat === hand.buttonSeat);
  if (bi < 0) return null;
  const clockwise = [...occupied.slice(bi), ...occupied.slice(0, bi)];
  const n = occupied.length;
  const map = new Map();
  clockwise.forEach((s, i) => {
    let pos;
    if (i === 0) pos = positions[n - 3];
    else if (i === 1) pos = positions[n - 2];
    else if (i === 2) pos = positions[n - 1];
    else pos = positions[i - 3];
    map.set(s.name, pos);
  });
  return map;
}

/**
 * 评估一手牌，返回 { ok, formatId, heroPos, handClass, decisions[], reason }
 */
export function evaluateHand(hand, store) {
  if (hand.errors.length) return { ok: false, reason: hand.errors[0] };
  const format = store.format(hand.formatId);
  if (!format) return { ok: false, reason: "标准缺失" };
  const posOf = seatPositions(hand, format.positions);
  if (!posOf) return { ok: false, reason: "座位映射失败" };

  const heroPos = posOf.get(hand.heroName);
  if (!heroPos) return { ok: false, reason: "英雄不在座位表里" };
  const handClass = handClassOf(hand.cards[0], hand.cards[1]);

  const decisions = [];
  let raiseCount = 0;
  let lastRaiser = null;
  let heroHasOpened = false;

  const pushDecision = (line, villainName, actionKey) => {
    const villain = villainName ? posOf.get(villainName) : null;
    let scenario = null;
    if (line === "rfi") scenario = store.lines(hand.formatId, "rfi").find((s) => s.actor === heroPos);
    else scenario = store.lines(hand.formatId, line).find((s) => s.actor === heroPos && s.villain === villain);
    if (!scenario) return { skipped: true, line, villain };
    const grade = store.grade(scenario, handClass, actionKey);
    decisions.push({ line, scenario, actionKey, grade });
    return { added: true };
  };

  const isRaise = (a) => a.action === "raises" || a.action === "bets";

  for (const act of hand.actions) {
    if (act.name !== hand.heroName) {
      if (isRaise(act)) {
        raiseCount += 1;
        lastRaiser = act.name;
      }
      continue;
    }

    // 轮到英雄（先用当前 raiseCount 判定节点，再把英雄自己的加注计入）
    if (raiseCount === 0) {
      if (act.action === "raises") {
        const r = pushDecision("rfi", null, "raise");
        if (r.added) heroHasOpened = true;
      } else if (act.action === "folds") {
        pushDecision("rfi", null, "fold");
      }
      // check / call（溜入）不评分
    } else if (raiseCount === 1 && !heroHasOpened) {
      if (act.action === "raises") pushDecision("vsrfi", lastRaiser, "threebet");
      else if (act.action === "calls") pushDecision("vsrfi", lastRaiser, "call");
      else if (act.action === "folds") pushDecision("vsrfi", lastRaiser, "fold");
    } else if (raiseCount === 2 && heroHasOpened) {
      if (act.action === "raises") pushDecision("vs3bet", lastRaiser, "fourbet");
      else if (act.action === "calls") pushDecision("vs3bet", lastRaiser, "call");
      else if (act.action === "folds") pushDecision("vs3bet", lastRaiser, "fold");
    }

    if (isRaise(act)) {
      raiseCount += 1;
      lastRaiser = act.name;
      if (raiseCount === 1) heroHasOpened = true;
    } else if (act.action === "calls" && raiseCount <= 1) {
      heroHasOpened = false;
    }
  }

  if (!decisions.length) return { ok: false, reason: "没有可评分的翻前决策（多人加注 / 溜入 / 非标准线路）" };

  return {
    ok: true,
    formatId: hand.formatId,
    format,
    heroPos,
    handClass,
    cards: hand.cards,
    decisions,
  };
}

/** 解析 + 评估整段文本 */
export function evaluateText(text, store) {
  const chunks = splitHands(text);
  const results = [];
  const errors = [];
  for (const chunk of chunks) {
    const hand = parseHand(chunk);
    const res = evaluateHand(hand, store);
    if (res.ok) results.push(res);
    else errors.push(res.reason);
  }
  return { results, errors, total: chunks.length };
}
