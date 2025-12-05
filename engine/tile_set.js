// /engine/tile_set.js

// -------------------------------------------------------------
// OKEY OYUNU TAŞ SETİ
// 
// KURALLAR:
// - 106 taş toplam (104 normal + 2 sahte okey)
// - 4 renk: Mavi, Kırmızı, Siyah, Yeşil
// - Her renkte 1-13 arası sayılar, her taştan 2'şer adet
// - 2 adet sahte okey (joker)
// -------------------------------------------------------------

const COLORS = ["blue", "red", "black", "green"];
const MIN_NUMBER = 1;
const MAX_NUMBER = 13;

// -------------------------------------------------------------
// 1) 106 TAŞ OLUŞTURMA
// -------------------------------------------------------------
function createTileDeck() {
  const deck = [];

  // 4 renk x 13 sayı x 2 adet = 104 taş
  for (const color of COLORS) {
    for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) {
      // Her taştan 2 adet (aynı renk, aynı sayı)
      deck.push({ color, number: n, fakeJoker: false });
      deck.push({ color, number: n, fakeJoker: false });
    }
  }

  // 2 adet sahte okey (joker)
  deck.push({ color: "joker", number: 0, fakeJoker: true });
  deck.push({ color: "joker", number: 0, fakeJoker: true });

  return deck; // Toplam: 106 taş
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
// 
// Gösterge = joker olmayan rastgele bir taş
// Okey = göstergenin aynı renk + number+1 (13 ise → 1)
// -------------------------------------------------------------
function pickIndicatorAndOkey(deck) {
  // Joker olmayan bir taş bul
  const idx = deck.findIndex(t => t.color !== "joker");
  if (idx === -1) {
    return { deck, indicator: null, okeyTile: null };
  }

  const indicator = deck[idx];

  // Gösterge taşı desteden çıkarılır (toplam 1 taş kullanıldı)
  deck.splice(idx, 1);

  // Okey taşını belirle: göstergenin bir üstü
  const okeyNumber = indicator.number === MAX_NUMBER ? MIN_NUMBER : indicator.number + 1;

  const okeyTile = {
    color: indicator.color,
    number: okeyNumber,
    fakeJoker: false
  };

  return { deck, indicator, okeyTile };
}

// -------------------------------------------------------------
// ANA FONKSİYON → Deste hazır + karışmış + okey belirlenmiş
// 
// Dönüş:
// - deck: 105 taş (gösterge çıkarıldı)
// - indicator: gösterge taşı
// - okeyTile: okey taşı bilgisi
// -------------------------------------------------------------
function generateFullSet() {
  let deck = createTileDeck(); // 106 taş
  shuffle(deck);

  const result = pickIndicatorAndOkey(deck);
  deck = result.deck; // 105 taş kaldı

  return {
    deck,
    indicator: result.indicator,
    okeyTile: result.okeyTile
  };
}

// -------------------------------------------------------------
// SABÎTLER EXPORT
// -------------------------------------------------------------
module.exports = {
  COLORS,
  MIN_NUMBER,
  MAX_NUMBER,
  createTileDeck,
  shuffle,
  pickIndicatorAndOkey,
  generateFullSet
};
