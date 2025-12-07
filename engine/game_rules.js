// /engine/game_rules.js

// -------------------------------------------------------------
// OKEY OYUN KURALLARI
// 
// SERİ (Run): Aynı renk, ardışık sayılar (min 3 taş, max 13)
//   Örnek: Mavi 4-5-6-7
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
// SERİ KONTROLÜ (Run)
// Aynı renk, ardışık sayılar, minimum 3 taş
// -------------------------------------------------------------
function isValidRun(tiles, okeyTile) {
  if (tiles.length < 3) return false;

  const wildcards = tiles.filter(t => isWildcard(t, okeyTile));
  const normals = tiles.filter(t => !isWildcard(t, okeyTile));

  if (normals.length === 0) return false;

  // Tüm normal taşlar aynı renkte olmalı
  const baseColor = normals[0].color;
  for (const tile of normals) {
    if (tile.color !== baseColor) return false;
  }

  if (!isValidColor(baseColor)) return false;

  // Sayılara göre sırala
  const sorted = normals.slice().sort((a, b) => a.number - b.number);

  // Gap hesapla
  let totalGaps = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i + 1].number - sorted[i].number;
    if (diff === 0) return false;
    if (diff === 1) continue;
    totalGaps += (diff - 1);
  }

  return wildcards.length >= totalGaps;
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
// ÇİFT KONTROLÜ
// -------------------------------------------------------------
function isValidPair(tile1, tile2) {
  if (!tile1 || !tile2) return false;
  if (!isNormalTile(tile1) || !isNormalTile(tile2)) return false;
  return tile1.color === tile2.color && tile1.number === tile2.number;
}

// -------------------------------------------------------------
// Kombinasyon yardımcı fonksiyonu
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// Taş karşılaştırma (index-based match için)
// -------------------------------------------------------------
function tileKey(t) {
  return `${t.color}-${t.number}-${t.fakeJoker || false}`;
}

// -------------------------------------------------------------
// 14 TAŞLIK EL ANALİZİ (Backtracking)
// -------------------------------------------------------------
function analyzeHand(tiles, okeyTile) {
  if (tiles.length !== 14) {
    return { valid: false, groups: [], reason: `14 taş gerekli, ${tiles.length} taş var` };
  }

  // Backtracking ile grupları bul
  function backtrack(remaining, groups) {
    if (remaining.length === 0) {
      return { valid: true, groups: groups };
    }
    
    if (remaining.length < 3) {
      return { valid: false };
    }

    // 3, 4, 5... taşlık grupları dene
    for (let size = 3; size <= remaining.length; size++) {
      const combos = getCombinations(remaining, size);
      
      for (const combo of combos) {
        if (isValidGroup(combo, okeyTile)) {
          // Bu grubu kullan
          const rest = remaining.filter(t => !combo.includes(t));
          const result = backtrack(rest, [...groups, combo]);
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

  // Her taşı atarak dene
  for (let i = 0; i < hand.length; i++) {
    const discarded = hand[i];
    const remaining = hand.filter((_, idx) => idx !== i);
    
    const result = analyzeHand(remaining, okeyTile);
    
    if (result.valid) {
      console.log("✅ Kazandı! Atılan:", tileToString(discarded));
      console.log("Gruplar:", result.groups.map(g => g.map(t => tileToString(t)).join('-')).join(' | '));
      return {
        won: true,
        discardedTile: discarded,
        groups: result.groups,
        usedOkey: remaining.some(t => isWildcard(t, okeyTile))
      };
    }
  }

  console.log("❌ Kazanamadı");
  return { won: false, reason: "Geçerli dizilim bulunamadı" };
}

// -------------------------------------------------------------
// ÇİFT BİTİRME KONTROLÜ (7 çift)
// -------------------------------------------------------------
function checkPairsWinning(hand, okeyTile) {
  if (hand.length !== 14) return { won: false, reason: "14 taş gerekli" };

  const sorted = sortTiles(hand);
  const pairs = [];

  for (let i = 0; i < sorted.length; i += 2) {
    if (i + 1 >= sorted.length) return { won: false, reason: "Tek taş kaldı" };
    
    const tile1 = sorted[i];
    const tile2 = sorted[i + 1];

    if (!isValidPair(tile1, tile2)) {
      return { won: false, reason: "Geçersiz çift" };
    }

    pairs.push([tile1, tile2]);
  }

  return { won: true, pairs: pairs, isPairsWin: true };
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
