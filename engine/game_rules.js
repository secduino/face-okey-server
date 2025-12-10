// /engine/game_rules.js

// -------------------------------------------------------------
// OKEY OYUN KURALLARI
// 
// SERİ (Run): Aynı renk, ardışık sayılar (min 3 taş, max 13)
//   Örnek: Mavi 4-5-6-7
//   Özel kural: 11-12-13-1 GEÇERLİDİR. 13-1-2 GEÇERSİZDİR.
//
// PER (Set): Aynı sayı, farklı renkler (min 3, max 4 taş)
//   Örnek: Kırmızı 7, Mavi 7, Siyah 7
// -------------------------------------------------------------

const {
  sortTiles,
  sameTile,
  isFakeJoker,
  isNormalTile,
  isWildcard,
  isValidColor,
  tileToString
} = require("./tile_util");

// -------------------------------------------------------------
// SERİ KONTROLÜ (Run) – DÖNGÜSEL SERİ (13-1) DESTEKLİ
// -------------------------------------------------------------

function isValidRun(tiles, okeyTile) {
  if (tiles.length < 3) return false;

  const wildcards = tiles.filter(t => isWildcard(t, okeyTile));
  const normals = tiles.filter(t => !isWildcard(t, okeyTile));

  if (normals.length === 0) return false;

  const baseColor = normals[0].color;
  for (const tile of normals) {
    if (tile.color !== baseColor) return false;
  }

  if (!isValidColor(baseColor)) return false;

  let numbers = normals.map(t => t.number).sort((a, b) => a - b);

  // Aynı sayı olmamalı
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] === numbers[i + 1]) return false;
  }

  const totalLength = tiles.length;

  // 🔹 DÖNGÜSEL SERİ KONTROLÜ: 1 VE 13 BİRLİKTEYSE
  if (numbers.includes(1) && numbers.includes(13)) {
    // Sadece şu sayılar geçerli: 1, 11, 12, 13
    for (const n of numbers) {
      if (n !== 1 && n !== 11 && n !== 12 && n !== 13) {
        return false;
      }
    }

    // 13-1 serisi sadece 11-12-13-1, 12-13-1 veya 11-13-1 gibi yapılar olabilir
    // Joker ile eksik sayılar tamamlanabilir

    const fullCycle = [11, 12, 13, 1];
    const present = new Set(numbers);
    const missingCount = fullCycle.filter(n => !present.has(n)).length;

    // Joker sayısı eksik sayıyı karşılamalı
    if (wildcards.length < missingCount) return false;

    // Toplam taş >= 3 (zaten sağlanıyor)
    return totalLength >= 3;
  }

  // 🔹 NORMAL SERİ (döngü yok)
  const minNum = numbers[0];
  const maxNum = numbers[numbers.length - 1];
  const minRequiredLength = maxNum - minNum + 1;

  if (totalLength < minRequiredLength) return false;

  if (totalLength === minRequiredLength) {
    const gaps = minRequiredLength - numbers.length;
    return wildcards.length >= gaps;
  }

  // totalLength > minRequiredLength → genişletme
  const gaps = minRequiredLength - numbers.length;
  if (wildcards.length < gaps) return false;

  const remainingWildcards = wildcards.length - gaps;
  const canExpandLeft = minNum - 1;
  const canExpandRight = 13 - maxNum;
  const totalExpansionPossible = canExpandLeft + canExpandRight;

  return remainingWildcards <= totalExpansionPossible;
}

// -------------------------------------------------------------
// PER KONTROLÜ (Set)
// Aynı sayı, farklı renkler, minimum 3 maximum 4 taş
// -------------------------------------------------------------
function isValidSet(tiles, okeyTile) {
  if (tiles.length < 3 || tiles.length > 4) return false;

  const wildcards = tiles.filter(t => isWildcard(t, okeyTile));
  const normals = tiles.filter(t => !isWildcard(t, okeyTile));

  if (normals.length === 0) return false;

  const baseNumber = normals[0].number;
  for (const tile of normals) {
    if (tile.number !== baseNumber) return false;
  }

  const usedColors = new Set();
  for (const tile of normals) {
    if (usedColors.has(tile.color)) return false;
    usedColors.add(tile.color);
  }

  const totalTiles = normals.length + wildcards.length;
  if (totalTiles > 4) return false;

  return true;
}

