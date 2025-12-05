// /engine/game_state.js

// -------------------------------------------------------------
// OKEY OYUN DURUMU YÖNETİMİ
// 
// TAŞ DAĞILIMI:
// - Toplam: 106 taş
// - Gösterge: 1 taş (okey belirlemek için)
// - Başlangıç oyuncusu: 15 taş
// - Diğer 3 oyuncu: 14'er taş (toplam 42)
// - Ortadaki deste: 48 taş
// 
// TOPLAM: 1 + 15 + 42 + 48 = 106 ✓
// -------------------------------------------------------------

const { generateFullSet } = require("./tile_set");
const { sameTile, sortTiles } = require("./tile_util");
const { 
  getNextPlayerIndex,
  checkWinning,
  calculateScore 
} = require("./okey_logic");

// -------------------------------------------------------------
// GLOBAL STATE → TÜM MASALAR
// -------------------------------------------------------------
const tables = new Map();

// -------------------------------------------------------------
// MASA BUL / OLUŞTUR
// -------------------------------------------------------------
function getOrCreateTable(tableId) {
  if (!tables.has(tableId)) {
    tables.set(tableId, createEmptyTable(tableId));
  }
  return tables.get(tableId);
}

// -------------------------------------------------------------
// BOŞ MASA OLUŞTUR
// -------------------------------------------------------------
function createEmptyTable(tableId) {
  return {
    id: tableId,
    ownerId: null,
    players: [],           // [{id, name, avatar, isGuest}]
    ready: {},             // {odId: true/false}
    
    // Oyun durumu
    deck: [],              // Ortadaki kapalı taşlar
    hands: {},             // {odId: [tiles]}
    discardPiles: {},      // {odId: [tiles]} - her oyuncunun attığı taşlar
    lastDiscarded: null,   // Son atılan taş
    lastDiscardedBy: null, // Son taşı atan oyuncu
    
    indicator: null,       // Gösterge taşı
    okeyTile: null,        // Okey taşı
    
    currentTurnPlayerId: null,
    currentTurnIndex: 0,
    
    hasDrawn: false,       // Oyuncu taş çekti mi?
    
    scores: {},            // {odId: score}
    gameStarted: false,
    gameEnded: false,
    winner: null,
    
    createdAt: Date.now()
  };
}

// -------------------------------------------------------------
// MASA SIFIRLAMA
// -------------------------------------------------------------
function resetTable(table) {
  table.deck = [];
  table.hands = {};
  table.discardPiles = {};
  table.lastDiscarded = null;
  table.lastDiscardedBy = null;
  table.indicator = null;
  table.okeyTile = null;
  table.currentTurnPlayerId = null;
  table.currentTurnIndex = 0;
  table.hasDrawn = false;
  table.gameStarted = false;
  table.gameEnded = false;
  table.winner = null;
}

// -------------------------------------------------------------
// TAŞ DAĞITIMI
// 
// 1. 106 taş oluştur ve karıştır
// 2. Gösterge taşını seç (okey belirlenir)
// 3. Rastgele bir oyuncu seç (15 taş alacak)
// 4. Diğer oyunculara 14'er taş dağıt
// 5. Kalan 48 taş ortada kalır
// -------------------------------------------------------------
function dealTiles(table) {
  const players = table.players.map(p => p.id.toString());
  
  if (players.length !== 4) {
    return { success: false, reason: "4 oyuncu gerekli" };
  }

  // 1. Deste oluştur (106 taş, karışık, gösterge seçilmiş)
  const { deck, indicator, okeyTile } = generateFullSet();
  
  // 2. Gösterge ve okey kaydet
  table.indicator = indicator;
  table.okeyTile = okeyTile;
  
  // 3. Rastgele başlangıç oyuncusu seç
  const startingPlayerIndex = Math.floor(Math.random() * 4);
  const startingPlayerId = players[startingPlayerIndex];
  
  table.currentTurnIndex = startingPlayerIndex;
  table.currentTurnPlayerId = startingPlayerId;
  
  // 4. Taşları dağıt
  table.hands = {};
  table.discardPiles = {};
  
  let deckCopy = [...deck]; // 105 taş (gösterge çıkarılmış)
  
  for (let i = 0; i < players.length; i++) {
    const playerId = players[i];
    const tileCount = (i === startingPlayerIndex) ? 15 : 14;
    
    table.hands[playerId] = deckCopy.splice(0, tileCount);
    table.discardPiles[playerId] = [];
    table.scores[playerId] = table.scores[playerId] || 0;
  }
  
  // 5. Kalan taşlar ortada (48 taş)
  table.deck = deckCopy;
  
  // 6. Oyun başladı
  table.gameStarted = true;
  table.gameEnded = false;
  table.hasDrawn = true; // Başlangıç oyuncusu zaten 15 taşlı
  
  return {
    success: true,
    indicator: indicator,
    okeyTile: okeyTile,
    startingPlayerId: startingPlayerId,
    deckSize: table.deck.length,
    hands: Object.fromEntries(
      Object.entries(table.hands).map(([id, tiles]) => [id, tiles.length])
    )
  };
}

