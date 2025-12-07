// /engine/table_manager.js

// -------------------------------------------------------------
// MASA YÖNETİMİ
// 
// VIP odalarındaki masaları yönetir.
// Her masa 4 oyuncu alır.
// -------------------------------------------------------------

const {
  tables,
  getOrCreateTable,
  resetTable,
  dealTiles
} = require("./game_state");

// -------------------------------------------------------------
// MASA OLUŞTUR
// -------------------------------------------------------------
function createTable(room, tableId, ownerId) {
  if (!room.tables) room.tables = [];

  const exists = room.tables.find(t => t.id === tableId);
  if (exists) return exists;

  const table = {
    id: tableId,
    ownerId: ownerId,
    players: [],
    ready: {},
    createdAt: Date.now()
  };

  room.tables.push(table);

  // Global state'e de oluştur
  const state = getOrCreateTable(tableId);
  state.ownerId = ownerId;

  return table;
}

// -------------------------------------------------------------
// MASA SİL
// -------------------------------------------------------------
function removeTable(room, tableId) {
  if (!room.tables) return;

  room.tables = room.tables.filter(t => t.id !== tableId);
  tables.delete(tableId);
}

// -------------------------------------------------------------
// MASA BUL
// -------------------------------------------------------------
function findTable(room, tableId) {
  if (!room.tables) return null;
  return room.tables.find(t => t.id === tableId) || null;
}

// -------------------------------------------------------------
// MASADAKİ OYUNCULARI AL
// -------------------------------------------------------------
function getTablePlayers(table) {
  return table.players || [];
}

// -------------------------------------------------------------
// MASAYA OYUNCU EKLE
// -------------------------------------------------------------
function addPlayerToTable(room, tableId, user) {
  const table = findTable(room, tableId);
  if (!table) return null;

  table.players = table.players || [];
  table.ready = table.ready || {};

  // Zaten varsa ekleme
  const exists = table.players.find(p => p.id.toString() === user.id.toString());
  if (exists) return table;

  // Masa dolu mu? (4 kişi)
  if (table.players.length >= 4) {
    return null;
  }

  table.players.push({
    id: user.id,
    name: user.name || "Oyuncu",
    avatar: user.avatar || "",
    isGuest: user.isGuest ?? true
  });

  table.ready[user.id] = false;

  // Global state'e yansıt
  const state = getOrCreateTable(tableId);
  state.players = table.players;
  state.ready = table.ready;

  return table;
}

// -------------------------------------------------------------
// MASADAN OYUNCU ÇIKAR
// -------------------------------------------------------------
function removePlayerFromTable(room, tableId, userId) {
  const table = findTable(room, tableId);
  if (!table) return;

  table.players = table.players.filter(
    p => p.id.toString() !== userId.toString()
  );

  delete table.ready[userId];

  // Global state'e yansıt
  const state = getOrCreateTable(tableId);
  state.players = table.players;
  state.ready = table.ready;

  // Masa boşsa reset
  if (table.players.length === 0) {
    resetTable(state);
  }
}

// -------------------------------------------------------------
// MASA SAHİBİ Mİ?
// -------------------------------------------------------------
function isTableOwner(table, userId) {
  return table.ownerId && table.ownerId.toString() === userId.toString();
}

// -------------------------------------------------------------
// MASA DOLU MU? (4 kişi)
// -------------------------------------------------------------
function isTableFull(table) {
  return table.players && table.players.length === 4;
}

// -------------------------------------------------------------
// OYUNCU HAZIR MI?
// -------------------------------------------------------------
function setPlayerReady(table, userId, isReady = true) {
  if (!table.ready) table.ready = {};
  table.ready[userId.toString()] = isReady;

  // Global state'e yansıt
  const state = getOrCreateTable(table.id);
  state.ready = table.ready;
}

// -------------------------------------------------------------
// TÜM OYUNCULAR HAZIR MI?
// -------------------------------------------------------------
function allPlayersReady(table) {
  if (!table.players || !table.ready) return false;
  if (table.players.length !== 4) return false;

  for (const p of table.players) {
    const pid = p.id.toString();
    if (table.ready[pid] !== true) return false;
  }

  return true;
}

// -------------------------------------------------------------
// OYUNU BAŞLAT
// 
// Tüm oyuncular hazırsa taşları dağıt.
// -------------------------------------------------------------
function startGame(room, tableId) {
  const table = findTable(room, tableId);
  if (!table) return { success: false, reason: "Masa bulunamadı" };

  if (!isTableFull(table)) {
    return { success: false, reason: "4 oyuncu gerekli" };
  }

  if (!allPlayersReady(table)) {
    return { success: false, reason: "Tüm oyuncular hazır değil" };
  }

  const state = getOrCreateTable(tableId);
  const result = dealTiles(state);

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    indicator: result.indicator,
    okeyTile: result.okeyTile,
    startingPlayerId: result.startingPlayerId,
    deckSize: result.deckSize
  };
}

// -------------------------------------------------------------
// OYUNCUNUN MASASINI BUL
// -------------------------------------------------------------
function findPlayerTable(room, userId) {
  if (!room.tables) return null;

  for (const table of room.tables) {
    const found = table.players.find(p => p.id.toString() === userId.toString());
    if (found) return table;
  }

  return null;
}

// -------------------------------------------------------------
module.exports = {
  createTable,
  removeTable,
  findTable,
  getTablePlayers,
  addPlayerToTable,
  removePlayerFromTable,
  isTableOwner,
  isTableFull,
  setPlayerReady,
  allPlayersReady,
  startGame,
  findPlayerTable
};
