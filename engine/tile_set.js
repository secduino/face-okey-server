// /engine/tile_util.js

// -------------------------------------------------------------
// OKEY MOTORU TAŞ YARDIMCI FONKSİYONLARI
// -------------------------------------------------------------
//
// TAŞ OBJESİ FORMAT:
// Normal taş: { color: "blue", number: 5, fakeJoker: false }
// Sahte okey: { color: "joker", number: 0, fakeJoker: true }
//
// RENKLER: blue, red, black, green
// SAYILAR: 1-13
// -------------------------------------------------------------

const VALID_COLORS = ["blue", "red", "black", "green"];

// -------------------------------------------------------------
// Taşın sıralama değeri
// -------------------------------------------------------------
function tileSortValue(tile) {
  if (tile.fakeJoker) return 9999;
  if (tile.color === "joker") return 9998;
  return tile.number;
}

// -------------------------------------------------------------
// Taşları sırala (sayı → renk)
// -------------------------------------------------------------
function sortTiles(hand) {
  const colorOrder = { blue: 0, red: 1, black: 2, green: 3, joker: 4 };
  
  return hand.slice().sort((a, b) => {
    const av = tileSortValue(a);
    const bv = tileSortValue(b);
    if (av !== bv) return av - bv;
    return (colorOrder[a.color] || 0) - (colorOrder[b.color] || 0);
  });
}

// -------------------------------------------------------------
// İki taş aynı mı?
// -------------------------------------------------------------
function sameTile(a, b) {
  if (!a || !b) return false;
  return (
    a.color === b.color &&
    a.number === b.number &&
    !!a.fakeJoker === !!b.fakeJoker
  );
}

// -------------------------------------------------------------
// Sahte okey mi? (joker taşları)
// -------------------------------------------------------------
function isFakeJoker(tile) {
  return tile.fakeJoker === true;
}

// -------------------------------------------------------------
// Normal taş mı?
// -------------------------------------------------------------
function isNormalTile(tile) {
  return !isFakeJoker(tile) && tile.color !== "joker";
}

// -------------------------------------------------------------
// Renk geçerli mi?
// -------------------------------------------------------------
function isValidColor(color) {
  return VALID_COLORS.includes(color);
}

// -------------------------------------------------------------
// Taş okey mi? (okeyTile ile karşılaştır)
// 
// Bir taş okey sayılır eğer:
// 1. Sahte okey (joker) ise
// 2. Göstergenin bir üstü ise (aynı renk, number+1)
// -------------------------------------------------------------
function isOkeyTile(tile, okeyTile) {
  if (isFakeJoker(tile)) return true;
  
  return (
    tile.color === okeyTile.color &&
    tile.number === okeyTile.number
  );
}

// -------------------------------------------------------------
// Taşı okey olarak uygula
// 
// Sahte okey veya gerçek okey taşı → joker gibi davranır
// Normal taş → olduğu gibi döner
// -------------------------------------------------------------
function applyOkey(tile, okeyTile) {
  if (!tile) return null;

  // Sahte okey (joker) → wildcard olarak işaretlenir
  if (isFakeJoker(tile)) {
    return {
      ...tile,
      isWildcard: true
    };
  }

  // Gerçek okey taşı → wildcard olarak işaretlenir
  if (isOkeyTile(tile, okeyTile)) {
    return {
      ...tile,
      isWildcard: true
    };
  }

  // Normal taş
  return tile;
}

// -------------------------------------------------------------
// Wildcard mı? (okey veya sahte okey)
// -------------------------------------------------------------
function isWildcard(tile, okeyTile) {
  return isFakeJoker(tile) || isOkeyTile(tile, okeyTile);
}

// -------------------------------------------------------------
// Taşın görüntü değeri (debug/log için)
// -------------------------------------------------------------
function tileToString(tile) {
  if (isFakeJoker(tile)) return "JOKER";
  return `${tile.color}-${tile.number}`;
}

// -------------------------------------------------------------
module.exports = {
  VALID_COLORS,
  tileSortValue,
  sortTiles,
  sameTile,
  isFakeJoker,
  isNormalTile,
  isValidColor,
  isOkeyTile,
  applyOkey,
  isWildcard,
  tileToString
};
