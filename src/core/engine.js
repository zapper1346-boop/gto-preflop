/**
 * 数据索引与判定引擎（浏览器端）
 */
import { ALL_HANDS, combos, TOTAL_COMBOS } from "./hands.js";

export const LINE_META = {
  rfi: { label: "开牌", en: "RFI", color: "#2bd9a6" },
  vsrfi: { label: "面对开池", en: "vs RFI", color: "#ff9a4d" },
  vs3bet: { label: "面对 3-Bet", en: "vs 3-Bet", color: "#ffc24d" },
};

export const FOLD_COLOR = "#17211f";

export function fmtPct(v, digits = 1) {
  const n = Number(v) || 0;
  const s = n.toFixed(digits);
  return s.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

export async function loadStore(url = "data/ranges.json") {
  // 单文件版：数据已经内联进页面，不需要 fetch（file:// 也能跑）
  if (typeof window !== "undefined" && window.__RANGES__) {
    return createStore(window.__RANGES__);
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`范围数据加载失败（HTTP ${res.status}）`);
  return createStore(await res.json());
}

export function createStore(data) {
  const scenarios = data.scenarios;
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const formats = data.formats || [];
  const formatById = new Map(formats.map((f) => [f.id, f]));
  const DEFAULT = data.meta?.defaultFormat || formats[0]?.id;

  /** 单手握牌的频率明细 */
  function detail(scenario, hand) {
    const arr = scenario.hands[hand];
    const items = scenario.actions.map((key, i) => {
      const meta = data.actions[key];
      const pct = arr && arr[i] != null ? arr[i] : 0;
      return {
        key,
        label: meta.short,
        labelLong: meta.label,
        color: meta.color,
        pct,
        combos: (combos(hand) * pct) / 100,
      };
    });
    const used = items.reduce((a, b) => a + b.pct, 0);
    const fold = Math.max(0, 100 - used);
    return {
      hand,
      combos: combos(hand),
      items,
      fold,
      present: used > 0.05,
      top: items.reduce((a, b) => (b.pct > a.pct ? b : a), items[0] || { pct: 0, key: "fold" }),
    };
  }

  /** 整张表的动作占比（按组合数加权） */
  function aggregate(scenario) {
    const acc = Object.fromEntries(scenario.actions.map((a) => [a, 0]));
    let usedCombos = 0;
    for (const [hand, arr] of Object.entries(scenario.hands)) {
      const c = combos(hand);
      let used = 0;
      scenario.actions.forEach((key, i) => {
        const pct = arr[i] || 0;
        acc[key] += (c * pct) / 100;
        used += pct;
      });
      usedCombos += (c * Math.min(100, used)) / 100;
    }
    const items = scenario.actions.map((key) => ({
      key,
      label: data.actions[key].short,
      labelLong: data.actions[key].label,
      color: data.actions[key].color,
      combos: acc[key],
      pct: (acc[key] / TOTAL_COMBOS) * 100,
    }));
    return {
      items,
      fold: ((TOTAL_COMBOS - usedCombos) / TOTAL_COMBOS) * 100,
      playable: (usedCombos / TOTAL_COMBOS) * 100,
    };
  }

  function headline(scenario) {
    const agg = aggregate(scenario);
    const top = agg.items.reduce((a, b) => (b.pct > a.pct ? b : a), agg.items[0]);
    return { agg, top };
  }

  /** 判定单手牌：返回所选动作的频率与等级 */
  function grade(scenario, hand, action) {
    const d = detail(scenario, hand);
    const chosen =
      action === "fold"
        ? { key: "fold", pct: d.fold, color: FOLD_COLOR, label: "弃牌" }
        : d.items.find((i) => i.key === action);
    const pct = chosen ? chosen.pct : 0;
    const best = [...d.items, { key: "fold", pct: d.fold }].reduce((a, b) => (b.pct > a.pct ? b : a));
    let level = "bad";
    let label = "明显偏离";
    if (pct >= 75) {
      level = "good";
      label = "标准打法";
    } else if (pct >= 35) {
      level = "mid";
      label = "可接受的混合";
    } else if (pct >= 10) {
      level = "mid";
      label = "边缘偏离";
    }
    return { pct, best, detail: d, level, label };
  }

  const scenariosOf = (formatId) => scenarios.filter((s) => !formatId || s.format === formatId);

  const handsList = ALL_HANDS;

  return {
    meta: data.meta,
    positions: data.positions,
    actions: data.actions,
    formats,
    scenarios,
    byId,
    detail,
    aggregate,
    headline,
    grade,
    handsList,
    get: (id) => byId.get(id),
    format: (id) => formatById.get(id),
    defaultFormat: DEFAULT,
    scenariosOf,
    lines: (formatId, line) => scenarios.filter((s) => s.format === formatId && s.line === line),
    counts: (formatId) => {
      const c = { rfi: 0, vsrfi: 0, vs3bet: 0 };
      for (const s of scenariosOf(formatId)) c[s.line] = (c[s.line] || 0) + 1;
      return c;
    },
  };
}