// -------------------------------------------------------------
// GRUP GEÇERLİ Mİ?
// -------------------------------------------------------------
function isValidGroup(tiles, okeyTile) {
  return isValidRun(tiles, okeyTile) || isValidSet(tiles, okeyTile);
}

// -------------------------------------------------------------
// ÇİFT KONTROLÜ (Okey destekli)
// -------------------------------------------------------------
function isValidPair(tile1, tile2, okeyTile) {
  if (!tile1 || !tile2) return false;
  
  const isOkey1 = isWildcard(tile1, okeyTile);
  const isOkey2 = isWildcard(tile2, okeyTile);
  
  if (isOkey1 && isOkey2) return true;
  if (isOkey1 || isOkey2) return true;
  
  return tile1.color === tile2.color && tile1.number === tile2.number;
}

// -------------------------------------------------------------
// 14 TAŞLIK EL ANALİZİ (Optimize Edilmiş)
// -------------------------------------------------------------
function analyzeHand(tiles, okeyTile) {
  if (tiles.length !== 14) {
    return { valid: false, groups: [], reason: `14 taş gerekli, ${tiles.length} taş var` };
  }

  function backtrack(remaining, groups) {
    if (remaining.length === 0) {
      return { valid: true, groups: groups };
    }
    
    if (remaining.length < 3) {
      return { valid: false };
    }

    const firstTile = remaining[0];
    const rest = remaining.slice(1);
    
    for (let size = 3; size <= Math.min(13, remaining.length); size++) {
      const combosWithFirst = getCombinationsWithFirst(remaining, size);
      
      for (const combo of combosWithFirst) {
        if (isValidGroup(combo, okeyTile)) {
          const newRemaining = removeFromArray(remaining, combo);
          const result = backtrack(newRemaining, [...groups, combo]);
          if (result.valid) {
            return result;
          }
        }
      }
    }
    
    return { valid: false };
  }

  const result = backtrack([...tiles], []);
  
  return {
    valid: result.valid,
    groups: result.groups || [],
    reason: result.valid ? "OK" : "Geçerli grup dizilimi bulunamadı"
  };
}

// Yardımcı fonksiyonlar
function getCombinationsWithFirst(arr, size) {
  if (size < 1 || arr.length < size) return [];
  const first = arr[0];
  const rest = arr.slice(1);
  if (size === 1) return [[first]];
  const subCombos = getCombinations(rest, size - 1);
  return subCombos.map(combo => [first, ...combo]);
}

function getCombinations(arr, size) {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const result = [];
  for (let i = 0; i <= arr.length - size; i++) {
    const first = arr[i];
    const rest = arr.slice(i + 1);
    const subCombos = getCombinations(rest, size - 1);
    for (const combo of subCombos) {
      result.push([first, ...combo]);
    }
  }
  return result;
}

function removeFromArray(arr, toRemove) {
  const result = [...arr];
  for (const item of toRemove) {
    const idx = result.findIndex(t => 
      t.color === item.color && 
      t.number === item.number && 
      !!t.fakeJoker === !!item.fakeJoker
    );
    if (idx !== -1) {
      result.splice(idx, 1);
    }
  }
  return result;
}

