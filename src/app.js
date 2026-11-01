import { loadStore } from "./core/engine.js";
import { initRangeView } from "./views/rangeView.js";
import { initTrainerView } from "./views/trainerView.js";
import { initReviewView } from "./views/reviewView.js";

const views = {
  ranges: document.getElementById("view-ranges"),
  trainer: document.getElementById("view-trainer"),
  review: document.getElementById("view-review"),
};

let store = null;
let rangeView = null;
let trainerView = null;
let reviewView = null;

const state = { format: null };

/** 解算结果 + 人数 → 标准；Cash 最多 6 人，MTT 支持 3–9 人 */
const GAME_FORMAT = {
  cash: { 3: "cash_3", 4: "cash_4", 5: "cash_5", 6: "6max_cash_100" },
  mtt: { 3: "mtt_3", 4: "mtt_4", 5: "mtt_5", 6: "mtt_6", 7: "mtt_7", 8: "mtt_8", 9: "9max_mtt_50" },
};

function configOf(formatId) {
  for (const [game, map] of Object.entries(GAME_FORMAT)) {
    for (const [p, id] of Object.entries(map)) if (id === formatId) return { game, players: Number(p) };
  }
  return { game: "cash", players: 6 };
}

/** 当前解算结果下没有该人数时，自动切到另一边（比如 Cash + 8 → MTT 8） */
function resolve(game, players) {
  if (GAME_FORMAT[game]?.[players]) return { game, id: GAME_FORMAT[game][players] };
  const other = game === "cash" ? "mtt" : "cash";
  if (GAME_FORMAT[other]?.[players]) return { game: other, id: GAME_FORMAT[other][players] };
  return null;
}

/* ---------------- 页签 ---------------- */
function switchTab(name) {
  for (const [key, node] of Object.entries(views)) node.classList.toggle("is-active", key === name);
  for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("is-active", tab.dataset.tab === name);
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
}

/* ---------------- 解算设置面板 ---------------- */
const panelEl = () => document.getElementById("settings-panel");
const settingsBtn = () => document.getElementById("settings-btn");

function closeSettings() {
  panelEl().hidden = true;
  settingsBtn().setAttribute("aria-expanded", "false");
}

function toggleSettings() {
  const open = panelEl().hidden;
  panelEl().hidden = !open;
  settingsBtn().setAttribute("aria-expanded", String(open));
}

function renderSettings() {
  const cfg = configOf(state.format);
  document.getElementById("settings-summary").textContent = `${cfg.game === "cash" ? "Cash" : "MTT"} · ${cfg.players} 人桌`;

  for (const b of document.querySelectorAll("[data-game]")) {
    b.classList.toggle("is-active", b.dataset.game === cfg.game);
  }
  for (const b of document.querySelectorAll("[data-players]")) {
    b.classList.toggle("is-active", Number(b.dataset.players) === cfg.players);
  }
}

function syncFormatUI(id) {
  const f = store.format(id);
  document.getElementById("chip-stack").textContent = `${f.stack} BB`;
  document.getElementById("chip-ante").textContent = f.ante ? `ante ${f.ante}bb` : "无 ante";
  document.getElementById("side-standard").textContent = `${f.label} ${f.stack}bb`;
  renderSettings();
}

function setFormat(id) {
  if (!id || id === state.format || !store.format(id)) return;
  state.format = id;
  syncFormatUI(id);
  rangeView.setFormat(id);
  trainerView.setFormat(id);
  reviewView.setFormat(id);
  try {
    const url = new URL(location.href);
    url.searchParams.set("f", id);
    url.searchParams.delete("s");
    history.replaceState(null, "", url);
  } catch {
    /* ignore */
  }
  closeSettings();
}

/* ---------------- 绑定 ---------------- */
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
}
document.querySelector(".brand").addEventListener("click", (e) => {
  e.preventDefault();
  switchTab("ranges");
});

settingsBtn().addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSettings();
});

panelEl().addEventListener("click", (e) => {
  const chip = e.target.closest(".sp-chip");
  if (!chip || chip.disabled) return;
  const cfg = configOf(state.format);
  if (chip.dataset.game) {
    const game = chip.dataset.game;
    const keep = GAME_FORMAT[game]?.[cfg.players];
    const players = keep ? cfg.players : Number(Object.keys(GAME_FORMAT[game] || {})[0]);
    const r = resolve(game, players);
    if (r) setFormat(r.id);
  } else if (chip.dataset.players) {
    const r = resolve(cfg.game, Number(chip.dataset.players));
    if (r) setFormat(r.id);
  }
});

document.addEventListener("click", (e) => {
  if (panelEl().hidden) return;
  if (e.target.closest("#settings")) return;
  closeSettings();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panelEl().hidden) closeSettings();
});

function showFatal(err) {
  const main = document.getElementById("main");
  main.innerHTML = "";
  const box = document.createElement("div");
  box.style.cssText =
    "max-width:640px;margin:14vh auto;padding:28px;border:1px solid rgba(255,107,122,.3);border-radius:16px;background:rgba(255,107,122,.05);font-size:14px;line-height:1.8;color:#e9f2ef";
  box.innerHTML = `<h2 style="margin:0 0 10px;font-size:18px">数据加载失败</h2>
    <p style="color:#93a8a4;margin:0 0 12px">${String(err.message || err)}</p>
    <p style="color:#61756f;font-size:12px;margin:0">请通过本地服务器访问（<code>node server.mjs</code>），不要直接双击 index.html。</p>`;
  main.appendChild(box);
}

async function boot() {
  const hash = location.hash.slice(1);
  if (views[hash]) switchTab(hash);
  try {
    store = await loadStore("data/ranges.json");
    const params = new URLSearchParams(location.search);
    const wanted = params.get("f");
    state.format = store.format(wanted)?.id || store.defaultFormat;

    rangeView = initRangeView(store, state.format);
    trainerView = initTrainerView(store, state.format);
    reviewView = initReviewView(store, state.format);
    syncFormatUI(state.format);
    document.body.classList.add("is-ready");
  } catch (err) {
    console.error(err);
    showFatal(err);
  }
}

boot();
