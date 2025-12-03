// /engine/table_manager.js

const {
  tables,
  getOrCreateTable,
  resetTable
} = require("./game_state");

// -----------------------------------------------------------
//  TABLE MANAGER (MASA YÖNETİMİ)
// -----------------------------------------------------------

/**
 * Masa oluştur.
 * roomId → vip rooms için
 * tableId → benzersiz masa id
 */
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

  // Global state’e de oluştur
  const state = getOrCreateTable(tableId);
  state.ownerId = ownerId;

  return table;
}

/**
 * Masa sil.
 */
function removeTable(room, tableId) {
  if (!room.tables) return;

  room.tables = room.tables.filter(t => t.id !== tableId);

  // global state de silinsin
  tables.delete(tableId);
}

/**
 * Masayı bul.
 */
function findTable(room, tableId) {
  if (!room.tables) return null;
  return room.tables.find(t => t.id === tableId) || null;
}

/**
 * Masadaki oyuncuları al.
 */
function getTablePlayers(table) {
  return table.players || [];
}

/**
 * Masaya oyuncu ekle.
 */
function addPlayerToTable(room, tableId, user) {
  const table = findTable(room, tableId);
  if (!table) return null;

  table.players = table.players || [];
  table.ready = table.ready || {};

  let exists = table.players.find(p => p.id.toString() === user.id.toString());
  if (!exists) {
    table.players.push({
      id: user.id,
      name: user.name || "Player",
      avatar: user.avatar || "",
      isGuest: user.isGuest ?? true
    });
  }

  table.ready[user.id] = false;

  // global state
  const state = getOrCreateTable(tableId);
  state.players = table.players;
  state.ready = table.ready;

  return table;
}

/**
 * Masadan oyuncu çıkar.
 */
function removePlayerFromTable(room, tableId, userId) {
  const table = findTable(room, tableId);
  if (!table) return;

  table.players = table.players.filter(
    p => p.id.toString() !== userId.toString()
  );

  delete table.ready[userId];

  // global state’e yansı
  const state = getOrCreateTable(tableId);
  state.players = table.players;
  state.ready = table.ready;

  // Masa boşsa otomatik reset
  if (table.players.length === 0) {
    resetTable(state);
  }
}

/**
 * Masa sahibi mi?
 */
function isTableOwner(table, userId) {
  return table.ownerId && table.ownerId.toString() === userId.toString();
}

/**
 * Masa dolu mu? (4 kişi mi?)
 */
function isTableFull(table) {
  return table.players && table.players.length === 4;
}

/**
 * Tüm oyuncular hazır mı?
 */
function allPlayersReady(table) {
  if (!table.players || !table.ready) return false;
  if (table.players.length !== 4) return false;

  for (const p of table.players) {
    const pid = p.id.toString();
    if (table.ready[pid] !== true) return false;
  }

  return true;
}

// -----------------------------------------------------------
module.exports = {
  createTable,
  removeTable,
  findTable,
  getTablePlayers,
  addPlayerToTable,
  removePlayerFromTable,
  isTableOwner,
  isTableFull,
  allPlayersReady
};
