// /engine/game_rules.js

const {
  isValidRun,
  isValidSet,
  isValidGroup,
  analyzeHand,
  isHandWinning
} = require("./okey_logic");

// -------------------------------------------------------------
//  TAŞ TEMEL KARŞILAŞTIRMA
// -------------------------------------------------------------
function sameTile(a, b) {
  return (
    a.color === b.color &&
    a.number === b.number &&
    !!a.fakeJoker === !!b.fakeJoker
  );
}

// -------------------------------------------------------------
//   TAŞLARI SIRALA (renk → numara)
// -------------------------------------------------------------
function sortTiles(list) {
  const colorOrder = { blue: 1, black: 2, red: 3, green: 4, joker: 5 };
  return list.slice().sort((a, b) => {
    const ca = colorOrder[a.color] || 99;
    const cb = colorOrder[b.color] || 99;
    if (ca !== cb) return ca - cb;
    return a.number - b.number;
  });
}

// -------------------------------------------------------------
//   GERÇEK JOKER Mİ?
// -------------------------------------------------------------
function isRealJoker(tile) {
  return tile.color === "joker" && tile.number === 0;
}

// -------------------------------------------------------------
//   SAHTE OKEY Mİ?
// -------------------------------------------------------------
function isFakeJoker(tile) {
  return tile.fakeJoker === true;
}

// -------------------------------------------------------------
//   OKEY UYGULA
// -------------------------------------------------------------
function applyOkey(tile, okeyTile) {
  if (isFakeJoker(tile)) {
    // sahte okey → gerçek okeyin yerine geçer
    return {
      color: okeyTile.color,
      number: okeyTile.number,
      fakeJoker: true
    };
  }

  return tile;
}

// -------------------------------------------------------------
//   SERİ KONTROLÜ (ör: 4-5-6-7 aynı renk)
// -------------------------------------------------------------
function isSequential(group, okeyTile) {
  return isValidRun(group, okeyTile);
}

// -------------------------------------------------------------
//   PER KONTROLÜ (aynı sayı farklı renkler)
// -------------------------------------------------------------
function isSameNumberDifferentColors(group, okeyTile) {
  return isValidSet(group, okeyTile);
}

// -------------------------------------------------------------
//   14 TAŞLIK EL GEÇERLİ Mİ?
// -------------------------------------------------------------
function validateHand14(tiles, okeyTile) {
  return analyzeHand(tiles, okeyTile);
}

// -------------------------------------------------------------
//   EL BİTTİ Mİ (15 taş + atılacak taş analizi)
// -------------------------------------------------------------
function checkWinning(hand, lastTile, okeyTile) {
  return isHandWinning(hand, lastTile, okeyTile);
}

// -------------------------------------------------------------
//   DISCARDED TILE → SAHTE OKEY ALGILAMA
// -------------------------------------------------------------
function isTileFakeJoker(tile, okeyTile) {
  if (tile.color !== "joker" && tile.number !== 0) return false;
  return tile.fakeJoker === true;
}

// -------------------------------------------------------------
module.exports = {
  sameTile,
  sortTiles,
  isRealJoker,
  isFakeJoker,
  applyOkey,
  isSequential,
  isSameNumberDifferentColors,
  validateHand14,
  checkWinning,
  isTileFakeJoker
};
