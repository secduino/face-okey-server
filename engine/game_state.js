// /engine/game_state.js

// -------------------------------------------------------------
// OKEY OYUN DURUMU YÖNETİMİ
// 
// PUANLAMA SİSTEMİ (Düşmeli):
// - Başlangıç puanı: 5, 13 veya 20 (masa ayarı)
// - Normal bitiş: Diğerlerinden 2 puan düşer
// - Çift bitiş: Diğerlerinden 4 puan düşer
// - Okey ile bitiş: Düşen puan x4
// - 0'a düşen oyuncu oyunu kaybeder
// -------------------------------------------------------------

const { generateFullSet } = require("./tile_set");
const { sameTile, sortTiles, isWildcard } = require("./tile_util");
const { 
  getNextPlayerIndex,
  checkWinning,
  checkPairsWinning,
  calculateScore 
} = require("./okey_logic");

// -------------------------------------------------------------
// GLOBAL STATE
// -------------------------------------------------------------
const tables = new Map();

// -------------------------------------------------------------
// MASA OLUŞTUR
// -------------------------------------------------------------
function getOrCreateTable(tableId) {
  if (!tables.has(tableId)) {
    tables.set(tableId, createEmptyTable(tableId));
  }
  return tables.get(tableId);
}

function createEmptyTable(tableId) {
  return {
    id: tableId,
    ownerId: null,
    players: [],
    ready: {},
    
    // Masa ayarları
    settings: {
      startingPoints: 20,  // 5, 13, 20 seçenekleri
      basePoints: 1000     // Genel puan (ranking için)
    },
    
    // Oyun durumu
    deck: [],
    hands: {},
    discardPiles: {},
    lastDiscarded: null,
    lastDiscardedBy: null,
    
    indicator: null,
    okeyTile: null,
    
    currentTurnPlayerId: null,
    currentTurnIndex: 0,
    hasDrawn: false,
    
    // Puanlama
    tableScores: {},      // Masa içi puan (düşmeli sistem)
    totalScores: {},      // Genel puan (1000 üzerinden)
    
    gameStarted: false,
    gameEnded: false,
    winner: null,
    roundNumber: 1,
    
    createdAt: Date.now()
  };
}

// -------------------------------------------------------------
// MASA AYARLARINI GÜNCELLE
// -------------------------------------------------------------
function updateTableSettings(table, settings) {
  if (settings.startingPoints) {
    const valid = [5, 13, 20];
    if (valid.includes(settings.startingPoints)) {
      table.settings.startingPoints = settings.startingPoints;
    }
  }
  return table.settings;
}