// -------------------------------------------------------------
// ORTADAN TAŞ ÇEK
// -------------------------------------------------------------
function drawTileFromDeck(table, userId) {
  const uid = userId.toString();
  
  if (table.currentTurnPlayerId !== uid) {
    return { success: false, reason: "Sıra sizde değil" };
  }
  
  if (table.hasDrawn) {
    return { success: false, reason: "Zaten taş çektiniz" };
  }
  
  if (table.deck.length === 0) {
    return { success: false, reason: "Deste boş" };
  }
  
  if (table.hands[uid].length !== 14) {
    return { success: false, reason: "Elinizde 14 taş olmalı" };
  }

  const tile = table.deck.shift();
  table.hands[uid].push(tile);
  table.hasDrawn = true;

  return { 
    success: true, 
    tile: tile,
    deckRemaining: table.deck.length
  };
}

// -------------------------------------------------------------
// SOLDAKİ OYUNCUNUN ATTIĞI TAŞI AL
// -------------------------------------------------------------
function drawTileFromDiscard(table, userId) {
  const uid = userId.toString();
  
  if (table.currentTurnPlayerId !== uid) {
    return { success: false, reason: "Sıra sizde değil" };
  }
  
  if (table.hasDrawn) {
    return { success: false, reason: "Zaten taş çektiniz" };
  }
  
  if (!table.lastDiscarded) {
    return { success: false, reason: "Alınacak taş yok" };
  }
  
  // Soldaki oyuncuyu bul
  const currentIdx = table.currentTurnIndex;
  const leftIdx = (currentIdx - 1 + 4) % 4;
  const leftPlayerId = table.players[leftIdx].id.toString();
  
  // Sadece soldaki oyuncunun attığı son taşı alabilir
  if (table.lastDiscardedBy !== leftPlayerId) {
    return { success: false, reason: "Sadece solunuzdaki oyuncunun taşını alabilirsiniz" };
  }

  const tile = table.lastDiscarded;
  table.hands[uid].push(tile);
  
  // Soldaki oyuncunun discard pile'ından sil
  const leftPile = table.discardPiles[leftPlayerId];
  if (leftPile && leftPile.length > 0) {
    leftPile.pop();
  }
  
  table.lastDiscarded = null;
  table.lastDiscardedBy = null;
  table.hasDrawn = true;

  return { 
    success: true, 
    tile: tile 
  };
}

