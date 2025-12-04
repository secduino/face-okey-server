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
  // DESTE OLUŞTURMA (106 TAŞ)
  // ---------------------------------------------------------
  function createTileDeck() {
    const deck = [];
    const colors = ["red", "yellow", "black", "blue"];
    
    // Her renkten 1-13 arası, her sayıdan 2 adet
    for (const color of colors) {
      for (let number = 1; number <= 13; number++) {
        deck.push({ color, number, fakeJoker: false });
        deck.push({ color, number, fakeJoker: false });
      }
    }
    
    return deck;
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // ✅ REFERANSA GÖRE: Gösterge + Okey + Sahte Okey
  function pickIndicatorAndOkey(deck) {
    shuffle(deck);
    
    // İlk taş gösterge taşı
    const indicator = deck[0];
    deck.splice(0, 1);
    
    // Okey = Gösterge + 1
    let okeyNumber = indicator.number + 1;
    if (okeyNumber > 13) okeyNumber = 1;
    
    const okeyTile = {
      color: indicator.color,
      number: okeyNumber,
      fakeJoker: false,
      isOkey: true
    };
    
    // ✅ 2 SAHTE OKEY EKLE (Referanstaki gibi)
    const fakeOkey1 = {
      color: okeyTile.color,
      number: okeyTile.number,
      fakeJoker: true
    };
    
    const fakeOkey2 = {
      color: okeyTile.color,
      number: okeyTile.number,
      fakeJoker: true
    };
    
    deck.push(fakeOkey1);
    deck.push(fakeOkey2);
    
    shuffle(deck); // Son karıştırma
    
    return { deck, okeyTile, indicator };
  }

  // ---------------------------------------------------------
  // TAŞ DAĞITMA
  // ---------------------------------------------------------
  function dealTiles(table) {
    let deck = createTileDeck();
    
    const { deck: finalDeck, okeyTile, indicator } = pickIndicatorAndOkey(deck);
    
    table.deck = finalDeck;
    table.okeyTile = okeyTile;
    table.indicator = indicator;
    table.discardPile = [];
    table.lastDiscardedByPlayer = {}; // Her oyuncunun son attığı taş
    table.hands = {};
    table.canDrawTile = {}; // Taş çekme hakkı
    table.hasDrawnThisTurn = false;
    table.turn = 0;

    const players = table.players.map(p => p.id.toString());
    table.currentTurnPlayerId = players[0];

    // ✅ İlk oyuncu 15, diğerleri 14 taş
    players.forEach((pid, index) => {
      const take = index === 0 ? 15 : 14;
      table.hands[pid] = finalDeck.splice(0, take);
      table.canDrawTile[pid] = false;
      
      // Taşları sırala
      table.hands[pid].sort((a, b) => {
        if (a.color === b.color) {
          return a.number - b.number;
        }
        return a.color.localeCompare(b.color);
      });
    });

    // İlk oyuncuya çekme hakkı ver
    table.canDrawTile[players[0]] = true;

    console.log("✅ Taşlar dağıtıldı!");
    console.log("   Gösterge:", indicator);
    console.log("   Okey:", okeyTile);
    console.log("   Destede kalan:", finalDeck.length);
  }

  // ---------------------------------------------------------
  // OYUN BİTİŞ KONTROLÜ
  // ---------------------------------------------------------
  function checkGameEnd(table, userId) {
    const hand = table.hands[userId];
    
    // El bitti mi?
    if (hand.length === 0) {
      return { finished: true, winnerId: userId };
    }

    // Deste bitti mi?
    if (table.deck.length === 0) {
      return { finished: true, winnerId: null };
    }

    return { finished: false };
  }

  // ---------------------------------------------------------
  // MASAYA GİRİŞ
  // ---------------------------------------------------------
  socket.on("game:join_table", ({ tableId, userId }) => {
    console.log("🎮 game:join_table -", { tableId, userId });

    const info = findTable(tableId);
    if (!info) {
      console.log("❌ Masa bulunamadı:", tableId);
      return;
    }

    const { table } = info;

    if (!table.ownerId) {
      table.ownerId = userId;
    }

    table.players = table.players || [];
    table.ready = table.ready || {};

    let user = table.players.find(p => p.id.toString() === String(userId));

    if (!user) {
      user = {
        id: userId,
        name: "Player" + (table.players.length + 1),
        avatar: "",
        isGuest: true
      };
      table.players.push(user);
    }

    table.ready[user.id.toString()] = false;

    socket.join(tableId);

    io.to(tableId).emit("game:player_joined", {
      tableId,
      user
    });

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });

    console.log("✅ Oyuncu masaya eklendi:", user.id);
  });

  // ---------------------------------------------------------
  // HAZIR TOGGLE
  // ---------------------------------------------------------
  socket.on("game:set_ready", ({ tableId, userId, ready }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = userId.toString();
    table.ready[uid] = ready === true;

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });
  });

  // ---------------------------------------------------------
  // OYUN BAŞLAT
  // ---------------------------------------------------------
  socket.on("game:start", (payload) => {
    const tableId = payload?.tableId || null;
    
    if (!tableId) {
      socket.emit("game:error", { message: "tableId gerekli" });
      return;
    }

    const info = findTable(tableId);
    if (!info) {
      socket.emit("game:error", { message: "Masa bulunamadı" });
      return;
    }

    const { table } = info;

    if (table.players.length !== 4) {
      socket.emit("game:error", { message: "4 kişi olmalı" });
      return;
    }

    const allReady = table.players.every(p => {
      return table.ready[p.id.toString()] === true;
    });

    if (!allReady) {
      socket.emit("game:error", { message: "Tüm oyuncular hazır değil" });
      return;
    }

    dealTiles(table);

    // ✅ Her oyuncuya kendi elini + genel bilgiyi gönder
    table.players.forEach((player) => {
      const pid = player.id.toString();
      
      io.to(socket.id).emit("game:state_changed", {
        hand: table.hands[pid],
        currentTurnPlayerId: table.currentTurnPlayerId,
        okey: table.okeyTile,
        indicator: table.indicator,
        deckCount: table.deck.length,
        canDrawTile: table.canDrawTile[pid],
        yourPlayerId: pid,
        turn: table.turn
      });
    });

    // Herkese genel bilgi gönder
    io.to(tableId).emit("game:started", {
      currentTurnPlayerId: table.currentTurnPlayerId,
      indicator: table.indicator,
      deckCount: table.deck.length
    });

    console.log("✅ OYUN BAŞLADI!");
  });

  // ---------------------------------------------------------
  // TAŞ ÇEK
  // ---------------------------------------------------------
  socket.on("game:draw_tile", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = userId.toString();

    // Sıra kontrolü
    if (table.currentTurnPlayerId !== uid) {
      socket.emit("game:error", { message: "Sıra sende değil" });
      return;
    }

    // ✅ TAŞ ÇEKME HAKKI VAR MI?
    if (!table.canDrawTile[uid]) {
      socket.emit("game:error", { message: "Taş çekme hakkın yok" });
      return;
    }

    // ✅ BU TURDA ZATEN TAŞ ÇEKİLDİ Mİ?
    if (table.hasDrawnThisTurn) {
      socket.emit("game:error", { message: "Bu turda zaten taş çektin" });
      return;
    }

    if (table.deck.length === 0) {
      socket.emit("game:error", { message: "Deste boş" });
      
      io.to(tableId).emit("game:finished", {
        winnerId: null,
        reason: "Deste bitti"
      });
      return;
    }

    const tile = table.deck.shift();
    table.hands[uid].push(tile);
    table.hasDrawnThisTurn = true;
    table.canDrawTile[uid] = false; // Artık atması lazım

    console.log("✅ Taş çekildi:", tile);

    // Sadece çeken oyuncuya taşı gönder
    socket.emit("game:tile_drawn", {
      tableId,
      userId: uid,
      tile,
      deckCount: table.deck.length
    });

    // Diğerlerine sadece deste sayısını gönder
    socket.to(tableId).emit("game:deck_updated", {
      deckCount: table.deck.length,
      playerWhoDrawn: uid
    });
  });

  // ---------------------------------------------------------
  // TAŞ AT
  // ---------------------------------------------------------
  socket.on("game:discard_tile", ({ tableId, tile, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = userId.toString();

    // Sıra kontrolü
    if (table.currentTurnPlayerId !== uid) {
      socket.emit("game:error", { message: "Sıra sende değil" });
      return;
    }

    // ✅ TAŞ ÇEKMEDEN ATAMAZ
    if (!table.hasDrawnThisTurn) {
      socket.emit("game:error", { message: "Önce taş çekmelisin" });
      return;
    }

    // Elinden taşı kaldır
    const hand = table.hands[uid];
    const tileIndex = hand.findIndex(
      t =>
        t.number === tile.number &&
        t.color === tile.color &&
        !!t.fakeJoker === !!tile.fakeJoker
    );

    if (tileIndex === -1) {
      socket.emit("game:error", { message: "Bu taş elde yok" });
      return;
    }

    hand.splice(tileIndex, 1);
    table.discardPile.push(tile);
    table.lastDiscardedByPlayer[uid] = tile; // Son atılan taşı kaydet

    // ✅ SIRA DEĞİŞTİR
    const idx = table.players.findIndex(
      p => p.id.toString() === uid
    );
    const next = table.players[(idx + 1) % 4];
    table.currentTurnPlayerId = next.id.toString();
    table.hasDrawnThisTurn = false;
    table.canDrawTile[next.id.toString()] = true; // Yeni oyuncuya çekme hakkı
    table.turn += 1;

    console.log("✅ Taş atıldı. Yeni sıra:", next.name || next.id);

    io.to(tableId).emit("game:tile_discarded", {
      tableId,
      tile,
      userId: uid,
      nextTurn: table.currentTurnPlayerId,
      turn: table.turn
    });

    // ✅ OYUN BİTİŞ KONTROLÜ
    const endCheck = checkGameEnd(table, uid);
    if (endCheck.finished) {
      io.to(tableId).emit("game:finished", {
        winnerId: endCheck.winnerId,
        scores: {},
        reason: endCheck.winnerId ? "El bitti" : "Berabere"
      });

      console.log("🏆 OYUN BİTTİ! Kazanan:", endCheck.winnerId || "Berabere");
    }
  });

  // ---------------------------------------------------------
  // MASADAN AYRИЛMA
  // ---------------------------------------------------------
  socket.on("game:leave_table", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.players = table.players.filter(
      p => p.id.toString() !== userId.toString()
    );

    delete table.ready[userId];
    delete table.hands?.[userId];
    delete table.canDrawTile?.[userId];

    socket.leave(tableId);

    io.to(tableId).emit("game:player_left", {
      tableId,
      userId
    });

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });

    console.log("✅ Oyuncu masadan ayrıldı:", userId);
  });

  // ---------------------------------------------------------
  // DISCONNECT
  // ---------------------------------------------------------
  socket.on("disconnect", () => {
    console.log("❌ Game socket disconnected:", socket.id);
    
    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.leave(roomId);
      }
    });
  });
};