// -------------------------------------------------------------
// MASA SIFIRLAMA (Yeni el için)
// -------------------------------------------------------------
function resetTableForNewRound(table) {
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
// -------------------------------------------------------------
function dealTiles(table) {
  const players = table.players.map(p => p.id.toString());
  
  if (players.length !== 4) {
    return { success: false, reason: "4 oyuncu gerekli" };
  }

  const { deck, indicator, okeyTile } = generateFullSet();
  
  table.indicator = indicator;
  table.okeyTile = okeyTile;
  
  // Rastgele başlangıç oyuncusu
  const startingPlayerIndex = Math.floor(Math.random() * 4);
  const startingPlayerId = players[startingPlayerIndex];
  
  table.currentTurnIndex = startingPlayerIndex;
  table.currentTurnPlayerId = startingPlayerId;
  
  table.hands = {};
  table.discardPiles = {};
  
  let deckCopy = [...deck];
  
  for (let i = 0; i < players.length; i++) {
    const playerId = players[i];
    const tileCount = (i === startingPlayerIndex) ? 15 : 14;
    
    table.hands[playerId] = deckCopy.splice(0, tileCount);
    table.discardPiles[playerId] = [];
    
    // İlk el ise başlangıç puanlarını ver
    if (!table.tableScores[playerId]) {
      table.tableScores[playerId] = table.settings.startingPoints;
      table.totalScores[playerId] = table.settings.basePoints;
    }
  }
  
  table.deck = deckCopy;
  table.gameStarted = true;
  table.gameEnded = false;
  table.hasDrawn = true;
  
  return {
    success: true,
    indicator: indicator,
    okeyTile: okeyTile,
    startingPlayerId: startingPlayerId,
    deckSize: table.deck.length,
    hands: Object.fromEntries(
      Object.entries(table.hands).map(([id, tiles]) => [id, tiles.length])
    ),
    tableScores: table.tableScores
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
// SOLDAN TAŞ AL
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
  
  const currentIdx = table.currentTurnIndex;
  const leftIdx = (currentIdx - 1 + 4) % 4;
  const leftPlayerId = table.players[leftIdx].id.toString();
  
  if (table.lastDiscardedBy !== leftPlayerId) {
    return { success: false, reason: "Sadece solunuzdaki oyuncunun taşını alabilirsiniz" };
  }

  const tile = table.lastDiscarded;
  table.hands[uid].push(tile);
  
  const leftPile = table.discardPiles[leftPlayerId];
  if (leftPile && leftPile.length > 0) {
    leftPile.pop();
  }
  
  table.lastDiscarded = null;
  table.lastDiscardedBy = null;
  table.hasDrawn = true;

  return { success: true, tile: tile };
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

  const hand = table.hands[uid];
  const index = hand.findIndex(t => sameTile(t, tile));
  
  if (index === -1) {
    return { success: false, reason: "Bu taş elinizde yok" };
  }

  const removed = hand.splice(index, 1)[0];
  
  table.discardPiles[uid].push(removed);
  table.lastDiscarded = removed;
  table.lastDiscardedBy = uid;
  
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
// Puanlama:
// - Normal bitiş: 2 puan
// - Çift bitiş: 4 puan
// - Okey ile bitiş: Puan x4
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

  // ═══════════════════════════════════════════════════════════
  // PUANLAMA HESAPLA
  // ═══════════════════════════════════════════════════════════
  
  // Atılan taş okey mi?
  const discardedIsOkey = result.discardedTile && 
    isWildcard(result.discardedTile, table.okeyTile);
  
  // Temel puan
  let basePenalty = 2; // Normal bitiş
  
  // Çift bitiş kontrolü (7 çift ile bitirme - ayrı kontrol gerekir)
  // Şimdilik sadece normal bitiş
  
  // Okey ile bitirildiyse x4
  if (discardedIsOkey) {
    basePenalty = basePenalty * 4;
  }
  
  // Puan değişiklikleri
  const scoreChanges = {};
  const players = table.players.map(p => p.id.toString());
  
  for (const playerId of players) {
    if (playerId === uid) {
      // Kazanan puanı değişmez
      scoreChanges[playerId] = 0;
    } else {
      // Diğerleri puan kaybeder
      scoreChanges[playerId] = -basePenalty;
      table.tableScores[playerId] = Math.max(0, (table.tableScores[playerId] || 0) - basePenalty);
    }
  }
  
  // Oyun bitti mi? (Birinin puanı 0'a düştü mü?)
  let gameOver = false;
  let loser = null;
  
  for (const playerId of players) {
    if (table.tableScores[playerId] <= 0) {
      gameOver = true;
      loser = playerId;
      break;
    }
  }
  
  table.gameEnded = true;
  table.winner = uid;
  
  // Son taşı ortaya bırak
  if (result.discardedTile) {
    table.discardPiles[uid].push(result.discardedTile);
    table.hands[uid] = table.hands[uid].filter(t => !sameTile(t, result.discardedTile));
  }

  return {
    success: true,
    won: true,
    winnerId: uid,
    winnerName: table.players.find(p => p.id.toString() === uid)?.name || 'Oyuncu',
    
    // El sonucu
    roundResult: {
      basePenalty: basePenalty,
      discardedIsOkey: discardedIsOkey,
      scoreChanges: scoreChanges
    },
    
    // Güncel puanlar
    tableScores: table.tableScores,
    
    // Oyun tamamen bitti mi?
    gameOver: gameOver,
    loser: loser,
    loserName: loser ? table.players.find(p => p.id.toString() === loser)?.name : null,
    
    // Gruplar (debug)
    groups: result.groups,
    usedOkey: result.usedOkey
  };
}

// -------------------------------------------------------------
// ÇİFT BİTİRME (7 çift)
// -------------------------------------------------------------
function finishWithPairs(table, userId) {
  const uid = userId.toString();
  
  if (table.currentTurnPlayerId !== uid) {
    return { success: false, reason: "Sıra sizde değil" };
  }
  
  const hand = table.hands[uid];
  
  // Çift bitiş için 14 taş gerekli (taş çekmeden bitirir)
  if (hand.length !== 14) {
    return { success: false, reason: "Çift bitiş için 14 taş gerekli" };
  }

  const result = checkPairsWinning(hand, table.okeyTile);
  
  if (!result.won) {
    return { success: false, reason: result.reason || "7 çift yok" };
  }

  // Çift bitiş: 4 puan
  const basePenalty = 4;
  
  const scoreChanges = {};
  const players = table.players.map(p => p.id.toString());
  
  for (const playerId of players) {
    if (playerId === uid) {
      scoreChanges[playerId] = 0;
    } else {
      scoreChanges[playerId] = -basePenalty;
      table.tableScores[playerId] = Math.max(0, (table.tableScores[playerId] || 0) - basePenalty);
    }
  }
  
  let gameOver = false;
  let loser = null;
  
  for (const playerId of players) {
    if (table.tableScores[playerId] <= 0) {
      gameOver = true;
      loser = playerId;
      break;
    }
  }
  
  table.gameEnded = true;
  table.winner = uid;

  return {
    success: true,
    won: true,
    winnerId: uid,
    winnerName: table.players.find(p => p.id.toString() === uid)?.name || 'Oyuncu',
    isPairsWin: true,
    
    roundResult: {
      basePenalty: basePenalty,
      isPairsWin: true,
      scoreChanges: scoreChanges
    },
    
    tableScores: table.tableScores,
    gameOver: gameOver,
    loser: loser,
    loserName: loser ? table.players.find(p => p.id.toString() === loser)?.name : null,
    
    pairs: result.pairs
  };
}

// -------------------------------------------------------------
// YENİ EL BAŞLAT
// -------------------------------------------------------------
function startNewRound(table) {
  table.roundNumber = (table.roundNumber || 0) + 1;
  resetTableForNewRound(table);
  return dealTiles(table);
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
    roundNumber: table.roundNumber,
    
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
      tableScore: table.tableScores[p.id.toString()] || 0,
      totalScore: table.totalScores[p.id.toString()] || 1000
    })),
    
    settings: table.settings,
    tableScores: table.tableScores,
    winner: table.winner
  };
}

// -------------------------------------------------------------
module.exports = {
  tables,
  getOrCreateTable,
  createEmptyTable,
  updateTableSettings,
  resetTableForNewRound,
  dealTiles,
  drawTileFromDeck,
  drawTileFromDiscard,
  discardTile,
  finishGame,
  finishWithPairs,
  startNewRound,
  getPlayerHand,
  getGameState
};
