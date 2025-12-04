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

  function pickIndicatorAndOkey(deck) {
    shuffle(deck);
    
    const indicator = deck[0];
    deck.splice(0, 1);
    
    let okeyNumber = indicator.number + 1;
    if (okeyNumber > 13) okeyNumber = 1;
    
    const okeyTile = {
      color: indicator.color,
      number: okeyNumber,
      fakeJoker: false,
      isOkey: true
    };
    
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
    
    shuffle(deck);
    
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
    table.canDrawTile = {};
    table.hasDrawnThisTurn = false;
    table.turn = 0;

    const players = table.players.map(p => p.id.toString());
    table.currentTurnPlayerId = players[0];

    players.forEach((pid, index) => {
      const take = index === 0 ? 15 : 14;
      table.hands[pid] = finalDeck.splice(0, take);
      table.canDrawTile[pid] = false;
      
      table.hands[pid].sort((a, b) => {
        if (a.color === b.color) {
          return a.number - b.number;
        }
        return a.color.localeCompare(b.color);
      });
    });

    table.canDrawTile[players[0]] = true;

    console.log("✅ Taşlar dağıtıldı!");
  }

  // ---------------------------------------------------------
  // EL KONTROLÜ (ÇİFT + SERİ VALİDASYONU)
  // ---------------------------------------------------------
  function validateHand(hand, okeyTile) {
    // El boşsa geçerli
    if (hand.length === 0) return { valid: true, reason: "El tamamlandı" };
    
    // Sadece 1 taş kalmışsa geçerli (son atılan)
    if (hand.length === 1) return { valid: true, reason: "Son taş atılacak" };

    // Çift + Seri kontrolü
    const tiles = [...hand];
    const groups = [];
    
    // Okey sayısını bul
    const okeyCount = tiles.filter(t => 
      t.color === okeyTile.color && 
      t.number === okeyTile.number
    ).length;

    // Basit validasyon: Tüm taşlar çift veya 3'lü olmalı
    const grouped = {};
    tiles.forEach(tile => {
      const key = `${tile.color}-${tile.number}`;
      grouped[key] = (grouped[key] || 0) + 1;
    });

    // Her grubun 2 veya daha fazla olması lazım
    let validGroups = 0;
    let totalInGroups = 0;

    for (const count of Object.values(grouped)) {
      if (count >= 2) {
        validGroups++;
        totalInGroups += count;
      }
    }

    // Okey varsa esneklik ver
    const remaining = tiles.length - totalInGroups;
    if (remaining <= okeyCount) {
      return { valid: true, reason: "El geçerli (okey ile)" };
    }

    // Kalan taş 2'den azsa kabul et
    if (remaining <= 2) {
      return { valid: true, reason: "El geçerli" };
    }

    return { valid: false, reason: "El geçersiz - taşlar gruplanmamış" };
  }

  // ---------------------------------------------------------
  // MASAYA GİRİŞ
  // ---------------------------------------------------------
  socket.on("game:join_table", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

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
        avatar: ""
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

    table.players.forEach((player) => {
      const pid = player.id.toString();
      
      const playerSocket = [...io.sockets.sockets.values()].find(
        s => s.id === player.socketId
      );
      
      if (playerSocket) {
        playerSocket.emit("game:state_changed", {
          hand: table.hands[pid],
          currentTurnPlayerId: table.currentTurnPlayerId,
          okey: table.okeyTile,
          indicator: table.indicator,
          deckCount: table.deck.length,
          canDrawTile: table.canDrawTile[pid],
          yourPlayerId: pid,
          turn: table.turn
        });
      }
    });

    io.to(tableId).emit("game:started", {
      currentTurnPlayerId: table.currentTurnPlayerId,
      indicator: table.indicator,
      deckCount: table.deck.length
    });
  });

  // ---------------------------------------------------------
  // TAŞ ÇEK (ORTADAN)
  // ---------------------------------------------------------
  socket.on("game:draw_tile", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = userId.toString();

    if (table.currentTurnPlayerId !== uid) {
      socket.emit("game:error", { message: "Sıra sende değil" });
      return;
    }

    if (!table.canDrawTile[uid]) {
      socket.emit("game:error", { message: "Taş çekme hakkın yok" });
      return;
    }

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
    table.canDrawTile[uid] = false;

    console.log("✅ Taş çekildi (ortadan):", tile);

    socket.emit("game:tile_drawn", {
      tableId,
      userId: uid,
      tile,
      deckCount: table.deck.length
    });

    socket.to(tableId).emit("game:deck_updated", {
      deckCount: table.deck.length,
      playerWhoDrawn: uid
    });
  });

  // ---------------------------------------------------------
  // ✅ TAŞ ÇEK (SOLDAN)
  // ---------------------------------------------------------
  socket.on("game:draw_from_left", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = userId.toString();

    if (table.currentTurnPlayerId !== uid) {
      socket.emit("game:error", { message: "Sıra sende değil" });
      return;
    }

    if (!table.canDrawTile[uid]) {
      socket.emit("game:error", { message: "Taş çekme hakkın yok" });
      return;
    }

    if (table.hasDrawnThisTurn) {
      socket.emit("game:error", { message: "Bu turda zaten taş çektin" });
      return;
    }

    // Sol oyuncunun ID'sini bul
    const myIndex = table.players.findIndex(p => p.id.toString() === uid);
    const leftPlayerIndex = (myIndex - 1 + 4) % 4;
    const leftPlayerId = table.players[leftPlayerIndex].id.toString();

    // Sol oyuncunun son attığı taş
    const leftTile = table.lastDiscardedByPlayer[leftPlayerId];

    if (!leftTile) {
      socket.emit("game:error", { message: "Solda taş yok" });
      return;
    }

    table.hands[uid].push(leftTile);
    delete table.lastDiscardedByPlayer[leftPlayerId]; // Taş alındı, sil
    table.hasDrawnThisTurn = true;
    table.canDrawTile[uid] = false;

    console.log("✅ Taş çekildi (soldan):", leftTile);

    socket.emit("game:tile_drawn", {
      tableId,
      userId: uid,
      tile: leftTile,
      fromLeft: true,
      deckCount: table.deck.length
    });

    socket.to(tableId).emit("game:tile_taken_from_left", {
      playerWhoTook: uid,
      leftPlayerId: leftPlayerId
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

    if (table.currentTurnPlayerId !== uid) {
      socket.emit("game:error", { message: "Sıra sende değil" });
      return;
    }

    if (!table.hasDrawnThisTurn) {
      socket.emit("game:error", { message: "Önce taş çekmelisin" });
      return;
    }

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
    table.lastDiscardedByPlayer[uid] = tile;

    const idx = table.players.findIndex(
      p => p.id.toString() === uid
    );
    const next = table.players[(idx + 1) % 4];
    table.currentTurnPlayerId = next.id.toString();
    table.hasDrawnThisTurn = false;
    table.canDrawTile[next.id.toString()] = true;
    table.turn += 1;

    console.log("✅ Taş atıldı:", tile);

    io.to(tableId).emit("game:tile_discarded", {
      tableId,
      tile,
      userId: uid,
      nextTurn: table.currentTurnPlayerId,
      turn: table.turn
    });

    // ✅ OYUN BİTİŞ KONTROLÜ
    if (hand.length === 0) {
      io.to(tableId).emit("game:finished", {
        winnerId: uid,
        reason: "Oyunu bitirdi!"
      });
      console.log("🏆 OYUN BİTTİ! Kazanan:", uid);
    }
  });

  // ---------------------------------------------------------
  // ✅ OYUN BİTİR (EL KONTROLÜ İLE)
  // ---------------------------------------------------------
  socket.on("game:finish", ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = userId.toString();

    if (table.currentTurnPlayerId !== uid) {
      socket.emit("game:error", { message: "Sıra sende değil" });
      return;
    }

    const hand = table.hands[uid];
    
    // El kontrolü
    const validation = validateHand(hand, table.okeyTile);

    if (!validation.valid) {
      socket.emit("game:error", { 
        message: `Oyunu bitiremezsin: ${validation.reason}` 
      });
      return;
    }

    // Oyun bitti!
    io.to(tableId).emit("game:finished", {
      winnerId: uid,
      reason: validation.reason,
      hand: hand
    });

    console.log("🏆 OYUN BİTTİ! Kazanan:", uid);
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
    delete table.lastDiscardedByPlayer?.[userId];

    socket.leave(tableId);

    io.to(tableId).emit("game:player_left", {
      tableId,
      userId
    });

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: table.ready
    });
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
