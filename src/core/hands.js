/**
 * 手牌矩阵与范围记法工具（浏览器 / Node 通用 ESM）
 *
 * 记法说明：
 *   单点      AA / AKs / AKo
 *   区间      A5s-A2s   77-55   KQo-KTo
 *   频率      A5s:50    99-66:35     （默认 100，百分比 0-100）
 *   多项      "AA-22, AKs:80, KQs-K9s:40"
 */

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
export const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r, i]));

/** 13x13 矩阵中 (row, col) 对应的手牌代号 */
export function handAt(row, col) {
  const hi = RANKS[row];
  const lo = RANKS[col];
  if (row === col) return hi + lo;
  return row < col ? hi + lo + "s" : lo + hi + "o";
}

/** 按行优先顺序生成 169 手牌 */
export const ALL_HANDS = (() => {
  const out = [];
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) out.push(handAt(r, c));
  return out;
})();

const PAIR_RE = /^([AKQJT98765432])\1$/;
const HAND_RE = /^([AKQJT98765432])([AKQJT98765432])([so])$/;

/** 解析单个手牌代号，非法返回 null */
export function parseHand(token) {
  const t = token.trim();
  if (PAIR_RE.test(t)) return { hi: t[0], lo: t[0], kind: "pair", id: t };
  const m = HAND_RE.exec(t);
  if (!m) return null;
  const [, hi, lo, s] = m;
  if (hi === lo) return null;
  if (RANK_INDEX[hi] > RANK_INDEX[lo]) return null; // 必须高牌在前
  return { hi, lo, kind: s === "s" ? "suited" : "offsuit", id: t };
}

/** 该手牌的物理组合数：对子 6，同花 4，非同花 12 */
export function combos(handId) {
  if (!handId || handId.length === 2) return 6;
  return handId.endsWith("s") ? 4 : 12;
}

/** 所有手牌总组合数 */
export const TOTAL_COMBOS = 1326;

/**
 * 展开紧凑记法为 Map<handId, weight(0-100)>
 * 重复出现时后者覆盖前者。
 */
export function expandRange(expr) {
  const out = new Map();
  if (!expr) return out;

  for (const rawToken of String(expr).split(",")) {
    const token = rawToken.trim();
    if (!token) continue;

    const colon = token.lastIndexOf(":");
    let body = token;
    let weight = 100;
    if (colon > 0) {
      const w = token.slice(colon + 1).trim();
      if (!/^\d+(\.\d+)?$/.test(w)) throw new Error(`频率写法非法: ${token}`);
      weight = Number(w);
      body = token.slice(0, colon).trim();
      if (weight < 0 || weight > 100) throw new Error(`频率超出 0-100: ${token}`);
    }

    const hands = expandBody(body);
    for (const h of hands) out.set(h, weight);
  }
  return out;
}

function expandBody(body) {
  const dash = body.indexOf("-");
  if (dash === -1) {
    const p = parseHand(body);
    if (!p) throw new Error(`无法识别的手牌: ${body}`);
    return [p.id];
  }

  const from = body.slice(0, dash).trim();
  const to = body.slice(dash + 1).trim();
  const a = parseHand(from);
  const b = parseHand(to);
  if (!a || !b) throw new Error(`无法识别的区间: ${body}`);
  if (a.kind !== b.kind) throw new Error(`区间两侧类型不一致（对子/同花/非同花）: ${body}`);

  const out = [];
  if (a.kind === "pair") {
    const ai = RANK_INDEX[a.hi];
    const bi = RANK_INDEX[b.hi];
    const step = ai <= bi ? 1 : -1;
    for (let i = ai; ; i += step) {
      out.push(RANKS[i] + RANKS[i]);
      if (i === bi) break;
    }
    return out;
  }

  if (a.hi !== b.hi) throw new Error(`区间必须是同首牌（如 A5s-A2s）: ${body}`);
  const ai = RANK_INDEX[a.lo];
  const bi = RANK_INDEX[b.lo];
  const step = ai <= bi ? 1 : -1;
  const suffix = a.kind === "suited" ? "s" : "o";
  for (let i = ai; ; i += step) {
    out.push(a.hi + RANKS[i] + suffix);
    if (i === bi) break;
  }
  return out;
}

/** 百分比保留 1 位小数 */
export function pct(x) {
  return Math.round(x * 10) / 10;
}

/** 组合数 -> 占全部起手牌的百分比 */
export function combosToPct(c) {
  return (c / TOTAL_COMBOS) * 100;
}
