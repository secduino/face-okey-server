// /engine/game_state.js

const {
  sameTile,
  sortTiles,
  applyOkey,
  checkWinning,
  validateHand14
} = require("./game_rules");

const {
  analyzeHand,
  isHandWinning
} = require("./okey_logic");

// -----------------------------------------------------------
//   GLOBAL STATE → TÜM MASALAR
// -----------------------------------------------------------
const tables = new Map();

// -----------------------------------------------------------
//   TABLO BUL / OLUŞTUR
// -----------------------------------------------------------
function getOrCreateTable(tableId) {
  if (!tables.has(tableId)) {
    tables.set(tableId, {
      id: tableId,
      ownerId: null,
      players: [],
      ready: {},
      deck: [],
      hands: {},
      discardPile: [],
      okeyTile: null,
      currentTurnPlayerId: null,
      scores: {},
      createdAt: Date.now()
    });
  }
  return tables.get(tableId);
}

// -----------------------------------------------------------
//   MASA SIFIRLAMA
// -----------------------------------------------------------
function resetTable(table) {
  table.deck = [];
  table.hands = {};
  table.discardPile = [];
  table.okeyTile = null;
  table.currentTurnPlayerId = null;
}

// -----------------------------------------------------------
//   OKEY TAŞI UYGULAMA (tüm ele)
// -----------------------------------------------------------
function applyOkeyToHand(hand, okeyTile) {
  return hand.map(t => applyOkey(t, okeyTile));
}

// -----------------------------------------------------------
//   106 TAŞLIK DESTEKİ OLUŞTUR
// -----------------------------------------------------------
function createDeck() {
  const deck = [];
  const colors = ["blue", "black", "red", "green"];

  for (const color of colors) {
    for (let number = 1; number <= 13; number++) {
      deck.push({ color, number, fakeJoker: false });
      deck.push({ color, number, fakeJoker: false });
    }
  }

  deck.push({ color: "joker", number: 0, fakeJoker: false });
  deck.push({ color: "joker", number: 0, fakeJoker: false });
  return deck;
}

// -----------------------------------------------------------
//   KARISTIR (Fisher–Yates)
// -----------------------------------------------------------
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// -----------------------------------------------------------
//   OKEY BELİRLE (gösterge +1)
// -----------------------------------------------------------
function pickOkey(deck) {
  const idx = deck.findIndex(t => t.color !== "joker");
  const indicator = deck[idx];
  const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;

  const okeyTile = {
    color: indicator.color,
    number: okeyNumber,
    fakeJoker: false
  };

  deck.splice(idx, 1);
  return { deck, indicator, okeyTile };
}

// -----------------------------------------------------------
//   TAŞ DAĞITMA
// -----------------------------------------------------------
function dealTiles(table) {
  let deck = createDeck();
  shuffle(deck);

  const picked = pickOkey(deck);
  deck = picked.deck;
  table.okeyTile = picked.okeyTile;

  const players = table.players.map(p => p.id.toString());
  if (players.length !== 4) return;

  table.hands = {};
  table.discardPile = [];
  table.deck = deck;

  table.currentTurnPlayerId = players[0];

  players.forEach((pid, index) => {
    table.hands[pid] = deck.splice(0, index === 0 ? 15 : 14);
  });
}

// -----------------------------------------------------------
//   TAŞ ÇEKME
// -----------------------------------------------------------
function drawTile(table, userId) {
  if (table.currentTurnPlayerId !== userId.toString()) return null;
  if (table.deck.length === 0) return null;

  const tile = table.deck.shift();
  table.hands[userId].push(tile);
  return tile;
}

// -----------------------------------------------------------
//   TAŞ ATMA
// -----------------------------------------------------------
function discardTile(table, userId, tile) {
  const uid = userId.toString();

  table.hands[uid] = table.hands[uid].filter(
    t => !sameTile(t, tile)
  );

  table.discardPile.push(tile);

  const idx = table.players.findIndex(p => p.id.toString() === uid);
  const next = table.players[(idx + 1) % 4];

  table.currentTurnPlayerId = next.id.toString();

  return next.id.toString();
}

// -----------------------------------------------------------
//   EL GEÇERLİ Mİ? (BİTİŞ KONTROLÜ)
// -----------------------------------------------------------
function checkFinished(table, userId, lastTile) {
  const hand = table.hands[userId];
  const okeyTile = table.okeyTile;

  const applied = applyOkeyToHand(hand, okeyTile);
  return checkWinning(applied, lastTile, okeyTile);
}

// -----------------------------------------------------------
module.exports = {
  tables,
  getOrCreateTable,
  resetTable,
  dealTiles,
  drawTile,
  discardTile,
  checkFinished,
  applyOkeyToHand
};
