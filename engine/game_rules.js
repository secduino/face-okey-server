// /engine/game_rules.js

// -------------------------------------------------------------
// OKEY OYUN KURALLARI
// 
// SERİ (Run): Aynı renk, ardışık sayılar (min 3 taş)
//   Örnek: Mavi 4-5-6-7
//
// PER (Set): Aynı sayı, farklı renkler (min 3, max 4 taş)
//   Örnek: Kırmızı 7, Mavi 7, Siyah 7
//
// ÇİFT BİTİRME: Aynı renk, aynı sayı, 2 taş
//   Örnek: Kırmızı 5, Kırmızı 5
//   (Oyun boyunca hiç açmadan tek seferde bitirme)
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

  // Wildcardları ve normal taşları ayır
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

  // Gap hesapla (eksik sayılar)
  let totalGaps = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i + 1].number - sorted[i].number;
    
    if (diff === 0) return false; // Aynı sayı olamaz seride
    if (diff === 1) continue; // Ardışık, sorun yok
    
    totalGaps += (diff - 1); // Eksik sayı adedi
  }

  // Wildcard sayısı gap'leri kapatmalı
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

  // Tüm normal taşlar aynı sayıda olmalı
  const baseNumber = normals[0].number;
  for (const tile of normals) {
    if (tile.number !== baseNumber) return false;
  }

  // Renkler çakışmamalı (her renk max 1 kez)
  const usedColors = new Set();
  for (const tile of normals) {
    if (usedColors.has(tile.color)) return false;
    usedColors.add(tile.color);
  }

  // Wildcard ile birlikte max 4 renk olabilir
  const totalTiles = normals.length + wildcards.length;
  if (totalTiles > 4) return false;

  return true;
}

// -------------------------------------------------------------
// GRUP GEÇERLİ Mİ? (Seri veya Per)
// -------------------------------------------------------------
function isValidGroup(tiles, okeyTile) {
  return isValidRun(tiles, okeyTile) || isValidSet(tiles, okeyTile);
}

// -------------------------------------------------------------
// ÇİFT KONTROLÜ (Aynı renk, aynı sayı, 2 taş)
// Çift bitirme için kullanılır
// -------------------------------------------------------------
function isValidPair(tile1, tile2) {
  if (!tile1 || !tile2) return false;
  
  // İkisi de normal taş olmalı
  if (!isNormalTile(tile1) || !isNormalTile(tile2)) return false;
  
  // Aynı renk, aynı sayı
  return tile1.color === tile2.color && tile1.number === tile2.number;
}

// -------------------------------------------------------------
// 14 TAŞLIK EL ANALİZİ
// Tüm taşlar geçerli gruplar oluşturmalı
// -------------------------------------------------------------
function analyzeHand(tiles, okeyTile) {
  if (tiles.length !== 14) {
    return {
      valid: false,
      groups: [],
      reason: `14 taş gerekli, ${tiles.length} taş var`
    };
  }

  const sorted = sortTiles(tiles);

  // Recursive olarak grupları bul
  function findGroups(remaining, currentGroups) {
    if (remaining.length === 0) {
      return { valid: true, groups: currentGroups };
    }

    // 3 veya 4 taşlık grup dene
    for (let size = 3; size <= Math.min(4, remaining.length); size++) {
      // Tüm kombinasyonları dene
      const combinations = getCombinations(remaining, size);
      
      for (const combo of combinations) {
        if (isValidGroup(combo, okeyTile)) {
          const rest = remaining.filter(t => !combo.includes(t));
          const result = findGroups(rest, [...currentGroups, combo]);
          if (result.valid) return result;
        }
      }
    }

    return { valid: false };
  }

  const result = findGroups(sorted, []);

  return {
    valid: result.valid,
    groups: result.groups || [],
    reason: result.valid ? "OK" : "Geçerli grup dizilimi bulunamadı"
  };
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
// EL BİTTİ Mİ? (15 taş + 1 taş atma)
// 
// Oyuncu 15 taşla bitirmeli:
// - 14 taş geçerli gruplar oluşturmalı
// - 1 taş atılarak bitirilmeli
// -------------------------------------------------------------
function checkWinning(hand, okeyTile) {
  if (hand.length !== 15) return { won: false, reason: "15 taş gerekli" };

  // Her taşı atarak dene
  for (let i = 0; i < hand.length; i++) {
    const discarded = hand[i];
    const remaining = hand.filter((_, idx) => idx !== i);
    
    const result = analyzeHand(remaining, okeyTile);
    
    if (result.valid) {
      return {
        won: true,
        discardedTile: discarded,
        groups: result.groups,
        usedOkey: remaining.some(t => isWildcard(t, okeyTile))
      };
    }
  }

  return { won: false, reason: "Geçerli dizilim bulunamadı" };
}

// -------------------------------------------------------------
// ÇİFT BİTİRME KONTROLÜ
// 
// Oyuncu hiç açmadan 7 çift ile bitirir:
// - 14 taş = 7 çift
// - Her çift: aynı renk, aynı sayı
// -------------------------------------------------------------
function checkPairsWinning(hand, okeyTile) {
  if (hand.length !== 14) return { won: false, reason: "14 taş gerekli" };

  const sorted = sortTiles(hand);
  const pairs = [];

  // Her 2 taşı kontrol et
  for (let i = 0; i < sorted.length; i += 2) {
    if (i + 1 >= sorted.length) return { won: false, reason: "Tek taş kaldı" };
    
    const tile1 = sorted[i];
    const tile2 = sorted[i + 1];

    if (!isValidPair(tile1, tile2)) {
      return { won: false, reason: "Geçersiz çift" };
    }

    pairs.push([tile1, tile2]);
  }

  return {
    won: true,
    pairs: pairs,
    isPairsWin: true
  };
}

// -------------------------------------------------------------
// PUAN HESAPLAMA
// 
// Normal bitiş: 1 puan
// Okey ile bitiş: 2 puan
// Çift bitiş: 4 puan
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
