// sockets/game_socket.js

module.exports = (io, socket, vipRooms) => {
  // ---------------------------------------------------------
  // MASAYI BUL
  // ---------------------------------------------------------
  function findTable(tableId) {
    for (const room of vipRooms) {
      if (!room.tables) continue;
      const table = room.tables.find(t => t.id === tableId);
      if (table) return { room, table };
    }
    return null;
  }

  // ---------------------------------------------------------
  // DESTE OLUŞTURMA
  // ---------------------------------------------------------
  function createTileDeck() {
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

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  function pickOkey(deck) {
    const idx = deck.findIndex(t => t.color !== "joker");
    if (idx === -1) return { deck, okeyTile: null };

    const indicator = deck[idx];
    const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;

    const okeyTile = {
      color: indicator.color,
      number: okeyNumber,
      fakeJoker: false
    };

    deck.splice(idx, 1);
    return { deck, okeyTile };
  }

  // ---------------------------------------------------------
  // TAŞ DAĞITMA
  // ---------------------------------------------------------
  function dealTiles(table) {
    let deck = createTileDeck();
    shuffle(deck);

    const { deck: d, okeyTile } = pickOkey(deck);
    deck = d;

    table.okeyTile = okeyTile;
    table.deck = deck;
    table.hands = {};
    table.discardPile = [];

    const players = table.players.map(p => p.id.toString());
    table.currentTurnPlayerId = players[0];

    players.forEach((pid, index) => {
      const handSize = index === 0 ? 15 : 14;
      table.hands[pid] = deck.splice(0, handSize);
    });
  }

  // ---------------------------------------------------------
  // MASAYA GİRİŞ
  // ---------------------------------------------------------
  socket.on("game:join_table", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.players = table.players || [];
    table.ready = table.ready || {};

    let user = table.players.find(p => p.id.toString() === String(userId));

    if (!user) {
      user = {
        id: userId,
        name: "Player",
        avatar: "",
        isGuest: true
      };
      table.players.push(user);
    }

    table.ready[user.id] = false;

    socket.join(tableId);

    io.to(tableId).emit("game:player_joined", {
      tableId,
      user
    });
  });

  // ---------------------------------------------------------
  // HAZIR BUTONU
  // ---------------------------------------------------------
  socket.on("game:ready", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.ready[userId] = true;

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });
  });

  // ---------------------------------------------------------
  // BAŞLATMA — SADECE MASA SAHİBİ
  // ---------------------------------------------------------
  socket.on("game:start", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (table.ownerId.toString() !== userId.toString()) {
      socket.emit("game:error", { message: "Bu masayı sadece sahibi başlatabilir." });
      return;
    }

    if (table.players.length !== 4) {
      socket.emit("game:error", { message: "Oyun 4 kişi olmadan başlayamaz." });
      return;
    }

    if (!Object.values(table.ready).every(v => v === true)) {
      socket.emit("game:error", { message: "Tüm oyuncular hazır değil." });
      return;
    }

    dealTiles(table);

    io.to(tableId).emit("game:state_changed", {
      hands: table.hands,
      currentTurnPlayerId: table.currentTurnPlayerId,
      okey: table.okeyTile
    });
  });

  // ---------------------------------------------------------
  // TAŞ ÇEK
  // ---------------------------------------------------------
  socket.on("game:draw_tile", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (table.currentTurnPlayerId !== String(userId)) return;

    if (table.deck.length === 0) return;

    const tile = table.deck.shift();

    table.hands[userId].push(tile);

    io.to(tableId).emit("game:tile_drawn", {
      tableId,
      userId,
      tile
    });
  });

  // ---------------------------------------------------------
  // TAŞ ATMA
  // ---------------------------------------------------------
  socket.on("game:discard_tile", ({ tableId, tile, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.hands[userId] = table.hands[userId].filter(
      t =>
        !(
          t.number === tile.number &&
          t.color === tile.color &&
          !!t.fakeJoker === !!tile.fakeJoker
        )
    );

    table.discardPile.push(tile);

    const idx = table.players.findIndex(p => p.id.toString() === userId.toString());
    const next = table.players[(idx + 1) % 4];

    table.currentTurnPlayerId = next.id.toString();

    io.to(tableId).emit("game:tile_discarded", {
      tableId,
      tile,
      userId,
      nextTurn: table.currentTurnPlayerId
    });
  });
};