// -------------------------------------------------------------
// TAŞ AT
// -------------------------------------------------------------
function discardTile(table, userId, tile) {
  const uid = userId.toString();
  
  if (table.currentTurnPlayerId !== uid) {
    return { success: false, reason: "Sıra sizde değil" };
  }
  
  if (!table.hasDrawn) {
    return { success: false, reason: "Önce taş çekmelisiniz" };
  }
  
  if (table.hands[uid].length !== 15) {
    return { success: false, reason: "Elinizde 15 taş olmalı" };
  }

  // Taşı elde bul ve çıkar
  const hand = table.hands[uid];
  const index = hand.findIndex(t => sameTile(t, tile));
  
  if (index === -1) {
    return { success: false, reason: "Bu taş elinizde yok" };
  }

  const removed = hand.splice(index, 1)[0];
  
  // Discard pile'a ekle
  table.discardPiles[uid].push(removed);
  table.lastDiscarded = removed;
  table.lastDiscardedBy = uid;
  
  // Sırayı sonraki oyuncuya geçir
  const nextIdx = getNextPlayerIndex(table.currentTurnIndex);
  const nextPlayer = table.players[nextIdx];
  
  table.currentTurnIndex = nextIdx;
  table.currentTurnPlayerId = nextPlayer.id.toString();
  table.hasDrawn = false;

  return { 
    success: true, 
    discardedTile: removed,
    nextPlayerId: nextPlayer.id.toString()
  };
}

// -------------------------------------------------------------
// OYUNU BİTİR
// 
// Oyuncu 15 taşla bitirmek istediğinde:
// 1. Eli kontrol et (14 taş geçerli gruplar + 1 taş atılacak)
// 2. Kazandıysa puanla
// -------------------------------------------------------------
function finishGame(table, userId) {
  const uid = userId.toString();
  
  if (table.currentTurnPlayerId !== uid) {
    return { success: false, reason: "Sıra sizde değil" };
  }
  
  const hand = table.hands[uid];
  
  if (hand.length !== 15) {
    return { success: false, reason: "15 taş gerekli" };
  }

  const result = checkWinning(hand, table.okeyTile);
  
  if (!result.won) {
    return { success: false, reason: result.reason || "Geçersiz el" };
  }

  // Kazandı!
  const score = calculateScore(result);
  table.scores[uid] = (table.scores[uid] || 0) + score;
  
  table.gameEnded = true;
  table.winner = uid;
  
  // Son taşı ortaya bırak (deste yerine)
  if (result.discardedTile) {
    table.discardPiles[uid].push(result.discardedTile);
    table.hands[uid] = table.hands[uid].filter(t => !sameTile(t, result.discardedTile));
  }

  return {
    success: true,
    won: true,
    winnerId: uid,
    score: score,
    totalScore: table.scores[uid],
    groups: result.groups,
    usedOkey: result.usedOkey
  };
}

// -------------------------------------------------------------
// OYUNCU ELİNİ AL
// -------------------------------------------------------------
function getPlayerHand(table, userId) {
  const uid = userId.toString();
  return table.hands[uid] || [];
}

// -------------------------------------------------------------
// OYUN DURUMUNU AL
// -------------------------------------------------------------
function getGameState(table, userId) {
  const uid = userId.toString();
  
  return {
    tableId: table.id,
    gameStarted: table.gameStarted,
    gameEnded: table.gameEnded,
    
    indicator: table.indicator,
    okeyTile: table.okeyTile,
    
    myHand: table.hands[uid] || [],
    myDiscardPile: table.discardPiles[uid] || [],
    
    currentTurnPlayerId: table.currentTurnPlayerId,
    isMyTurn: table.currentTurnPlayerId === uid,
    hasDrawn: table.hasDrawn,
    
    deckSize: table.deck.length,
    lastDiscarded: table.lastDiscarded,
    lastDiscardedBy: table.lastDiscardedBy,
    
    players: table.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      tileCount: (table.hands[p.id.toString()] || []).length,
      discardCount: (table.discardPiles[p.id.toString()] || []).length,
      score: table.scores[p.id.toString()] || 0
    })),
    
    winner: table.winner,
    scores: table.scores
  };
}

// -------------------------------------------------------------
module.exports = {
  tables,
  getOrCreateTable,
  createEmptyTable,
  resetTable,
  dealTiles,
  drawTileFromDeck,
  drawTileFromDiscard,
  discardTile,
  finishGame,
  getPlayerHand,
  getGameState
};
