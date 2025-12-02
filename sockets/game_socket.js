// sockets/game_socket.js

module.exports = (io, socket, vipRooms) => {
  // ---------------------------------------------------------
  // MASAYI BUL
  // ---------------------------------------------------------
  function findTable(tableId) {
    for (const room of vipRooms) {
      if (!room.tables) continue;
      const table = room.tables.find((t) => t.id === tableId);
      if (table) return { room, table };
    }
    return null;
  }

  // ---------------------------------------------------------
  // TAŞ DESTESİ OLUŞTURMA (106 TAŞ)
  // 4 renk x 2 set x (1–13) = 104 + 2 joker = 106
  // ---------------------------------------------------------
  function createTileDeck() {
    const deck = [];
    const colors = ["blue", "black", "red", "green"];

    // 1–13 arası taşların 2 seti
    for (const color of colors) {
      for (let number = 1; number <= 13; number++) {
        deck.push({ color, number, fakeJoker: false });
        deck.push({ color, number, fakeJoker: false });
      }
    }

    // Joker taşları (2 adet)
    deck.push({ color: "joker", number: 0, fakeJoker: false });
    deck.push({ color: "joker", number: 0, fakeJoker: false });

    return deck;
  }

  // ---------------------------------------------------------
  // DESTEYİ KARIŞTIR (Fisher–Yates)
  // ---------------------------------------------------------
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // ---------------------------------------------------------
  // OKEY BELİRLEME
  // - Bir gösterge taş seçilir (joker olmayan bir taş)
  // - Okey = gösterge ile aynı renkte, numara+1 (13 → 1)
  // - Göstergeyi desteden çıkarıyoruz
  // ---------------------------------------------------------
  function pickOkey(deck) {
    const idx = deck.findIndex((t) => t.color !== "joker");
    if (idx === -1) {
      return { deck, okeyTile: null };
    }

    const indicator = deck[idx];
    const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;

    const okeyTile = {
      color: indicator.color,
      number: okeyNumber,
      fakeJoker: false,
    };

    // Göstergeyi desteden çıkar
    deck.splice(idx, 1);

    return { deck, okeyTile };
  }

  // ---------------------------------------------------------
  // TAŞ DAĞITMA (başlangıç)
  // ---------------------------------------------------------
  function dealTiles(table) {
    let deck = createTileDeck();
    shuffle(deck);

    const picked = pickOkey(deck);
    deck = picked.deck;
    table.okeyTile = picked.okeyTile || null;

    table.deck = deck;
    table.hands = table.hands || {};

    const players = (table.players || []).map((p) => p.id.toString());
    if (!players.length) return;

    // İlk oyuncu 15 taş, diğerleri 14
    table.currentTurnPlayerId = players[0];

    players.forEach((playerId, index) => {
      const handSize = index === 0 ? 15 : 14;
      table.hands[playerId] = deck.splice(0, handSize);
    });

    table.discardPile = table.discardPile || [];
  }

  // ---------------------------------------------------------
  // OYUNU BİTİRME (BASİT)
  // ---------------------------------------------------------
  function finishGame(table, reason = "finished") {
    const scores = table.scores || {};
    const ids = Object.keys(scores);
    if (!ids.length) return;

    let bestId = ids[0];
    let bestScore = scores[bestId];

    for (const id of ids) {
      if (scores[id] > bestScore) {
        bestScore = scores[id];
        bestId = id;
      }
    }

    io.to(table.id).emit("game:finished", {
      reason,
      winnerId: bestId,
      scores,
    });
  }

  // ---------------------------------------------------------
  // MASAYA BAĞLANMA
  // payload: { tableId, userId }
  // ---------------------------------------------------------
  socket.on("game:join_table", ({ tableId, userId }) => {
    if (!userId) {
      console.log("❌ game:join_table → userId yok");
      socket.emit("game:error", { message: "userId eksik" });
      return;
    }

    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.players = table.players || [];

    let user = table.players.find(
      (p) => p && p.id && p.id.toString() === String(userId)
    );

    if (!user) {
      user = {
        id: userId,
        name: "Player",
        avatar: "",
        isGuest: true,
      };
      table.players.push(user);
    }

    socket.join(tableId);

    io.to(tableId).emit("game:player_joined", {
      user,
      tableId,
    });
  });

  // ---------------------------------------------------------
  // OYUN BAŞLATMA
  // payload: tableId veya { tableId }
  // ---------------------------------------------------------
  socket.on("game:start", (payload) => {
    const tableId =
      typeof payload === "string"
        ? payload
        : payload && payload.tableId
        ? payload.tableId
        : null;

    if (!tableId) return;

    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    table.players = table.players || [];

    if (table.players.length < 2) {
      io.to(tableId).emit("game:error", {
        message: "Oyun başlamak için en az 2 oyuncu gerekir.",
      });
      return;
    }

    // Skorları başlat (herkes 1000)
    table.scores = table.scores || {};
    table.players.forEach((p) => {
      const pid = p.id.toString();
      if (table.scores[pid] == null) {
        table.scores[pid] = 1000;
      }
    });

    // Dağıt
    dealTiles(table);

    io.to(tableId).emit("game:state_changed", {
      hands: table.hands,
      currentTurnPlayerId: table.currentTurnPlayerId,
      okey: table.okeyTile || null,
    });
  });

  // ---------------------------------------------------------
  // TAŞ ÇEKME
  // payload: { tableId, userId }
  // ---------------------------------------------------------
  socket.on("game:draw_tile", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (!table.deck || !table.hands) return;
    if (table.currentTurnPlayerId !== String(userId)) return;

    if (table.deck.length === 0) {
      finishGame(table, "deck_empty");
      return;
    }

    const tile = table.deck.shift();

    const uid = String(userId);
    table.hands[uid] = table.hands[uid] || [];
    table.hands[uid].push(tile);

    io.to(tableId).emit("game:tile_drawn", {
      tableId,
      userId: uid,
      tile,
    });
  });

  // ---------------------------------------------------------
  // TAŞ ATMA
  // payload: { tableId, tile: {number,color,fakeJoker}, userId }
  // ---------------------------------------------------------
  socket.on("game:discard_tile", ({ tableId, tile, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    if (!table.hands || !table.players) return;

    const uid = String(userId);

    if (table.currentTurnPlayerId !== uid) return;

    const hand = table.hands[uid] || [];
    table.hands[uid] = hand.filter(
      (t) =>
        !(
          t.color === tile.color &&
          t.number === tile.number &&
          !!t.fakeJoker === !!tile.fakeJoker
        )
    );

    table.discardPile = table.discardPile || [];
    table.discardPile.push(tile);

    const idx = table.players.findIndex(
      (p) => p && p.id && p.id.toString() === uid
    );
    if (idx === -1) return;

    const nextIndex = (idx + 1) % table.players.length;
    table.currentTurnPlayerId = table.players[nextIndex].id.toString();

    io.to(tableId).emit("game:tile_discarded", {
      tableId,
      tile,
      userId: uid,
      nextTurn: table.currentTurnPlayerId,
    });
  });

  // ---------------------------------------------------------
  // MASADAN AYRILMA
  // payload: { tableId, userId }
  // ---------------------------------------------------------
  socket.on("game:leave_table", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = String(userId);

    table.players = (table.players || []).filter(
      (p) => !p || !p.id || p.id.toString() !== uid
    );

    if (table.hands && table.hands[uid]) {
      delete table.hands[uid];
    }

    io.to(tableId).emit("game:player_left", {
      userId: uid,
      tableId,
    });

    socket.leave(tableId);
  });

  // ---------------------------------------------------------
  // CLIENT SOKET KAPANDI
  // ---------------------------------------------------------
  socket.on("disconnect", () => {
    console.log("Game socket disconnected:", socket.id);
  });
};
