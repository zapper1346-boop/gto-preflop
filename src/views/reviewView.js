/** 手牌复盘：逐节点对照 GTO */
import { combos, ALL_HANDS } from "../core/hands.js";
import { SUITS, RANKS, handClassOf, randomHoleCards } from "../core/cards.js";
import { evaluateText } from "../core/hh.js";
import { el, clear, cardEl, freqRows, verdictPill, fmt, cellGradient } from "./components.js";

const $ = (id) => document.getElementById(id);

export function initReviewView(store, initialFormat) {
  const state = {
    format: initialFormat || store.defaultFormat,
    cards: [null, null],
    activeSlot: 0,
    mode: "open",
    hero: null,
    villain: null,
    threebettor: null,
    action1: null,
    action2: null,
  };

  const positionsOf = () => store.format(state.format).positions;
  const openersOf = () => positionsOf().filter((p) => p !== "BB");

  /* ---------------- 选牌 ---------------- */
  function buildSuitPicker() {
    const wrap = $("suit-picker");
    clear(wrap);
    for (const s of SUITS) {
      const row = el("div", { class: "suit-row" });
      row.appendChild(el("span", { class: `suit-label ${s.red ? "red" : ""}` }, s.glyph));
      for (const r of RANKS) {
        const btn = el("button", { class: "card-btn", dataset: { rank: r, suit: s.key } }, r);
        btn.addEventListener("click", () => pickCard({ rank: r, suit: s.key }));
        row.appendChild(btn);
      }
      wrap.appendChild(row);
    }
  }

  function pickCard(card) {
    const other = state.cards[1 - state.activeSlot];
    if (other && other.rank === card.rank && other.suit === card.suit) return;
    state.cards[state.activeSlot] = card;
    const next = state.cards.findIndex((c) => !c);
    state.activeSlot = next === -1 ? state.activeSlot : next;
    renderPicked();
    updateSubmit();
  }

  function renderPicked() {
    const wrap = $("review-picked");
    clear(wrap);
    state.cards.forEach((card, i) => {
      const slot = el("div", {
        class: `pick-slot ${card ? "is-filled" : ""} ${state.activeSlot === i && !card ? "is-active" : ""}`.trim(),
        dataset: { slot: i },
      });
      if (card) slot.appendChild(cardEl(card));
      else slot.appendChild(el("span", {}, "?"));
      slot.addEventListener("click", () => {
        state.activeSlot = i;
        renderPicked();
      });
      wrap.appendChild(slot);
    });

    for (const btn of $("suit-picker").querySelectorAll(".card-btn")) {
      const used = state.cards.some((c) => c && c.rank === btn.dataset.rank && c.suit === btn.dataset.suit);
      btn.disabled = used;
    }
    renderHandBadge();
  }

  function renderHandBadge() {
    const [a, b] = state.cards;
    let badge = $("review-hand-badge");
    if (!badge) {
      badge = el("div", { id: "review-hand-badge", class: "hd-sub", style: { marginTop: "4px" } });
      $("review-picked").after(badge);
    }
    if (a && b) {
      const hand = handClassOf(a, b);
      badge.textContent = `手牌类别：${hand} · ${combos(hand)} 个组合`;
      badge.style.color = "var(--emerald)";
    } else {
      badge.textContent = "点选花色行里的点数，或直接点上方空位切换槽位";
      badge.style.color = "var(--dim)";
    }
  }

  /* ---------------- 情境 ---------------- */
  $("review-mode").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    for (const b of $("review-mode").querySelectorAll(".seg-btn")) b.classList.toggle("is-active", b === btn);
    state.hero = null;
    state.villain = null;
    state.action1 = null;
    state.action2 = null;
    renderPositions();
    renderActions();
    updateSubmit();
  });

  function renderPositions() {
    const heroWrap = $("review-pos-picker");
    const villainWrap = $("review-villain-picker");
    clear(heroWrap);
    clear(villainWrap);
    $("review-villain-row").hidden = state.mode !== "defend";
    $("review-node2-field").hidden = true;

    if (state.mode === "open") {
      $("review-pos-label").textContent = "我的位置";
      for (const id of openersOf()) {
        heroWrap.appendChild(
          posBtn(id, state.hero, () => {
            state.hero = id;
            state.villain = null;
            state.action1 = null;
            state.action2 = null;
            renderPositions();
            renderActions();
            updateSubmit();
          })
        );
      }
      return;
    }

    $("review-pos-label").textContent = "我的位置";
    for (const id of openersOf()) {
      villainWrap.appendChild(
        posBtn(
          id,
          state.villain,
          () => {
            state.villain = id;
            state.hero = null;
            state.action1 = null;
            renderPositions();
            renderActions();
            updateSubmit();
          },
          () => store.lines(state.format, "vsrfi").some((s) => s.villain === id)
        )
      );
    }
    if (state.villain) {
      const heroes = store
        .lines(state.format, "vsrfi")
        .filter((s) => s.villain === state.villain)
        .map((s) => s.actor);
      for (const id of positionsOf().filter((p) => heroes.includes(p))) {
        heroWrap.appendChild(
          posBtn(id, state.hero, () => {
            state.hero = id;
            state.action1 = null;
            renderActions();
            updateSubmit();
          })
        );
      }
    } else {
      heroWrap.appendChild(el("span", { class: "hint", style: { padding: "6px 0" } }, "先选择开池位置"));
    }
  }

  function posBtn(id, active, onClick, enabled = () => true) {
    const btn = el("button", { class: `pos-btn ${active === id ? "is-active" : ""}`.trim(), disabled: !enabled() }, id);
    btn.addEventListener("click", onClick);
    return btn;
  }

  /* ---------------- 行动 ---------------- */
  function currentScenario() {
    if (!state.hero) return null;
    if (state.mode === "open") return store.lines(state.format, "rfi").find((s) => s.actor === state.hero) || null;
    if (!state.villain) return null;
    return (
      store.lines(state.format, "vsrfi").find((s) => s.villain === state.villain && s.actor === state.hero) || null
    );
  }

  function node2Scenario() {
    if (state.mode !== "open" || !state.hero) return null;
    return store.lines(state.format, "vs3bet").find((s) => s.actor === state.hero) || null;
  }

  function renderActions() {
    const wrap = $("review-actions");
    clear(wrap);
    const scen = currentScenario();
    if (!scen) {
      wrap.appendChild(el("span", { class: "hint" }, "先选择位置"));
      return;
    }
    const actions = [...scen.actions, "fold"];
    const keys = ["1", "2", "3"];
    actions.forEach((key, i) => {
      const meta = key === "fold" ? { short: "弃牌", color: "#4a5d58" } : store.actions[key];
      const btn = el(
        "button",
        { class: `action-btn ${state.action1 === key ? "is-chosen" : ""}`.trim(), style: { "--ac": meta.color } },
        el("span", { class: "ab-key" }, keys[i]),
        el("span", { class: "ab-name" }, el("i", {}), meta.short),
        el("span", { class: "ab-sub" }, key === "fold" ? "放弃这手牌" : nodeLabel(scen, key))
      );
      btn.addEventListener("click", () => {
        state.action1 = key;
        state.action2 = null;
        renderActions();
        renderNode2();
        updateSubmit();
      });
      wrap.appendChild(btn);
    });
  }

  function nodeLabel(scen, key) {
    const f = store.format(scen.format);
    const open = f.openSize[scen.actor] ?? f.openSize.default;
    if (scen.line === "rfi") return `开池 ${fmt(open)}bb`;
    if (scen.line === "vsrfi") return key === "threebet" ? `3-Bet 到 ${fmt(open * 3.6)}bb` : `跟注 ${fmt(open)}bb`;
    if (scen.line === "vs3bet") return key === "fourbet" ? `4-Bet 到 ${fmt(open * 3.6 * 2.5)}bb` : "跟注";
    return "";
  }

  function renderNode2() {
    const field = $("review-node2-field");
    const scen2 = node2Scenario();
    if (state.mode !== "open" || state.action1 !== "raise" || !scen2) {
      field.hidden = true;
      return;
    }
    field.hidden = false;
    const picker = $("review-3bettor-picker");
    clear(picker);
    picker.appendChild(posBtn(scen2.villain, scen2.villain, () => {}));
    state.threebettor = scen2.villain;

    const wrap = $("review-actions2");
    clear(wrap);
    const actions = [...scen2.actions, "fold"];
    actions.forEach((key, i) => {
      const meta = key === "fold" ? { short: "弃牌", color: "#4a5d58" } : store.actions[key];
      const btn = el(
        "button",
        { class: `action-btn ${state.action2 === key ? "is-chosen" : ""}`.trim(), style: { "--ac": meta.color } },
        el("span", { class: "ab-key" }, ["1", "2", "3"][i]),
        el("span", { class: "ab-name" }, el("i", {}), meta.short),
        el("span", { class: "ab-sub" }, nodeLabel(scen2, key))
      );
      btn.addEventListener("click", () => {
        state.action2 = key;
        renderNode2();
        updateSubmit();
      });
      wrap.appendChild(btn);
    });
  }

  function updateSubmit() {
    const [a, b] = state.cards;
    const scen = currentScenario();
    let ok = !!(a && b && scen && state.action1);
    if (ok && state.mode === "open" && state.action1 === "raise" && node2Scenario()) {
      ok = !!state.action2;
    }
    $("review-submit").disabled = !ok;
  }

  /* ---------------- 提交 ---------------- */
  $("review-submit").addEventListener("click", () => renderResult());
  $("review-random").addEventListener("click", () => {
    const [a, b] = randomHoleCards();
    state.cards = [a, b];
    state.activeSlot = 1;
    renderPicked();
    updateSubmit();
  });
  $("review-clear").addEventListener("click", () => {
    state.cards = [null, null];
    state.activeSlot = 0;
    state.action1 = null;
    state.action2 = null;
    renderPicked();
    renderActions();
    renderNode2();
    updateSubmit();
    $("review-output").hidden = true;
    $("review-empty").hidden = false;
  });

  function renderResult() {
    const hand = handClassOf(state.cards[0], state.cards[1]);
    const s1 = currentScenario();
    const g1 = store.grade(s1, hand, state.action1);
    const nodes = [
      {
        title: s1.line === "rfi" ? `${s1.actor} 开池` : `${s1.actor} vs ${s1.villain} 开池`,
        label: state.action1 === "fold" ? "弃牌" : store.actions[state.action1].short,
        g: g1,
        detail: g1.detail,
        scenario: s1,
      },
    ];

    if (state.mode === "open" && state.action1 === "raise" && node2Scenario() && state.action2) {
      const s2 = node2Scenario();
      const g2 = store.grade(s2, hand, state.action2);
      nodes.push({
        title: `被 ${s2.villain} 3-Bet 后`,
        label: state.action2 === "fold" ? "弃牌" : store.actions[state.action2].short,
        g: g2,
        detail: g2.detail,
        scenario: s2,
      });
    }

    const avg = nodes.reduce((a, n) => a + n.g.pct, 0) / nodes.length;
    const goodCount = nodes.filter((n) => n.g.pct >= 75).length;
    const out = $("review-output");
    clear(out);
    out.hidden = false;
    $("review-empty").hidden = true;

    const scoreColor = avg >= 75 ? "var(--emerald)" : avg >= 35 ? "var(--amber)" : "var(--rose)";
    out.appendChild(
      el(
        "div",
        { class: "rv-head" },
        el("div", { class: "rv-score", style: { "--sc": scoreColor, "--p": Math.round(avg) } }, el("div", {}, `${Math.round(avg)}`, el("span", {}, "分"))),
        el(
          "div",
          { class: "rv-title" },
          el("h3", {}, `${hand} · ${nodes.length} 个翻前决策`),
          el(
            "p",
            {},
            nodes.length > 1
              ? `${goodCount}/${nodes.length} 个决策完全符合 GTO，平均频率命中 ${Math.round(avg)}%。`
              : `该决策命中 GTO 频率 ${Math.round(avg)}%。`
          )
        )
      )
    );

    const timeline = el("div", { class: "rv-timeline" });
    nodes.forEach((n, i) => {
      const bestLabel = n.g.best.key === "fold" ? "弃牌" : store.actions[n.g.best.key].short;
      const node = el("div", { class: "rv-node" });
      node.appendChild(
        el(
          "div",
          { class: "rv-node-head" },
          el("div", { class: "rv-node-title" }, `决策 ${i + 1} · ${n.title}`, el("small", {}, `${hand} · ${combos(hand)} combos`)),
          verdictPill(n.g.level, n.g.label)
        )
      );
      node.appendChild(
        el(
          "div",
          { class: "rv-line" },
          "你的选择：",
          el("b", {}, n.label),
          ` · GTO 频率 `,
          el("b", {}, `${fmt(n.g.pct)}%`),
          ` · 首选 `,
          el("b", {}, `${bestLabel} ${fmt(n.g.best.pct)}%`)
        )
      );
      node.appendChild(
        el(
          "div",
          { class: "rv-tip" },
          n.g.pct >= 75
            ? "符合主流频率，这手牌的翻前决策没有问题。"
            : n.g.pct >= 35
            ? `这是一个混合节点：GTO 会在 ${bestLabel} 与你的选择之间分配频率，你的选择属于可接受范围，但不是主流。`
            : `偏离明显。GTO 这里更倾向 ${bestLabel}（${fmt(n.g.best.pct)}%），你选的 ${n.label} 只有 ${fmt(n.g.pct)}%。`
        )
      );
      node.appendChild(freqRows(n.detail.items, n.detail.fold, { compact: true }));
      timeline.appendChild(node);
    });
    out.appendChild(timeline);

    const tally = { good: 0, mid: 0, bad: 0 };
    for (const n of nodes) tally[n.g.level] += 1;
    out.appendChild(
      el(
        "div",
        { class: "rv-summary" },
        [
          ["good", "标准打法", tally.good],
          ["mid", "混合 / 边缘", tally.mid],
          ["bad", "明显偏离", tally.bad],
        ].map(([lv, label, count]) =>
          el("div", { class: `rv-sum-item ${lv}` }, el("b", {}, String(count)), el("span", {}, label))
        )
      )
    );

    out.appendChild(
      el(
        "div",
        { class: "rv-maps" },
        nodes.map((n) =>
          el(
            "div",
            { class: "rv-map" },
            el("div", { class: "rv-map-head" }, `${n.title} · 范围位置`),
            el(
              "div",
              { class: "mini-grid" },
              ALL_HANDS.map((h) => {
                const d = store.detail(n.scenario, h);
                return el("div", {
                  class: `mini-cell ${h === hand ? "is-target" : ""}`.trim(),
                  style: { background: cellGradient(d.items, d.fold) },
                  title: h,
                });
              })
            )
          )
        )
      )
    );

    out.appendChild(
      el("p", { class: "hint", style: { marginTop: "16px" } },
        "判定基于手牌类别与公开理论基准，未计入花色阻断与对手的偏离倾向（exploitative 调整）。"
      )
    );
  }

  function setFormat(formatId) {
    if (!formatId || formatId === state.format) return;
    state.format = formatId;
    state.cards = [null, null];
    state.activeSlot = 0;
    state.hero = null;
    state.villain = null;
    state.action1 = null;
    state.action2 = null;
    renderPicked();
    renderPositions();
    renderActions();
    renderNode2();
    updateSubmit();
    $("review-output").hidden = true;
    $("review-empty").hidden = false;
  }

  function resetForm() {
    state.cards = [null, null];
    state.activeSlot = 0;
    state.action1 = null;
    state.action2 = null;
    renderPicked();
    renderActions();
    renderNode2();
    updateSubmit();
    $("review-output").hidden = true;
    $("review-empty").hidden = false;
  }

  /* ---------------- 批量导入 ---------------- */
  const SAMPLE = `PokerStars Hand #100000001: Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/01 12:00:00 ET
Table 'Alpha' 6-max Seat #3 is the button
Seat 1: Hero ($100 in chips)
Seat 2: Villain1 ($100 in chips)
Seat 3: Villain2 ($100 in chips)
Seat 4: Villain3 ($100 in chips)
Seat 5: Villain4 ($100 in chips)
Seat 6: Villain5 ($100 in chips)
Villain3: posts small blind $0.50
Villain4: posts big blind $1.00
*** HOLE CARDS ***
Dealt to Hero [As Kd]
Villain5: folds
Hero: raises $1.50 to $2.50
Villain1: folds
Villain2: folds
Villain3: folds
Villain4: raises $6.50 to $9
Hero: folds
*** FLOP *** [2c 7d Jh]

PokerStars Hand #100000002: Hold'em No Limit ($1/$2 USD) - 2026/11/01 12:05:00 ET
Table 'Beta' 9-max Seat #5 is the button
Seat 1: PlayerA ($200 in chips)
Seat 2: PlayerB ($200 in chips)
Seat 3: PlayerC ($200 in chips)
Seat 4: PlayerD ($200 in chips)
Seat 5: PlayerE ($200 in chips)
Seat 6: PlayerF ($200 in chips)
Seat 7: Hero ($200 in chips)
Seat 8: PlayerG ($200 in chips)
Seat 9: PlayerH ($200 in chips)
PlayerF: posts small blind $1.00
Hero: posts big blind $2.00
*** HOLE CARDS ***
Dealt to Hero [Qh Qd]
PlayerG: folds
PlayerH: folds
PlayerA: folds
PlayerB: raises $3.00 to $5.00
PlayerC: folds
PlayerD: folds
PlayerE: folds
PlayerF: folds
Hero: raises $18.00 to $23.00
PlayerB: folds
*** FLOP *** [2c 7d Jh]

PokerStars Hand #100000003: Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/01 12:10:00 ET
Table 'Gamma' 6-max Seat #2 is the button
Seat 1: Hero ($100 in chips)
Seat 2: Villain1 ($100 in chips)
Seat 3: Villain2 ($100 in chips)
Seat 4: Villain3 ($100 in chips)
Seat 5: Villain4 ($100 in chips)
Seat 6: Villain5 ($100 in chips)
Villain2: posts small blind $0.50
Villain3: posts big blind $1.00
*** HOLE CARDS ***
Dealt to Hero [9h 9d]
Villain4: folds
Villain5: raises $1.50 to $2.50
Hero: calls $2.50
Villain1: folds
Villain2: folds
Villain3: folds
*** FLOP *** [2c 7d Jh]`;

  function switchReviewTab(tab) {
    for (const b of $("review-tab").querySelectorAll(".seg-btn")) {
      b.classList.toggle("is-active", b.dataset.tab === tab);
    }
    $("review-single").hidden = tab !== "single";
    $("review-batch").hidden = tab !== "batch";
    $("review-output").hidden = true;
    $("review-empty").hidden = false;
    clear($("review-output"));
  }

  $("review-tab").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (btn) switchReviewTab(btn.dataset.tab);
  });

  $("hh-sample").addEventListener("click", () => {
    $("hh-input").value = SAMPLE;
  });

  $("hh-clear").addEventListener("click", () => {
    $("hh-input").value = "";
    $("review-output").hidden = true;
    $("review-empty").hidden = false;
    clear($("review-output"));
  });

  $("hh-run").addEventListener("click", () => {
    const text = $("hh-input").value.trim();
    if (!text) {
      $("hh-input").focus();
      return;
    }
    renderBatch(evaluateText(text, store));
  });

  function renderBatch({ results, errors, total }) {
    const out = $("review-output");
    clear(out);
    out.hidden = false;
    $("review-empty").hidden = true;

    const rows = [];
    for (const r of results) for (const d of r.decisions) rows.push({ r, d });

    if (!rows.length) {
      out.appendChild(el("h3", { style: { fontSize: "16px", marginBottom: "10px" } }, "没有可评分的翻前决策"));
      out.appendChild(
        el("p", { class: "batch-note" },
          `共读取 ${total} 手。${errors.length ? `跳过原因：${[...new Set(errors)].join("；")}` : "请检查手牌文本格式。"}`)
      );
      return;
    }

    const avg = rows.reduce((a, x) => a + x.d.grade.pct, 0) / rows.length;
    const deviations = rows.filter((x) => x.d.grade.pct < 35).length;
    const good = rows.filter((x) => x.d.grade.pct >= 75).length;
    const color = avg >= 75 ? "var(--emerald)" : avg >= 35 ? "var(--amber)" : "var(--rose)";

    out.appendChild(
      el(
        "div",
        { class: "rv-head" },
        el("div", { class: "rv-score", style: { "--sc": color, "--p": Math.round(avg) } }, el("div", {}, String(Math.round(avg)), el("span", {}, "均分"))),
        el(
          "div",
          { class: "rv-title" },
          el("h3", {}, `批量复盘 · ${results.length} 手 / ${rows.length} 个决策`),
          el("p", {}, `平均频率命中 ${Math.round(avg)}%，${good} 个完全标准，${deviations} 个明显偏离。`)
        )
      )
    );

    const table = el("table", { class: "batch-table" });
    table.appendChild(
      el("thead", {}, el("tr", {}, ["手牌", "位置", "场景", "你的行动", "GTO 频率", "判定"].map((h) => el("th", {}, h))))
    );
    const tbody = el("tbody");
    for (const { r, d } of rows) {
      const label = d.actionKey === "fold" ? "弃牌" : store.actions[d.actionKey].short;
      tbody.appendChild(
        el(
          "tr",
          {},
          el("td", { class: "hand" }, r.handClass),
          el("td", {}, r.heroPos || "—"),
          el("td", {}, d.scenario.title),
          el("td", {}, label),
          el("td", { class: "num" }, `${fmt(d.grade.pct)}%`),
          el("td", {}, verdictPill(d.grade.level, d.grade.label))
        )
      );
    }
    table.appendChild(tbody);
    out.appendChild(table);

    if (errors.length) {
      out.appendChild(
        el("p", { class: "batch-note" }, `另有 ${errors.length} 手被跳过：${[...new Set(errors)].slice(0, 3).join("；")}`)
      );
    }

    const worst = rows
      .filter((x) => x.d.grade.pct < 75)
      .sort((a, b) => a.d.grade.pct - b.d.grade.pct)
      .slice(0, 3);
    if (worst.length) {
      out.appendChild(el("div", { class: "batch-worst" }, el("div", { class: "batch-worst-head" }, "最需要复盘")));
      for (const { r, d } of worst) {
        const bestLabel = d.grade.best.key === "fold" ? "弃牌" : store.actions[d.grade.best.key].short;
        out.appendChild(
          el(
            "div",
            { class: "batch-worst-row" },
            el("span", { class: "bw-hand" }, r.handClass),
            el("span", {}, `${r.heroPos} · ${d.scenario.title}`),
            el("b", {}, d.grade.pct < 35 ? "偏离" : "可优化"),
            el("span", { class: "bw-tip" }, `GTO 更倾向 ${bestLabel}（${fmt(d.grade.best.pct)}%）`)
          )
        );
      }
    }

    out.appendChild(
      el("p", { class: "batch-note" },
        "判定基于手牌类别与公开理论基准；6 人桌按现金局基准、9 人桌按 MTT 基准，未计入花色阻断与实际筹码深度。")
    );
  }

  /* ---------------- 初始化 ---------------- */
  buildSuitPicker();
  renderPicked();
  renderPositions();
  renderActions();
  updateSubmit();

  return { setFormat, resetForm };
}
