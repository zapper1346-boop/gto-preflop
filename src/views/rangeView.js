/** 范围表视图 */
import { ALL_HANDS } from "../core/hands.js";
import { LINE_META, FOLD_COLOR, fmtPct } from "../core/engine.js";
import { el, clear, handCardsEl, freqRows, tableDiagram, fmt, cellGradient } from "./components.js";

const $ = (id) => document.getElementById(id);

export function initRangeView(store, initialFormat) {
  const params = new URLSearchParams(location.search);
  const deepId = params.get("s");
  const deepScen = deepId ? store.get(deepId) : null;
  const state = {
    format: deepScen?.format || initialFormat || store.defaultFormat,
    id: deepScen?.id || store.scenariosOf(initialFormat)[0].id,
    showDefense: params.get("defense") === "1" || (deepScen ? deepScen.line !== "rfi" : false),
    selected: null,
    hover: null,
    query: "",
  };

  const visibleLines = () => (state.showDefense ? ["rfi", "vsrfi", "vs3bet"] : ["rfi"]);
  const visibleCount = () =>
    state.showDefense
      ? store.scenariosOf(state.format).length
      : store.lines(state.format, "rfi").length;

  const treeEl = $("scenario-tree");
  const gridEl = $("range-grid");
  const tooltip = $("tooltip");
  const cells = new Map();

  /* ---------------- 左侧场景树 ---------------- */
  function buildTree() {
    clear(treeEl);
    for (const line of visibleLines()) {
      const list = store.lines(state.format, line);
      if (!list.length) continue;
      const group = el("div", { class: "tree-group", dataset: { line } });
      group.appendChild(
        el("div", { class: "tree-group-head" }, el("span", { class: "bar" }), el("span", {}, LINE_META[line].label), el("span", { style: { marginLeft: "auto", fontFamily: "var(--mono)", opacity: 0.6 } }, String(list.length)))
      );
      for (const s of list) {
        const firstAction = s.actions[0];
        const pct = s.stats[firstAction] ?? 0;
        const item = el(
          "button",
          { class: `tree-item ${s.id === state.id ? "is-active" : ""}`.trim(), dataset: { id: s.id }, onclick: () => selectScenario(s.id) },
          el(
            "div",
            { class: "tree-item-row" },
            el("span", { class: "tree-item-title" }, s.title),
            el("span", { class: "tree-item-pct" }, `${store.actions[firstAction].short} ${fmt(pct)}%`)
          ),
          el("div", { class: "tree-item-sub" }, s.line === "rfi" ? `${openSizeOf(s)}bb 开池` : `${s.villain} 开池`),
          miniBar(s)
        );
        group.appendChild(item);
      }
      treeEl.appendChild(group);
    }
  }

  function miniBar(s) {
    const agg = store.aggregate(s);
    const bar = el("div", { class: "tree-mini" });
    for (const it of agg.items) {
      bar.appendChild(el("i", { style: { width: `${it.pct}%`, background: it.color } }));
    }
    bar.appendChild(el("i", { style: { width: `${agg.fold}%`, background: "rgba(255,255,255,.07)" } }));
    return bar;
  }

  /* ---------------- 矩阵 ---------------- */
  function buildGrid() {
    clear(gridEl);
    ALL_HANDS.forEach((hand, i) => {
      const cell = el(
        "div",
        { class: "cell", dataset: { hand }, style: { transitionDelay: `${(Math.floor(i / 13) + (i % 13)) * 7}ms` } },
        el("span", { class: "cell-label" }, hand)
      );
      cell.addEventListener("mouseenter", (e) => onHover(hand, e));
      cell.addEventListener("mousemove", (e) => moveTip(e));
      cell.addEventListener("mouseleave", () => onLeave());
      cell.addEventListener("click", () => toggleSelect(hand));
      cells.set(hand, cell);
      gridEl.appendChild(cell);
    });
  }

  function paintCells() {
    const s = store.get(state.id);
    for (const [hand, cell] of cells) {
      const d = store.detail(s, hand);
      cell.style.background = cellBackground(d);
      cell.classList.toggle("is-fold", !d.present);
      cell.classList.toggle("is-suited", hand.endsWith("s"));
      cell.classList.toggle("is-selected", state.selected === hand);
    }
    applyQuery();
  }

  function cellBackground(d) {
    return cellGradient(d.items, d.fold);
  }




  /* ---------------- 场景切换 ---------------- */
  function selectScenario(id) {
    state.id = id;
    state.selected = null;
    const s = store.get(id);
    const fmt = store.format(s.format);
    try {
      const url = new URL(location.href);
      url.searchParams.set("s", id);
      url.searchParams.set("f", s.format);
      history.replaceState(null, "", url);
    } catch {
      /* file:// 下忽略 */
    }
    $("chart-kicker").textContent = `${fmt.short} · ${LINE_META[s.line].label} · ${LINE_META[s.line].en}`;
    $("chart-title").textContent = s.title;
    $("chart-sub").textContent = s.subtitle;
    $("scenario-note").textContent = s.note;

    const diag = $("table-diagram");
    diag.replaceWith((() => {
      const d = tableDiagram(store.positions, s.actor, s.villain, fmt.seatOrder);
      d.id = "table-diagram";
      return d;
    })());

    renderStats(s);
    renderLegend(s);
    renderBoundary(s);
    paintCells();
    renderInspector(state.selected);
    // 树高亮
    for (const item of treeEl.querySelectorAll(".tree-item")) {
      item.classList.toggle("is-active", item.dataset.id === id);
    }
    $("inspector-tag").textContent = state.selected ? "已锁定" : "悬停";
  }

  function renderStats(s) {
    const wrap = $("chart-stats");
    clear(wrap);
    const agg = store.aggregate(s);
    const cards = [
      ...agg.items.map((it) => ({
        label: it.labelLong,
        color: it.color,
        pct: it.pct,
        combos: it.combos,
      })),
      { label: "弃牌", color: "#4a5d58", pct: agg.fold, combos: (1326 * agg.fold) / 100 },
    ];
    wrap.style.gridTemplateColumns = `repeat(${cards.length}, minmax(0, 1fr))`;
    for (const c of cards) {
      wrap.appendChild(
        el(
          "div",
          { class: "stat-card", style: { "--c": c.color, "--w": `${Math.min(100, c.pct * 1.6)}%` } },
          el(
            "div",
            { class: "sc-main" },
            el("div", { class: "sc-top" }, el("span", { class: "sc-dot" }), el("span", {}, c.label)),
            el("div", { class: "sc-sub" }, `${Math.round(c.combos)} combos`)
          ),
          el("div", { class: "sc-num" }, `${fmt(c.pct)}`, el("small", {}, "%"))
        )
      );
    }
  }

  function renderBoundary(s) {
    const wrap = $("boundary-chips");
    clear(wrap);
    const rows = [];
    for (const hand of ALL_HANDS) {
      const d = store.detail(s, hand);
      if (!d.present) continue;
      const top = d.items.reduce((a, b) => (b.pct > a.pct ? b : a), { pct: 0 });
      if (top.pct >= 15 && top.pct <= 85) rows.push({ hand, top });
    }
    rows.sort((a, b) => b.top.pct - a.top.pct);
    for (const r of rows.slice(0, 12)) {
      wrap.appendChild(
        el(
          "span",
          { class: "b-chip", title: `${r.hand}：${r.top.label} ${fmt(r.top.pct)}%` },
          el("i", { style: { "--c": r.top.color } }),
          r.hand,
          el("b", {}, `${Math.round(r.top.pct)}%`)
        )
      );
    }
    if (!rows.length) wrap.appendChild(el("span", { class: "boundary-tip" }, "这张表基本都是纯策略，没有明显的混合节点。"));
  }

  function renderLegend(s) {
    const wrap = $("legend");
    clear(wrap);
    const agg = store.aggregate(s);
    for (const it of agg.items) {
      wrap.appendChild(
        el(
          "span",
          { class: "legend-item" },
          el("span", { class: "legend-swatch", style: { "--c": it.color } }),
          it.label,
          el("b", {}, `${fmt(it.pct)}%`)
        )
      );
    }
    wrap.appendChild(
      el("span", { class: "legend-item" }, el("span", { class: "legend-swatch", style: { "--c": "#4a5d58" } }), "弃牌", el("b", {}, `${fmt(agg.fold)}%`))
    );
  }

  /* ---------------- 悬停 / 选中 ---------------- */
  function onHover(hand, evt) {
    if (state.selected) return;
    state.hover = hand;
    renderInspector(hand);
    const s = store.get(state.id);
    showTip(store.detail(s, hand), evt);
  }

  function onLeave() {
    state.hover = null;
    hideTip();
    if (!state.selected) renderInspector(null);
  }

  function toggleSelect(hand) {
    state.selected = state.selected === hand ? null : hand;
    for (const [h, cell] of cells) cell.classList.toggle("is-selected", h === state.selected);
    $("inspector-tag").textContent = state.selected ? "已锁定" : "悬停";
    renderInspector(state.selected || state.hover);
    if (!state.selected) hideTip();
  }

  function renderInspector(hand) {
    const wrap = $("hand-detail");
    clear(wrap);
    if (!hand) {
      wrap.appendChild(
        el("div", { class: "hd-empty" }, "把鼠标移到矩阵上查看单手牌的频率构成，点击可锁定，方便边看边对照。")
      );
      return;
    }
    const s = store.get(state.id);
    const d = store.detail(s, hand);
    wrap.appendChild(
      el(
        "div",
        { class: "hd-hand" },
        handCardsEl(hand),
        el(
          "div",
          { class: "hd-meta" },
          el("div", { class: "hd-name" }, hand),
          el(
            "div",
            { class: "hd-sub" },
            `${handKind(hand)} · ${d.combos} 个组合 · ${d.present ? "可玩" : "全弃"}`
          )
        )
      )
    );
    wrap.appendChild(freqRows(d.items, d.fold));
  }

  function handKind(hand) {
    if (!hand) return "";
    if (hand.length === 2) return "对子";
    return hand.endsWith("s") ? "同花" : "非同花";
  }

  function openSizeOf(s) {
    const f = store.format(s.format);
    return f.openSize[s.actor] ?? f.openSize.default;
  }

  /* ---------------- tooltip ---------------- */
  function showTip(d, evt) {
    clear(tooltip);
    tooltip.appendChild(
      el(
        "div",
        { class: "tt-head" },
        el("span", { class: "tt-hand" }, d.hand),
        el("span", { class: "tt-combos" }, `${handKind(d.hand)} · ${d.combos} combos`)
      )
    );
    const rows = el("div", { class: "tt-rows" });
    for (const it of d.items) {
      if (it.pct <= 0.05) continue;
      rows.appendChild(
        el(
          "div",
          { class: "tt-row" },
          el("span", { class: "n" }, it.label),
          el("div", { class: "tt-bar" }, el("i", { style: { width: `${it.pct}%`, background: it.color } })),
          el("span", { class: "v" }, `${fmt(it.pct)}%`)
        )
      );
    }
    if (d.fold > 0.05) {
      rows.appendChild(
        el(
          "div",
          { class: "tt-row" },
          el("span", { class: "n" }, "弃牌"),
          el("div", { class: "tt-bar" }, el("i", { style: { width: `${d.fold}%`, background: "#4a5d58" } })),
          el("span", { class: "v" }, `${fmt(d.fold)}%`)
        )
      );
    }
    tooltip.appendChild(rows);
    tooltip.hidden = false;
    moveTip(evt);
  }

  function moveTip(evt) {
    if (tooltip.hidden) return;
    const pad = 14;
    const rect = tooltip.getBoundingClientRect();
    let x = evt.clientX + 16;
    let y = evt.clientY + 16;
    if (x + rect.width + pad > window.innerWidth) x = evt.clientX - rect.width - 16;
    if (y + rect.height + pad > window.innerHeight) y = evt.clientY - rect.height - 16;
    tooltip.style.left = `${Math.max(pad, x)}px`;
    tooltip.style.top = `${Math.max(pad, y)}px`;
  }

  function hideTip() {
    tooltip.hidden = true;
  }

  /* ---------------- 搜索 ---------------- */
  function applyQuery() {
    const q = state.query.trim().toUpperCase();
    for (const [hand, cell] of cells) {
      const hit = q.length >= 2 && hand.startsWith(q);
      cell.classList.toggle("is-hit", hit);
    }
  }

  $("hand-search").addEventListener("input", (e) => {
    state.query = e.target.value.replace(/\s+/g, "");
    applyQuery();
  });

  window.addEventListener("keydown", (e) => {
    if (document.getElementById("view-ranges").classList.contains("is-active") === false) return;
    if (e.target instanceof HTMLInputElement) {
      if (e.key === "Escape") { e.target.value = ""; state.query = ""; applyQuery(); e.target.blur(); }
      return;
    }
    if (e.key === "Escape" && state.selected) {
      state.selected = null;
      for (const [h, cell] of cells) cell.classList.toggle("is-selected", false);
      $("inspector-tag").textContent = "悬停";
      renderInspector(null);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const list = store.scenariosOf(state.format);
      const idx = list.findIndex((s) => s.id === state.id);
      const next = (idx + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      selectScenario(list[next].id);
    }
  });

  /* ---------------- 初始化 ---------------- */
  buildTree();
  buildGrid();
  selectScenario(state.id);

  const defenseBtn = $("toggle-defense");
  const syncDefenseBtn = () => {
    defenseBtn.classList.toggle("is-on", state.showDefense);
    defenseBtn.setAttribute("aria-pressed", String(state.showDefense));
  };
  syncDefenseBtn();
  $("scenario-count").textContent = `${visibleCount()} 张`;

  defenseBtn.addEventListener("click", () => {
    state.showDefense = !state.showDefense;
    syncDefenseBtn();
    buildTree();
    const cur = store.get(state.id);
    if (!state.showDefense && cur && cur.line !== "rfi") {
      const first = store.lines(state.format, "rfi")[0];
      if (first) selectScenario(first.id);
    } else {
      for (const item of treeEl.querySelectorAll(".tree-item")) {
        item.classList.toggle("is-active", item.dataset.id === state.id);
      }
    }
    $("scenario-count").textContent = `${visibleCount()} 张`;
    fitGrid();
  });

  // 让矩阵按可用空间取最大正方形（高度是瓶颈）
  const wrapEl = gridEl.parentElement;
  const fitGrid = () => {
    const w = wrapEl.clientWidth;
    const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 1024px)").matches;
    const h = narrow ? w : wrapEl.clientHeight - 26;
    const size = Math.max(240, Math.min(w, h, 780));
    gridEl.style.width = `${Math.floor(size)}px`;
    gridEl.style.height = `${Math.floor(size)}px`;
  };
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(fitGrid).observe(wrapEl);
  }
  window.addEventListener("resize", fitGrid);
  requestAnimationFrame(fitGrid);

  function setFormat(formatId) {
    if (!formatId || formatId === state.format) return;
    state.format = formatId;
    state.selected = null;
    state.query = "";
    $("hand-search").value = "";
    buildTree();
    const first = store.scenariosOf(formatId)[0];
    if (first) selectScenario(first.id);
    $("scenario-count").textContent = `${visibleCount()} 张`;
    fitGrid();
  }

  return { selectScenario, setFormat };
}
