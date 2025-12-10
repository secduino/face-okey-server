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
// Wildcard (okey/joker) herhangi bir taşın yerine geçebilir
// -------------------------------------------------------------
function isValidRun(tiles, okeyTile) {
  if (tiles.length < 3) return false;

  const wildcards = tiles.filter(t => isWildcard(t, okeyTile));
  const normals = tiles.filter(t => !isWildcard(t, okeyTile));

  // Tamamı wildcard olamaz (en az 1 normal taş olmalı)
  if (normals.length === 0) return false;

  // Tüm normal taşlar aynı renkte olmalı
  const baseColor = normals[0].color;
  for (const tile of normals) {
    if (tile.color !== baseColor) return false;
  }

  if (!isValidColor(baseColor)) return false;

  // Sayılara göre sırala
  const numbers = normals.map(t => t.number).sort((a, b) => a - b);
  
  // Aynı sayı varsa geçersiz
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] === numbers[i + 1]) return false;
  }

  // Toplam uzunluk = normal taşlar + wildcardlar
  const totalLength = tiles.length;
  
  // Min ve max sayıları bul
  const minNum = numbers[0];
  const maxNum = numbers[numbers.length - 1];
  
  // Seri aralığı kontrolü (1-13 arası olmalı)
  // Wildcard'larla birlikte seri oluşturulabilir mi?
  
  // En kısa olası seri: maxNum - minNum + 1
  const minRequiredLength = maxNum - minNum + 1;
  
  // Eğer toplam taş sayısı minimum gerekenden azsa, wildcardlarla genişletebiliriz
  // Ama seri 1'den küçük veya 13'ten büyük olamaz
  
  if (totalLength < minRequiredLength) {
    // Yeterli taş yok
    return false;
  }
  
  if (totalLength === minRequiredLength) {
    // Tam sığıyor, gap'leri wildcard doldurmalı
    const gaps = minRequiredLength - numbers.length;
    return wildcards.length >= gaps;
  }
  
  // totalLength > minRequiredLength
  // Seriyi sola veya sağa genişletebiliriz
  const extraTiles = totalLength - minRequiredLength;
  const gaps = minRequiredLength - numbers.length;
  
  // Gap'leri doldurmak için wildcard gerekiyor
  // Kalan wildcardlar seriyi genişletir
  if (wildcards.length < gaps) return false;
  
  const remainingWildcards = wildcards.length - gaps;
  
  // Seriyi genişletme: sola (minNum-1, minNum-2...) veya sağa (maxNum+1, maxNum+2...)
  // Sınırlar: 1 ve 13
  const canExpandLeft = minNum - 1; // Kaç adım sola gidilebilir (min 0)
  const canExpandRight = 13 - maxNum; // Kaç adım sağa gidilebilir
  
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
  
  // İki Okey = geçerli çift
  if (isOkey1 && isOkey2) return true;
  
  // Bir Okey + bir normal taş = geçerli çift
  if (isOkey1 || isOkey2) return true;
  
  // İki normal taş - aynı renk ve sayı olmalı
  return tile1.color === tile2.color && tile1.number === tile2.number;
}

// -------------------------------------------------------------
// 14 TAŞLIK EL ANALİZİ (Optimize Edilmiş)
// -------------------------------------------------------------
function analyzeHand(tiles, okeyTile) {
  if (tiles.length !== 14) {
    return { valid: false, groups: [], reason: `14 taş gerekli, ${tiles.length} taş var` };
  }

  // Hızlı backtracking - küçük gruplardan başla
  function backtrack(remaining, groups) {
    if (remaining.length === 0) {
      return { valid: true, groups: groups };
    }
    
    if (remaining.length < 3) {
      return { valid: false };
    }

    // İlk taşı içeren grupları dene (dallanmayı azaltır)
    const firstTile = remaining[0];
    const rest = remaining.slice(1);
    
    // 3, 4, 5... taşlık grupları dene
    for (let size = 3; size <= Math.min(13, remaining.length); size++) {
      // İlk taşı içeren kombinasyonları bul
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

// İlk elemanı içeren kombinasyonlar (daha az kombinasyon)
function getCombinationsWithFirst(arr, size) {
  if (size < 1 || arr.length < size) return [];
  
  const first = arr[0];
  const rest = arr.slice(1);
  
  if (size === 1) return [[first]];
  
  const subCombos = getCombinations(rest, size - 1);
  return subCombos.map(combo => [first, ...combo]);
}

// Standart kombinasyon
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

// Diziden elemanları çıkar
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

  // 🔹 1. Geleneksel yol: her taşı atarak grup/seri analizi yap
  for (let i = 0; i < hand.length; i++) {
    const discarded = hand[i];
    const remaining = hand.filter((_, idx) => idx !== i);
    
    const result = analyzeHand(remaining, okeyTile);
    
    if (result.valid) {
      console.log("✅ Kazandı! (Grup/Seri) Atılan:", tileToString(discarded));
      
      // Grupları doğrula ve logla
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

  // 🔹 2. YENİ: ÇİFT bitme kontrolü — her taşı "fazla taş" olarak düşün ve çift kontrolü yap
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

  // Okey taşlarını ve normal taşları ayır
  const wildcards = hand.filter(t => isWildcard(t, okeyTile));
  const normals = hand.filter(t => !isWildcard(t, okeyTile));

  console.log("Okey sayısı:", wildcards.length);
  console.log("Normal taş sayısı:", normals.length);

  // Backtracking ile çift bul
  function findPairs(remaining, wilds, pairs) {
    // Tüm taşlar eşleşti
    if (remaining.length === 0 && wilds.length === 0) {
      return { found: true, pairs };
    }

    // Kalan taş sayısı tek ise ve wild yoksa başarısız
    if (remaining.length % 2 !== 0 && wilds.length === 0) {
      return { found: false };
    }

    // Eğer normal taş kalmadıysa, wildcard'ları eşleştir
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

    // İlk taşı al
    const first = remaining[0];
    const rest = remaining.slice(1);

    // Aynı taşı ara (çift)
    for (let i = 0; i < rest.length; i++) {
      const candidate = rest[i];
      if (candidate.color === first.color && candidate.number === first.number) {
        // Çift bulundu
        const newRemaining = rest.filter((_, idx) => idx !== i);
        const result = findPairs(newRemaining, wilds, [...pairs, [first, candidate]]);
        if (result.found) return result;
      }
    }

    // Çift bulunamadı, wildcard ile eşleştir
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
