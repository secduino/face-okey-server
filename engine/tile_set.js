// /engine/tile_set.js

// -------------------------------------------------------------
// 1) 106 TAŞ OLUŞTURMA
// colors = blue, black, red, green
// 1–13 arası iki set
// +2 joker
// -------------------------------------------------------------
function createTileDeck() {
  const deck = [];
  const colors = ["blue", "black", "red", "green"];

  for (const color of colors) {
    for (let n = 1; n <= 13; n++) {
      deck.push({ color, number: n, fakeJoker: false });
      deck.push({ color, number: n, fakeJoker: false });
    }
  }

  // gerçek jokerler (sahte okey değil)
  deck.push({ color: "joker", number: 0, fakeJoker: false });
  deck.push({ color: "joker", number: 0, fakeJoker: false });

  return deck;
}

// -------------------------------------------------------------
// 2) Fisher–Yates Shuffle
// -------------------------------------------------------------
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// -------------------------------------------------------------
// 3) Gösterge + Okey Belirleme
// Gösterge = joker olmayan ilk taş
// Okey = aynı renk + number+1  (13 → 1)
// -------------------------------------------------------------
function pickOkey(deck) {
  const idx = deck.findIndex(t => t.color !== "joker");
  if (idx === -1) {
    return { deck, indicator: null, okey: null };
  }

  const indicator = deck[idx];

  // indicator taş desteden çıkarılır!
  deck.splice(idx, 1);

  const nextNum = indicator.number === 13 ? 1 : indicator.number + 1;

  const okey = {
    color: indicator.color,
    number: nextNum,
    fakeJoker: false
  };

  return { deck, indicator, okey };
}

// -------------------------------------------------------------
// ANA FONKSİYON → Deste hazır + karışmış + okey belirlenmiş
// -------------------------------------------------------------
function generateFullSet() {
  let deck = createTileDeck();
  shuffle(deck);

  const result = pickOkey(deck);
  deck = result.deck;

  return {
    deck,                // karışmış deste
    indicator: result.indicator, // gösterge taşı
    okey: result.okey           // okey taşı
  };
}

module.exports = {
  generateFullSet
};
