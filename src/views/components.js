/** 轻量 DOM 构建与共用视觉组件 */

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "html") node.innerHTML = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== "list" && typeof v !== "object") node[k] = v;
    else node.setAttribute(k, v);
  }
  append(node, kids);
  return node;
}

export function append(node, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(node, kid);
    else if (kid instanceof Node) node.appendChild(kid);
    else node.appendChild(document.createTextNode(String(kid)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ---------------- 扑克牌 ---------------- */
const SUIT_GLYPH = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_NAME = { s: "黑桃", h: "红桃", d: "方块", c: "梅花" };

export function cardEl(card) {
  return el(
    "div",
    {
      class: `playing-card suit-${card.suit}`,
      title: `${card.rank}${SUIT_GLYPH[card.suit]}（${SUIT_NAME[card.suit]}）`,
    },
    el("span", { class: "pc-rank" }, card.rank),
    el("span", { class: "pc-suit" }, SUIT_GLYPH[card.suit])
  );
}

export function cardsForHand(hand) {
  if (!hand) return [];
  if (hand.length === 2) {
    return [
      { rank: hand[0], suit: "s" },
      { rank: hand[1], suit: "h" },
    ];
  }
  const [hi, lo] = [hand[0], hand[1]];
  const suited = hand.endsWith("s");
  return [
    { rank: hi, suit: "s" },
    { rank: lo, suit: suited ? "s" : "h" },
  ];
}

export function handCardsEl(hand, cls = "") {
  return el("div", { class: `hd-cards ${cls}`.trim() }, cardsForHand(hand).map((c) => cardEl(c)));
}

/* ---------------- 频率条 ---------------- */
export function freqRows(items, fold, opts = {}) {
  const { compact = false } = opts;
  const rows = [];
  for (const it of items) {
    rows.push(
      el(
        "div",
        { class: `freq-row ${it.pct < 0.05 ? "is-zero" : ""}`.trim() },
        el("span", { class: "freq-name" }, it.label),
        el("div", { class: "freq-bar" }, el("i", { style: { width: `${it.pct}%`, background: it.color } })),
        el("span", { class: "freq-val" }, `${fmt(it.pct)}%`)
      )
    );
  }
  if (fold != null) {
    rows.push(
      el(
        "div",
        { class: `freq-row ${fold < 0.05 ? "is-zero" : ""}`.trim() },
        el("span", { class: "freq-name" }, "弃牌"),
        el("div", { class: "freq-bar" }, el("i", { style: { width: `${fold}%`, background: "#4a5d58" } })),
        el("span", { class: "freq-val" }, `${fmt(fold)}%`)
      )
    );
  }
  return el("div", { class: "freq-list", style: compact ? { gap: "6px" } : null }, rows);
}

export function fmt(v, d = 1) {
  const n = Number(v) || 0;
  return n.toFixed(d).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

/* ---------------- 频率底色 ---------------- */
const FOLD_FILL = "repeating-linear-gradient(45deg, #0e1816 0 5px, #0b1312 5px 10px)";
const SEAM = "rgba(3,8,7,.9)";

export function cellGradient(items, fold) {
  const segs = items.filter((i) => i.pct > 0.05).map((i) => ({ color: i.color, w: i.pct }));
  if (fold > 0.05) segs.push({ color: "#1c2926", w: fold });
  if (!segs.length) return FOLD_FILL;
  if (segs.length === 1) return segs[0].color;

  let cursor = 0;
  const parts = [];
  segs.forEach((s, i) => {
    const from = cursor;
    const to = from + s.w;
    parts.push(`${s.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
    cursor = to;
    if (i < segs.length - 1) {
      parts.push(`${SEAM} ${to.toFixed(2)}% ${(to + 0.45).toFixed(2)}%`);
      cursor = to + 0.45;
    }
  });
  return `linear-gradient(100deg, ${parts.join(", ")})`;
}

/* ---------------- 牌桌示意 ---------------- */
export function tableDiagram(positions, actor, villain, seatOrder = ["BTN", "SB", "BB", "UTG", "HJ", "CO"]) {
  const n = Math.max(2, seatOrder.length);
  const rx = n > 6 ? 40 : 42;
  const ry = n > 6 ? 37 : 40;
  const seats = seatOrder.map((id, i) => {
    const angle = ((-90 + (360 / n) * i) * Math.PI) / 180;
    return {
      id,
      left: `${50 + rx * Math.cos(angle)}%`,
      top: `${50 + ry * Math.sin(angle)}%`,
    };
  });
  return el(
    "div",
    { class: "table-diagram", dataset: { n: String(n) } },
    el("div", { class: "table-felt" }),
    seats.map((s) =>
      el(
        "div",
        {
          class: `seat ${s.id === actor ? "is-hero" : ""} ${s.id === villain ? "is-villain" : ""}`.trim(),
          style: { left: s.left, top: s.top },
          title: positions[s.id]?.name || s.id,
        },
        positions[s.id]?.id || s.id
      )
    )
  );
}

/* ---------------- 小徽标 ---------------- */
export function verdictPill(level, label) {
  return el("span", { class: `rv-verdict ${level}` }, label);
}

export function badge(level, text) {
  const cls = level === "good" ? "good" : level === "bad" ? "bad" : "mid";
  return el("span", { class: `fb-badge ${cls}` }, text);
}
