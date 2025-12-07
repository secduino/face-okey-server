// /engine/okey_logic.js

// -------------------------------------------------------------
// OKEY OYUN MANTIĞI
// 
// Bu dosya oyun akışını ve taş çekme/atma mantığını içerir.
// -------------------------------------------------------------

const {
  isValidRun,
  isValidSet,
  isValidGroup,
  analyzeHand,
  checkWinning,
  checkPairsWinning,
  calculateScore
} = require("./game_rules");

const {
  sameTile,
  isFakeJoker,
  isWildcard,
  tileToString
} = require("./tile_util");

// -------------------------------------------------------------
// OYUNCU SIRASI HESAPLAMA
// 
// Her oyuncu sağındaki oyuncuya taş atar.
// Sıra: 0 → 1 → 2 → 3 → 0 (saat yönünde)
// -------------------------------------------------------------
function getNextPlayerIndex(currentIndex, totalPlayers = 4) {
  return (currentIndex + 1) % totalPlayers;
}

// -------------------------------------------------------------
// SOLDAKİ OYUNCUYU BUL (taş alma için)
// 
// Oyuncu solundaki oyuncunun attığı taşı alabilir.
// -------------------------------------------------------------
function getLeftPlayerIndex(currentIndex, totalPlayers = 4) {
  return (currentIndex - 1 + totalPlayers) % totalPlayers;
}

// -------------------------------------------------------------
// TAŞ ÇEKEBİLİR Mİ?
// 
// Oyuncu şu durumlarda taş çekebilir:
// 1. Sırası gelmişse
// 2. Elinde 14 taş varsa (15 taşa tamamlamak için)
// -------------------------------------------------------------
function canDrawTile(hand) {
  return hand.length === 14;
}

// -------------------------------------------------------------
// TAŞ ATABİLİR Mİ?
// 
// Oyuncu şu durumlarda taş atabilir:
// 1. Sırası gelmişse
// 2. Elinde 15 taş varsa
// -------------------------------------------------------------
function canDiscardTile(hand) {
  return hand.length === 15;
}

// -------------------------------------------------------------
// ORTADAN TAŞ ÇEK
// 
// Desteden (ortadaki kapalı taşlar) 1 taş çeker.
// Deste boşsa null döner.
// -------------------------------------------------------------
function drawFromDeck(deck, hand) {
  if (deck.length === 0) return { success: false, reason: "Deste boş" };
  if (hand.length !== 14) return { success: false, reason: "El 14 taş olmalı" };

  const tile = deck.shift();
  hand.push(tile);

  return { 
    success: true, 
    tile: tile,
    deckRemaining: deck.length
  };
}

// -------------------------------------------------------------
// ATILAN TAŞI AL
// 
// Soldaki oyuncunun attığı son taşı alır.
// Sadece son atılan taş alınabilir.
// -------------------------------------------------------------
function drawFromDiscard(discardPile, hand) {
  if (discardPile.length === 0) return { success: false, reason: "Atık yığını boş" };
  if (hand.length !== 14) return { success: false, reason: "El 14 taş olmalı" };

  const tile = discardPile.pop();
  hand.push(tile);

  return { 
    success: true, 
    tile: tile 
  };
}

// -------------------------------------------------------------
// TAŞ AT
// 
// Oyuncu elinden bir taş atar.
// Atılan taş sağdaki oyuncunun alabileceği yere gider.
// -------------------------------------------------------------
function discardTile(hand, tile, discardPile) {
  if (hand.length !== 15) return { success: false, reason: "El 15 taş olmalı" };

  const index = hand.findIndex(t => sameTile(t, tile));
  if (index === -1) return { success: false, reason: "Taş elde yok" };

  const removed = hand.splice(index, 1)[0];
  discardPile.push(removed);

  return { 
    success: true, 
    discardedTile: removed,
    handSize: hand.length
  };
}

// -------------------------------------------------------------
// OYUNU BİTİR
// 
// Oyuncu 15 taşla bitirmeye çalışır:
// 1. 14 taş geçerli gruplar oluşturmalı
// 2. 1 taş ortaya (deste yerine) bırakılır
// -------------------------------------------------------------
function finishGame(hand, okeyTile) {
  if (hand.length !== 15) {
    return { success: false, reason: "15 taş gerekli" };
  }

  const result = checkWinning(hand, okeyTile);
  
  if (result.won) {
    return {
      success: true,
      won: true,
      discardedTile: result.discardedTile,
      groups: result.groups,
      usedOkey: result.usedOkey,
      score: calculateScore(result)
    };
  }

  return { success: false, won: false, reason: result.reason };
}

// -------------------------------------------------------------
// ÇİFT BİTİŞ KONTROLÜ
// 
// Oyuncu hiç açmadan 7 çift ile bitirir.
// Bu özel bir bitiş türüdür ve daha yüksek puan verir.
// -------------------------------------------------------------
function finishWithPairs(hand, okeyTile) {
  if (hand.length !== 14) {
    return { success: false, reason: "14 taş gerekli" };
  }

  const result = checkPairsWinning(hand, okeyTile);
  
  if (result.won) {
    return {
      success: true,
      won: true,
      pairs: result.pairs,
      isPairsWin: true,
      score: calculateScore(result)
    };
  }

  return { success: false, won: false, reason: result.reason };
}

// -------------------------------------------------------------
// OYUN DURUMU KONTROLÜ
// 
// Oyun bitti mi?
// - Deste boşsa ve kimse bitiremediyse: berabere
// - Biri bitirdiyse: kazanan var
// -------------------------------------------------------------
function checkGameEnd(deck, winner) {
  if (winner) {
    return { ended: true, reason: "winner", winner: winner };
  }

  if (deck.length === 0) {
    return { ended: true, reason: "draw", winner: null };
  }

  return { ended: false };
}

// -------------------------------------------------------------
// EL DURUMU ÖZETİ (debug için)
// -------------------------------------------------------------
function getHandSummary(hand, okeyTile) {
  const wildcards = hand.filter(t => isWildcard(t, okeyTile));
  const normals = hand.filter(t => !isWildcard(t, okeyTile));

  return {
    total: hand.length,
    wildcards: wildcards.length,
    normals: normals.length,
    tiles: hand.map(t => tileToString(t))
  };
}

// -------------------------------------------------------------
module.exports = {
  getNextPlayerIndex,
  getLeftPlayerIndex,
  canDrawTile,
  canDiscardTile,
  drawFromDeck,
  drawFromDiscard,
  discardTile,
  finishGame,
  finishWithPairs,
  checkGameEnd,
  getHandSummary,
  // Re-export for convenience
  isValidRun,
  isValidSet,
  isValidGroup,
  analyzeHand,
  checkWinning,
  calculateScore
};
