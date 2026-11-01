/** 翻前训练 / 测验 */
import { ALL_HANDS, combos } from "../core/hands.js";
import { randomHoleCards, handClassOf } from "../core/cards.js";
import { el, clear, cardEl, freqRows, fmt } from "./components.js";

const $ = (id) => document.getElementById(id);

const ACTION_SUB = {
  raise: "开池进攻",
  threebet: "再加注施压",
  fourbet: "反加注到底",
  call: "跟注进池",
  fold: "放弃这手牌",
};

const fmtSize = (v) => String(Math.round(v * 10) / 10);

export function initTrainerView(store, initialFormat) {
  const state = {
    format: initialFormat || store.defaultFormat,
    running: false,
    lines: new Set(["rfi", "vsrfi", "vs3bet"]),
    mode: "mix",
    question: null,
    answered: false,
    stats: { answered: 0, correct: 0, streak: 0, best: 0, score: 0 },
    startedAt: 0,
    timer: null,
  };

  function syncCounts() {
    const counts = store.counts(state.format);
    $("cnt-rfi").textContent = counts.rfi;
    $("cnt-vsrfi").textContent = counts.vsrfi;
    $("cnt-vs3bet").textContent = counts.vs3bet;
  }
  syncCounts();

  function openSize(scenario) {
    const f = store.format(scenario.format);
    const who = scenario.line === "rfi" ? scenario.actor : scenario.villain;
    return f.openSize[who] ?? f.openSize.default;
  }

  function actionLabel(key, scenario) {
    const open = openSize(scenario);
    switch (key) {
      case "raise":
        return `加注 ${fmtSize(open)}bb`;
      case "threebet":
        return `3-Bet ${fmtSize(open * 3.6)}bb`;
      case "fourbet":
        return `4-Bet ${fmtSize(open * 3.6 * 2.5)}bb`;
      case "call":
        return `跟注 ${fmtSize(open)}bb`;
      default:
        return "弃牌";
    }
  }

  $("trainer-lines").addEventListener("change", () => {
    state.lines = new Set(
      [...document.querySelectorAll("#trainer-lines input:checked")].map((i) => i.value)
    );
  });

  $("trainer-mode").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    for (const b of $("trainer-mode").querySelectorAll(".seg-btn")) b.classList.toggle("is-active", b === btn);
  });

  $("trainer-start").addEventListener("click", () => startSession());
  $("trainer-reset").addEventListener("click", () => {
    state.stats = { answered: 0, correct: 0, streak: 0, best: 0, score: 0 };
    updateStats();
  });

  function pool() {
    return store.scenariosOf(state.format).filter((s) => state.lines.has(s.line));
  }

  function startSession() {
    if (!state.lines.size) {
      alert("至少选择一个题目范围");
      return;
    }
    state.running = true;
    state.stats = { answered: 0, correct: 0, streak: 0, best: 0, score: 0 };
    state.startedAt = Date.now();
    $("quiz-empty").hidden = true;
    $("quiz-body").hidden = false;
    updateStats();
    clearInterval(state.timer);
    state.timer = setInterval(tick, 1000);
    tick();
    nextQuestion();
  }

  function tick() {
    const s = Math.floor((Date.now() - state.startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    $("quiz-timer").textContent = state.running ? `${mm}:${ss}` : "—";
  }

  /* ---------- 出题 ---------- */
  function pickScenario() {
    const list = pool();
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickHand(scenario) {
    const playable = Object.entries(scenario.hands).map(([hand, arr]) => ({
      hand,
      arr,
      w: combos(hand) * (arr.some((v) => v > 0) ? 1 : 0),
    }));
    const usePlayable = state.mode === "range" || Math.random() < 0.5;
    if (usePlayable) {
      const pool2 = playable.filter((p) => p.w > 0);
      if (pool2.length) {
        const total = pool2.reduce((a, b) => a + b.w, 0);
        let r = Math.random() * total;
        for (const p of pool2) {
          r -= p.w;
          if (r <= 0) return p.hand;
        }
        return pool2[pool2.length - 1].hand;
      }
    }
    return ALL_HANDS[Math.floor(Math.random() * ALL_HANDS.length)];
  }

  /** 按手牌类别生成具体花色 */
  function cardsForClass(hand) {
    const SUITS = ["s", "h", "d", "c"];
    const pick = (n) => SUITS[Math.floor(Math.random() * n)];
    if (hand.length === 2) {
      const s1 = pick(4);
      const rest = SUITS.filter((s) => s !== s1);
      return [
        { rank: hand[0], suit: s1 },
        { rank: hand[1], suit: rest[Math.floor(Math.random() * 3)] },
      ];
    }
    const [hi, lo] = [hand[0], hand[1]];
    if (hand.endsWith("s")) {
      const s = pick(4);
      return [
        { rank: hi, suit: s },
        { rank: lo, suit: s },
      ];
    }
    const s1 = pick(4);
    const rest = SUITS.filter((s) => s !== s1);
    return [
      { rank: hi, suit: s1 },
      { rank: lo, suit: rest[Math.floor(Math.random() * 3)] },
    ];
  }

  function nextQuestion() {
    const scenario = pickScenario();
    const hand = pickHand(scenario);
    const cards = cardsForClass(hand);
    state.question = { scenario, hand, cards };
    state.answered = false;

    $("quiz-index").textContent = `第 ${state.stats.answered + 1} 题`;
    $("quiz-streak").textContent = `连胜 ${state.stats.streak}`;

    const hist = $("quiz-history");
    clear(hist);
    hist.appendChild(el("b", {}, scenario.villain ? `${scenario.villain} 开池` : "无人开池"));
    hist.appendChild(document.createTextNode("  ·  "));
    hist.appendChild(el("b", {}, `你在 ${scenario.actor}`));

    $("quiz-question").innerHTML = "";
    $("quiz-question").appendChild(
      el(
        "span",
        {},
        scenario.line === "rfi"
          ? `${store.positions[scenario.actor].name}开牌，怎么打？`
          : scenario.line === "vsrfi"
          ? `${scenario.villain} 开池，你在 ${scenario.actor}，怎么打？`
          : `你开池后被 ${scenario.villain} 3-Bet，怎么应对？`
      )
    );

    const hole = $("quiz-cards");
    clear(hole);
    hole.appendChild(cardEl(cards[0]));
    hole.appendChild(cardEl(cards[1]));

    renderActions(scenario);
    const fb = $("quiz-feedback");
    fb.hidden = true;
    clear(fb);
    $("quiz-body").hidden = false;
  }

  function renderActions(scenario) {
    const wrap = $("quiz-actions");
    clear(wrap);
    const actions = [...scenario.actions, "fold"];
    const keys = ["1", "2", "3"];
    actions.forEach((key, i) => {
      const meta = key === "fold" ? { short: "弃牌", color: "#4a5d58" } : store.actions[key];
      const btn = el(
        "button",
        { class: "action-btn", dataset: { action: key }, style: { "--ac": meta.color } },
        el("span", { class: "ab-key" }, keys[i]),
        el("span", { class: "ab-name" }, el("i", {}), key === "fold" ? "弃牌" : meta.short),
        el("span", { class: "ab-sub" }, key === "fold" ? "放弃这手牌" : actionLabel(key, scenario))
      );
      btn.addEventListener("click", () => answer(key));
      wrap.appendChild(btn);
    });
  }

  function answer(action) {
    if (state.answered || !state.question) return;
    state.answered = true;
    const { scenario, hand } = state.question;
    const g = store.grade(scenario, hand, action);
    const pct = g.pct;

    for (const btn of $("quiz-actions").querySelectorAll(".action-btn")) {
      btn.disabled = true;
      if (btn.dataset.action === action) {
        btn.classList.add(g.level === "good" ? "is-correct" : g.level === "mid" ? "is-mixed" : "is-wrong");
      }
      if (btn.dataset.action === g.best.key) btn.classList.add("is-best", "is-correct");
    }

    state.stats.answered += 1;
    if (pct >= 50) state.stats.correct += 1;
    if (pct >= 50) {
      state.stats.streak += 1;
      state.stats.best = Math.max(state.stats.best, state.stats.streak);
    } else {
      state.stats.streak = 0;
    }
    state.stats.score += Math.round(pct);
    updateStats();

    const fb = $("quiz-feedback");
    clear(fb);
    fb.hidden = false;
    const badgeCls = g.level === "good" ? "good" : g.level === "bad" ? "bad" : "mid";
    const chosenLabel = action === "fold" ? "弃牌" : store.actions[action].short;
    const bestLabel = g.best.key === "fold" ? "弃牌" : store.actions[g.best.key].short;

    fb.appendChild(
      el(
        "div",
        { class: "fb-head" },
        el(
          "div",
          { class: "fb-verdict" },
          el("span", { class: `fb-badge ${badgeCls}` }, pct >= 75 ? "✓" : pct >= 35 ? "≈" : "✕"),
          el("span", {}, g.label),
          el("span", { style: { fontFamily: "var(--mono)", fontSize: "12px", color: "var(--dim)" } }, `${chosenLabel} · GTO ${fmt(pct)}%`)
        ),
        el("button", { class: "btn btn-primary fb-next", onclick: () => nextQuestion() }, "下一题 空格")
      )
    );

    fb.appendChild(
      el(
        "div",
        { class: "fb-note" },
        `GTO 首选：${bestLabel}（${fmt(g.best.pct)}%）。`,
        pct < 35 ? `这手牌在这里几乎不该 ${chosenLabel}，长期这么打会明显亏 EV。` : pct < 75 ? "属于混合策略的合理区间，但频率上不是主流选择。" : "完全符合主流频率。"
      )
    );
    fb.appendChild(freqRows(g.detail.items, g.detail.fold, { compact: true }));

    $("quiz-streak").textContent = `连胜 ${state.stats.streak}`;
  }

  function updateStats() {
    const s = state.stats;
    $("st-answered").textContent = s.answered;
    $("st-correct").textContent = s.answered ? `${Math.round((s.correct / s.answered) * 100)}%` : "0%";
    $("st-best").textContent = s.best;
    $("st-score").textContent = s.score;
  }

  window.addEventListener("keydown", (e) => {
    if (!document.getElementById("view-trainer").classList.contains("is-active")) return;
    if (!state.running || !state.question) return;
    if (e.key === " " && state.answered) {
      e.preventDefault();
      nextQuestion();
      return;
    }
    if (!state.answered && ["1", "2", "3"].includes(e.key)) {
      const actions = [...state.question.scenario.actions, "fold"];
      const action = actions[Number(e.key) - 1];
      if (action) answer(action);
    }
  });

  function setFormat(formatId) {
    if (!formatId || formatId === state.format) return;
    state.format = formatId;
    syncCounts();
    if (state.running) {
      state.stats = { answered: 0, correct: 0, streak: 0, best: 0, score: 0 };
      state.startedAt = Date.now();
      updateStats();
      nextQuestion();
    }
  }

  return { startSession, setFormat };
}
