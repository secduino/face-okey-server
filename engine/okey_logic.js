// /engine/okey_logic.js

const {
  sortTiles,
  sameTile,
  isRealJoker,
  isFakeJoker,
  applyOkey,
  isSequential,
  isSameNumberDifferentColors
} = require("./tile_util");

// -------------------------------------------------------------
//   SERİ KONTROLÜ (ör: aynı renk → 5-6-7-8)
// -------------------------------------------------------------
function isValidRun(group, okeyTile) {
  if (group.length < 3) return false;

  // okeyleri dışarı al
  const jokers = group.filter(t => isRealJoker(t) || isFakeJoker(t));
  const normals = group.filter(t => !isRealJoker(t) && !isFakeJoker(t));

  if (normals.length === 0) return false;

  // renk aynı olmalı
  const firstColor = applyOkey(normals[0], okeyTile).color;
  for (const tile of normals) {
    const tt = applyOkey(tile, okeyTile);
    if (tt.color !== firstColor) return false;
  }

  // sıralama
  const sorted = normals
    .map(t => applyOkey(t, okeyTile))
    .sort((a, b) => a.number - b.number);

  let gaps = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const n1 = sorted[i].number;
    const n2 = sorted[i + 1].number;

    if (n2 === n1 + 1) continue;

    // eksik sayı → gap
    // Ör: 3,5 (4 eksik)
    const missing = (n2 - n1 - 1);
    gaps += missing;
  }

  // okey sayısı gap’leri kapatmalıdır
  return jokers.length >= gaps;
}

// -------------------------------------------------------------
//   PER KONTROLÜ (aynı numara → farklı renkler 7-7-7-7)
// -------------------------------------------------------------
function isValidSet(group, okeyTile) {
  if (group.length < 3) return false;

  const jokers = group.filter(t => isRealJoker(t) || isFakeJoker(t));
  const normals = group.filter(t => !isRealJoker(t) && !isFakeJoker(t));

  if (normals.length === 0) return false;

  // normal taş numaraları aynı olmalı
  const num = applyOkey(normals[0], okeyTile).number;
  for (const t of normals) {
    const tt = applyOkey(t, okeyTile);
    if (tt.number !== num) return false;
  }

  // renkler çakışmamalı
  const colors = new Set();
  for (const t of normals) {
    const tt = applyOkey(t, okeyTile);
    if (colors.has(tt.color)) return false;
    colors.add(tt.color);
  }

  // per zaten garanti, joker gerekmez
  return true;
}

// -------------------------------------------------------------
//   GRUP GEÇERLİ Mİ?  (serı veya per olabilir)
// -------------------------------------------------------------
function isValidGroup(group, okeyTile) {
  return isValidRun(group, okeyTile) || isValidSet(group, okeyTile);
}

// -------------------------------------------------------------
//  ELİ ANALİZ ET – TÜM GRUPLAR GEÇERLİ Mİ?
// -------------------------------------------------------------
function analyzeHand(hand, okeyTile) {
  // 15 taşlı elde 1 taş atılacağı için 14 taş grup yapmak gerekir.
  if (hand.length !== 14) {
    return {
      valid: false,
      groups: [],
      reason: "14 taş yok"
    };
  }

  const tiles = sortTiles(hand);

  // brute force → 14 taşın tüm kombolarını deneme
  // (performans için optimize edilebilir ama şu anlık yeterli)
  function canGroup(list, groups) {
    if (list.length === 0) {
      return { ok: true, groups };
    }

    // 3–4 taşlı grup almayı dene
    for (let size = 3; size <= 4; size++) {
      if (list.length < size) continue;

      // ilk “size” kadar taş
      const group = list.slice(0, size);
      if (isValidGroup(group, okeyTile)) {
        const rest = list.slice(size);
        const r = canGroup(rest, [...groups, group]);
        if (r.ok) return r;
      }
    }

    return { ok: false };
  }

  const result = canGroup(tiles, []);

  return {
    valid: result.ok,
    groups: result.groups || [],
    reason: result.ok ? "OK" : "geçerli grup dizilimi bulunamadı"
  };
}

// -------------------------------------------------------------
//   EL BİTTİ Mİ? (14 taş + bir taş atma sonrası)
// -------------------------------------------------------------
function isHandWinning(hand, lastTile, okeyTile) {
  if (!lastTile) return false;

  // oyuncunun 15. taşı: son çektiği
  const full = [...hand, lastTile];

  if (full.length !== 15) return false;

  // bir taş at → 14 taşlık el oluştur
  for (let i = 0; i < full.length; i++) {
    const candidate = full.slice();
    candidate.splice(i, 1); // ith taşı at → el 14 oluyor

    const result = analyzeHand(candidate, okeyTile);

    if (result.valid) {
      return true;
    }
  }

  return false;
}

// -------------------------------------------------------------
module.exports = {
  isValidRun,
  isValidSet,
  isValidGroup,
  analyzeHand,
  isHandWinning
};