// -------------------------------------------------------------
// EL BİTTİ Mİ? (15 taş)
// -------------------------------------------------------------
function checkWinning(hand, okeyTile) {
  if (hand.length !== 15) {
    console.log("❌ checkWinning: 15 taş gerekli, mevcut:", hand.length);
    return { won: false, reason: "15 taş gerekli" };
  }

  console.log("🎯 checkWinning başladı");
  console.log("El:", hand.map(t => tileToString(t)).join(', '));
  console.log("Okey taşı:", tileToString(okeyTile));

  // 🔹 1. Normal bitme (grup/seri) – öncelikli
  for (let i = 0; i < hand.length; i++) {
    const discarded = hand[i];
    const remaining = hand.filter((_, idx) => idx !== i);
    const result = analyzeHand(remaining, okeyTile);
    if (result.valid) {
      console.log("✅ Kazandı! (Grup/Seri) Atılan:", tileToString(discarded));
      console.log("Gruplar:");
      for (let g = 0; g < result.groups.length; g++) {
        const group = result.groups[g];
        const groupStr = group.map(t => tileToString(t)).join('-');
        const isRun = isValidRun(group, okeyTile);
        const isSet = isValidSet(group, okeyTile);
        console.log(`  Grup ${g + 1}: ${groupStr} (Run: ${isRun}, Set: ${isSet})`);
      }
      return {
        won: true,
        discardedTile: discarded,
        groups: result.groups,
        usedOkey: remaining.some(t => isWildcard(t, okeyTile)),
        isPairsWin: false
      };
    }
  }

  // 🔹 2. Çift kontrolü – sadece normal bitme başarısızsa
  console.log("🔄 Normal bitme başarısız. Çift kontrolü deneniyor...");
  for (let i = 0; i < hand.length; i++) {
    const possibleExtra = hand[i];
    const fourteenTiles = hand.filter((_, idx) => idx !== i);
    const pairResult = checkPairsWinning(fourteenTiles, okeyTile);
    if (pairResult.won) {
      console.log("✅ Kazandı! (Çift) Atılan (fazla taş):", tileToString(possibleExtra));
      return {
        won: true,
        discardedTile: possibleExtra,
        pairs: pairResult.pairs,
        isPairsWin: true
      };
    }
  }

  console.log("❌ Kazanamadı");
  return { won: false, reason: "Geçerli dizilim veya 7 çift bulunamadı" };
}

// -------------------------------------------------------------
// ÇİFT BİTİRME KONTROLÜ (7 çift) - Okey destekli
// -------------------------------------------------------------
function checkPairsWinning(hand, okeyTile) {
  if (hand.length !== 14) return { won: false, reason: "14 taş gerekli" };

  console.log("🔍 Çift bitiş kontrolü başladı");
  console.log("El:", hand.map(t => tileToString(t)).join(', '));

  const wildcards = hand.filter(t => isWildcard(t, okeyTile));
  const normals = hand.filter(t => !isWildcard(t, okeyTile));

  console.log("Okey sayısı:", wildcards.length);
  console.log("Normal taş sayısı:", normals.length);

  function findPairs(remaining, wilds, pairs) {
    if (remaining.length === 0 && wilds.length === 0) {
      return { found: true, pairs };
    }
    if (remaining.length % 2 !== 0 && wilds.length === 0) {
      return { found: false };
    }
    if (remaining.length === 0) {
      if (wilds.length % 2 === 0) {
        const wildPairs = [];
        for (let i = 0; i < wilds.length; i += 2) {
          wildPairs.push([wilds[i], wilds[i + 1]]);
        }
        return { found: true, pairs: [...pairs, ...wildPairs] };
      }
      return { found: false };
    }

    const first = remaining[0];
    const rest = remaining.slice(1);

    for (let i = 0; i < rest.length; i++) {
      const candidate = rest[i];
      if (candidate.color === first.color && candidate.number === first.number) {
        const newRemaining = rest.filter((_, idx) => idx !== i);
        const result = findPairs(newRemaining, wilds, [...pairs, [first, candidate]]);
        if (result.found) return result;
      }
    }

    if (wilds.length > 0) {
      const wild = wilds[0];
      const newWilds = wilds.slice(1);
      const result = findPairs(rest, newWilds, [...pairs, [first, wild]]);
      if (result.found) return result;
    }

    return { found: false };
  }

  const result = findPairs(normals, wildcards, []);

  if (result.found) {
    console.log("✅ Çift bitiş başarılı! Çiftler:");
    result.pairs.forEach((pair, idx) => {
      console.log(`  Çift ${idx + 1}: ${tileToString(pair[0])} - ${tileToString(pair[1])}`);
    });
    return { won: true, pairs: result.pairs, isPairsWin: true };
  }

  console.log("❌ Çift bitiş başarısız");
  return { won: false, reason: "7 çift oluşturulamadı" };
}

// -------------------------------------------------------------
// PUAN HESAPLAMA
// -------------------------------------------------------------
function calculateScore(winResult) {
  if (!winResult.won) return 0;
  if (winResult.isPairsWin) return 4;
  if (winResult.usedOkey) return 2;
  return 1;
}

// -------------------------------------------------------------
module.exports = {
  isValidRun,
  isValidSet,
  isValidGroup,
  isValidPair,
  analyzeHand,
  checkWinning,
  checkPairsWinning,
  calculateScore,
  sameTile,
  sortTiles
};
