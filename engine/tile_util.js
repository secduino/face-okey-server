// /engine/tile_util.js

//---------------------------------------------------------------------
//  OKEY MOTORU TAŞ YARDIMCI FONKSİYONLARI
//---------------------------------------------------------------------

// TAŞ OBJESİ FORMAT:
// { color: "blue", number: 1, fakeJoker: false }
//
// Gerçek jokerler:
// { color: "joker", number: 0, fakeJoker: false }
//
// Sahte okey:
// { ..., fakeJoker: true }
//
//---------------------------------------------------------------------

// Taşın "sıralama değeri"
// Amaç: per / seri / set hesaplamasında sıralamayı kolaylaştırmak.
function tileSortValue(tile) {
  if (tile.fakeJoker) return 9999;        // sahte okey en sona
  if (tile.color === "joker") return 9998; // gerçek joker
  return tile.number;                     // normal taşlar
}

// Basit sıralama (küçükten → büyüğe)
function sortTiles(hand) {
  return hand.slice().sort((a, b) => {
    const av = tileSortValue(a);
    const bv = tileSortValue(b);
    if (av !== bv) return av - bv;

    // aynı numarada ise renk sırası ver
    const colorOrder = { blue: 0, black: 1, red: 2, green: 3, joker: 4 };
    return (colorOrder[a.color] || 0) - (colorOrder[b.color] || 0);
  });
}

// İki taş aynı mı?
function sameTile(a, b) {
  if (!a || !b) return false;
  return (
    a.color === b.color &&
    a.number === b.number &&
    !!a.fakeJoker === !!b.fakeJoker
  );
}

// Gerçek joker mi?
function isRealJoker(tile) {
  return tile.color === "joker" && tile.number === 0 && !tile.fakeJoker;
}

// Sahte okey mi?
function isFakeJoker(tile) {
  return tile.fakeJoker === true;
}

// NORMAL TAŞ MI?
function isNormal(tile) {
  return !isRealJoker(tile) && !isFakeJoker(tile);
}

// Renk geçerli mi?
function validColor(color) {
  return ["blue", "black", "red", "green"].includes(color);
}

//---------------------------------------------------------------------
//  Serum: Taşı Okey gibi kullanalım (per hesaplama için)
//
//  ÖNEMLİ: Okey gerçek taş değildir. 
//  Okey taşını kullanırken number/color LOJİKTE değişir.
//---------------------------------------------------------------------
function applyOkey(tile, okeyTile) {
  if (!tile) return null;

  // Taş gerçek jokerdir => okey olarak davranır
  if (isRealJoker(tile)) {
    return {
      color: okeyTile.color,
      number: okeyTile.number,
      fakeJoker: true
    };
  }

  // Sahte okey zaten okey gibi davranır
  if (isFakeJoker(tile)) {
    return {
      color: okeyTile.color,
      number: okeyTile.number,
      fakeJoker: true
    };
  }

  // Normal taş → direkt döndür
  return tile;
}

//---------------------------------------------------------------------
//  Ardışık mı? (seri taş kontrolü 1-2-3-4 gibi)
//---------------------------------------------------------------------
function isSequential(a, b, okeyTile = null) {
  const t1 = okeyTile ? applyOkey(a, okeyTile) : a;
  const t2 = okeyTile ? applyOkey(b, okeyTile) : b;

  if (t1.color !== t2.color) return false;
  if (!validColor(t1.color)) return false;

  return t2.number === t1.number + 1 ||
    (t1.number === 13 && t2.number === 1); // 13 → 1 wrap
}

//---------------------------------------------------------------------
//  Aynı sayı farklı renk kontrolü (set = 7–7–7–7)
//---------------------------------------------------------------------
function isSameNumberDifferentColors(tiles, okeyTile = null) {
  let baseNumber = null;
  const usedColors = new Set();

  for (const tile of tiles) {
    let t = okeyTile ? applyOkey(tile, okeyTile) : tile;

    if (isRealJoker(tile) || isFakeJoker(tile)) continue;

    if (baseNumber === null) baseNumber = t.number;
    if (t.number !== baseNumber) return false;

    if (usedColors.has(t.color)) return false;
    usedColors.add(t.color);
  }

  return true;
}

module.exports = {
  sortTiles,
  tileSortValue,
  sameTile,
  isNormal,
  isRealJoker,
  isFakeJoker,
  validColor,
  applyOkey,
  isSequential,
  isSameNumberDifferentColors
};
