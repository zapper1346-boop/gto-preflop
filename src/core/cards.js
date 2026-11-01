/** 扑克牌工具 */
export const SUITS = [
  { key: "s", glyph: "♠", name: "黑桃", red: false },
  { key: "h", glyph: "♥", name: "红桃", red: true },
  { key: "d", glyph: "♦", name: "方片", red: true },
  { key: "c", glyph: "♣", name: "梅花", red: false },
];

export const SUIT_MAP = Object.fromEntries(SUITS.map((s) => [s.key, s]));
export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** "As" / "Ah" -> {rank, suit} */
export function parseCard(text) {
  const m = /^([AKQJT2-9])([shdc])$/i.exec(String(text).trim());
  if (!m) return null;
  return { rank: m[1].toUpperCase(), suit: m[2].toLowerCase() };
}

export function cardOf(rank, suit) {
  return { rank, suit };
}

/** 两张牌的手牌代号：AsKd -> AKo；AsKs -> AKs；AsAh -> AA */
export function handClassOf(a, b) {
  if (!a || !b) return null;
  if (a.rank === b.rank) return a.rank + b.rank;
  const [hi, lo] = RANKS.indexOf(a.rank) < RANKS.indexOf(b.rank) ? [a, b] : [b, a];
  return hi.rank + lo.rank + (a.suit === b.suit ? "s" : "o");
}

/** 由手牌代号推一副“示意牌”，用于展示（不影响判定） */
export function sampleCards(hand) {
  if (!hand) return null;
  if (hand.length === 2) {
    return [cardOf(hand[0], "s"), cardOf(hand[1], "h")];
  }
  const hi = hand[0];
  const lo = hand[1];
  const suited = hand.endsWith("s");
  const suitA = suited ? "s" : "s";
  const suitB = suited ? "s" : "h";
  return [cardOf(hi, suitA), cardOf(lo, suitB)];
}

export function randomHoleCards() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(cardOf(r, s.key));
  const i = Math.floor(Math.random() * deck.length);
  const first = deck.splice(i, 1)[0];
  const j = Math.floor(Math.random() * deck.length);
  const second = deck.splice(j, 1)[0];
  return [first, second];
}
