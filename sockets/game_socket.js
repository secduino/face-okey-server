// sockets/game_socket.js

module.exports = (io, socket, vipRooms) => {

  // ---------------------------------------------------------
  // MASAYI BUL
  // ---------------------------------------------------------
  function findTable(tableId) {
    for (const room of vipRooms) {
      const table = room.tables.find(t => t.id === tableId);
      if (table) return { room, table };
    }
    return null;
  }

  // ---------------------------------------------------------
  // TAŞ DESTESİ OLUŞTURMA
  // ---------------------------------------------------------
  function createTileDeck() {
    const deck = [];

    const colors = ["blue", "black", "red", "green"];
    const startIndex = {
      blue: 1,
      black: 14,
      red: 27,
      green: 40
    };

    // 1–13 arası taşların 2 seti
    for (const color of colors) {
      const base = startIndex[color];
      for (let i = 0; i < 13; i++) {
        const tileIndex = base + i;
        const fileName = `tile${tileIndex}.png`;

        deck.push({ color, number: i + 1, assetPath: "assets/tiles/" + fileName });
        deck.push({ color, number: i + 1, assetPath: "assets/tiles/" + fileName });
      }
    }

    // Joker taşları (tile53, tile54)
    deck.push({ color: "joker", number: 0, assetPath: "assets/tiles/tile53.png" });
    deck.push({ color: "joker", number: 0, assetPath: "assets/tiles/tile54.png" });

    return deck;
  }

  // ---------------------------------------------------------
  // DESTEYİ KARIŞTIR
  // ---------------------------------------------------------
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // ---------------------------------------------------------
  // TAS DAĞITMA (başlangıç)
  // ---------------------------------------------------------
  function dealTiles(table) {
    const deck = createTileDeck();
    shuffle(deck);

    table.deck = deck;
    table.hands = {};

    const players = table.players.map(p => p.id);

    // İlk oyuncu 15 taş alır
    table.currentTurnPlayerId = players[0];

    players.forEach((playerId, index) => {
      const handSize = index === 0 ? 15 : 14;
      table.hands[playerId] = deck.splice(0, handSize);
    });
  }

  // ---------------------------------------------------------
  // MASAYA BAĞLANMA
  // ---------------------------------------------------------
  socket.on("game:join_table", ({ tableId, user }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (!table.players.find(p => p.id === user.id)) {
      table.players.push(user);
    }

    // Socket masaya katılır
    socket.join(tableId);

    // Tüm oyunculara duyur
    io.to(tableId).emit("game:player_joined", {
      user,
      tableId
    });
  });

  // ---------------------------------------------------------
  // OYUN BAŞLATMA
  // ---------------------------------------------------------
  socket.on("game:start", (tableId) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (table.players.length < 2) {
      io.to(tableId).emit("game:error", {
        message: "Oyun başlamak için en az 2 oyuncu gerekir."
      });
      return;
    }

    // Dağıt
    dealTiles(table);

    // Tüm oyunculara gönder
    io.to(tableId).emit("game:state_changed", {
      hands: table.hands,
      currentTurnPlayerId: table.currentTurnPlayerId
    });
  });

  // ---------------------------------------------------------
  // TAŞ ÇEKME
  // ---------------------------------------------------------
  socket.on("game:draw_tile", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (table.currentTurnPlayerId !== userId) return;

    if (table.deck.length === 0) return;

    const tile = table.deck.shift();
    table.hands[userId].push(tile);

    io.to(tableId).emit("game:tile_drawn", { tile, userId });
  });

  // ---------------------------------------------------------
  // TAŞ ATMA
  // ---------------------------------------------------------
  socket.on("game:discard_tile", ({ tableId, tile, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (table.currentTurnPlayerId !== userId) return;

    // ELİNDEN TAŞI ÇIKAR
    table.hands[userId] = table.hands[userId].filter(
      (t) => !(t.color === tile.color && t.number === tile.number)
    );

    // SIRA DEĞİŞTİR
    const index = table.players.findIndex(p => p.id === userId);
    const nextIndex = (index + 1) % table.players.length;
    table.currentTurnPlayerId = table.players[nextIndex].id;

    // Tüm oyunculara duyur
    io.to(tableId).emit("game:tile_discarded", {
      tile,
      userId,
      nextTurn: table.currentTurnPlayerId
    });
  });

  // ---------------------------------------------------------
  // OYUNCU AYRILDI
  // ---------------------------------------------------------
  socket.on("game:leave_table", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.players = table.players.filter(p => p.id !== userId);

    io.to(tableId).emit("game:player_left", { userId });

    socket.leave(tableId);
  });

  // ---------------------------------------------------------
  // CLIENT SOKET KAPANDI
  // ---------------------------------------------------------
  socket.on("disconnect", () => {
    console.log("Game socket disconnected:", socket.id);
  });

};
