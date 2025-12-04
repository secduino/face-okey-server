// sockets/game_socket.js

module.exports = (io, socket, vipRooms) => {

  // ---------------------------------------------------------
  // MASAYI BUL - VİP ROOMS'TA ARA
  // ---------------------------------------------------------
  function findTable(tableId) {
    console.log("🔍 findTable aramaya başlıyor:", tableId);
    
    for (const room of vipRooms) {
      if (!room.tables) continue;
      
      const table = room.tables.find(t => t.id === tableId);
      if (table) {
        console.log("✅ Masa bulundu! Room:", room.id);
        return { room, table };
      }
    }
    
    console.log("❌ Masa bulunamadı! vipRooms sayısı:", vipRooms.length);
    if (vipRooms.length > 0) {
      console.log("   Toplam masalar:", vipRooms[0].tables?.length || 0);
    }
    return null;
  }

  // ---------------------------------------------------------
  // DESTE OLUŞTURMA (106 TAŞ)
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

    // Jokerler
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
    const next = indicator.number === 13 ? 1 : indicator.number + 1;

    const okeyTile = {
      color: indicator.color,
      number: next,
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

    const pick = pickOkey(deck);
    deck = pick.deck;
    table.okeyTile = pick.okeyTile;

    table.deck = deck;
    table.discardPile = [];
    table.hands = {};

    const players = table.players.map(p => p.id.toString());
    table.currentTurnPlayerId = players[0];

    players.forEach((pid, index) => {
      const take = index === 0 ? 15 : 14;
      table.hands[pid] = deck.splice(0, take);
    });
  }

  // ---------------------------------------------------------
  // MASAYA GİRİŞ - OWNER AYARLA
  // ---------------------------------------------------------
  socket.on("game:join_table", ({ tableId, userId }) => {
    console.log("🎮 game:join_table -", { tableId, userId });

    const info = findTable(tableId);
    if (!info) {
      console.log("❌ Masa bulunamadı:", tableId);
      return;
    }

    const { table } = info;

    // ✅ OWNER AYARLA (ilk gelen)
    if (!table.ownerId) {
      table.ownerId = userId;
      console.log("🔑 Owner belirlenmiştir:", table.ownerId);
    }

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

    // Yeni gelen hazır değil
    table.ready[user.id.toString()] = false;

    socket.join(tableId);

    // ✅ TÜM MASAYA OYUNCU EKLENDÄ°Nİ BİLDİR
    io.to(tableId).emit("game:player_joined", {
      tableId,
      user
    });

    // ✅ TÜM MASAYA HAZIR DURUMUNU GÖNDER
    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });

    console.log("✅ Oyuncu masaya eklendi:", user.id, "Toplam:", table.players.length);
  });

  // ---------------------------------------------------------
  // HAZIR TOGGLE (Hazır ↔ Hazır Değil)
  // ---------------------------------------------------------
  socket.on("game:set_ready", ({ tableId, userId, ready }) => {
    console.log("🎮 game:set_ready -", { tableId, userId, ready });

    const info = findTable(tableId);
    if (!info) {
      console.log("❌ Masa bulunamadı:", tableId);
      return;
    }

    const { table } = info;
    const uid = userId.toString();
    table.ready[uid] = ready === true;

    console.log("📊 Ready status:", table.ready);

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });
  });

  // ---------------------------------------------------------
  // BAŞLATMA - HERKES BAŞLATABILIR (Herkesi hazır ise)
  // ---------------------------------------------------------
  socket.on("game:start", (payload) => {
    console.log("🎮 game:start event geldi:", payload);

    const tableId = payload?.tableId || null;
    const userId = payload?.userId || null;

    console.log("🔍 tableId:", tableId, "userId:", userId);

    if (!tableId) {
      console.log("❌ tableId yok!");
      socket.emit("game:error", { message: "tableId gerekli" });
      return;
    }

    const info = findTable(tableId);
    if (!info) {
      console.log("❌ Masa bulunamadı:", tableId);
      socket.emit("game:error", { message: "Masa bulunamadı" });
      return;
    }

    const { table } = info;

    console.log("📋 Masa bilgisi:", {
      ownerId: table.ownerId,
      userId: userId,
      playersCount: table.players.length,
      ready: table.ready
    });

    // 4 oyuncu kontrolü
    if (table.players.length !== 4) {
      console.log("❌ 4 oyuncu yok. Mevcut:", table.players.length);
      socket.emit("game:error", { message: "Oyun 4 kişi olmadan başlayamaz" });
      return;
    }

    // Herkesi hazır kontrol
    console.log("🔍 Oyuncuların hazır durumu:");
    const allReady = table.players.every(p => {
      const uid = p.id.toString();
      const isReady = table.ready[uid] === true;
      console.log(`  - ${p.name} (${uid}): ${isReady ? "✅" : "❌"}`);
      return isReady;
    });

    if (!allReady) {
      console.log("❌ Tüm oyuncular hazır değil");
      socket.emit("game:error", { message: "Tüm oyuncular hazır değil" });
      return;
    }

    // ✅ OYUN BAŞLAT!
    console.log("✅ OYUN BAŞLATILIYOR...");
    dealTiles(table);

    console.log("📤 game:state_changed event gönderiliyor");
    console.log("   hands:", Object.keys(table.hands).length, "oyuncu");
    console.log("   okey:", table.okeyTile);
    console.log("   currentTurnPlayerId:", table.currentTurnPlayerId);

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
    console.log("🎮 game:draw_tile -", { tableId, userId });

    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    if (table.currentTurnPlayerId !== String(userId)) {
      console.log("❌ Sıra bu oyuncuya ait değil");
      return;
    }

    if (table.deck.length === 0) {
      console.log("❌ Deste boş");
      return;
    }

    const tile = table.deck.shift();
    table.hands[userId].push(tile);

    console.log("✅ Taş çekildi:", tile);

    io.to(tableId).emit("game:tile_drawn", {
      tableId,
      userId,
      tile
    });
  });

  // ---------------------------------------------------------
  // TAŞ AT
  // ---------------------------------------------------------
  socket.on("game:discard_tile", ({ tableId, tile, userId }) => {
    console.log("🎮 game:discard_tile -", { tableId, tile, userId });

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

    const idx = table.players.findIndex(
      p => p.id.toString() === userId.toString()
    );

    const next = table.players[(idx + 1) % 4];
    table.currentTurnPlayerId = next.id.toString();

    console.log("✅ Taş atıldı. Sıra:", next.name);

    io.to(tableId).emit("game:tile_discarded", {
      tableId,
      tile,
      userId,
      nextTurn: table.currentTurnPlayerId
    });
  });

  // ---------------------------------------------------------
  // MASADAN AYRИЛMA
  // ---------------------------------------------------------
  socket.on("game:leave_table", ({ tableId, userId }) => {
    console.log("🎮 game:leave_table -", { tableId, userId });

    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.players = table.players.filter(
      p => p.id.toString() !== userId.toString()
    );

    delete table.ready[userId];
    delete table.hands?.[userId];

    socket.leave(tableId);

    io.to(tableId).emit("game:player_left", {
      tableId,
      userId
    });

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });

    console.log("✅ Oyuncu masadan ayrıldı");
  });

  // ---------------------------------------------------------
  // SOKET KAPANDI
  // ---------------------------------------------------------
  socket.on("disconnect", () => {
    console.log("❌ Game socket disconnected:", socket.id);
    
    // ✅ OYUNCUNUN TÜM TABLE ROOM'LARDAN AYRILMASINI SAĞLA
    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.leave(roomId);
        console.log("🚪 Socket left table room:", roomId);
      }
    });
  });
};
