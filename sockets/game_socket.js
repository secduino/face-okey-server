// sockets/game_socket.js
// Engine ile entegre edilmiş versiyon

const {
  getOrCreateTable,
  resetTable,
  dealTiles,
  drawTileFromDeck,
  drawTileFromDiscard,
  discardTile,
  finishGame,
  getGameState
} = require("../engine/game_state");

const { sameTile } = require("../engine/tile_util");

module.exports = (io, socket, vipRooms) => {

  // ═══════════════════════════════════════════════════════════
  // YARDIMCI FONKSİYONLAR
  // ═══════════════════════════════════════════════════════════

  function findTableInRooms(tableId) {
    for (const room of vipRooms) {
      if (!room.tables) continue;
      const table = room.tables.find(t => t.id === tableId);
      if (table) return { room, table };
    }
    return null;
  }

  function getTable(tableId) {
    return getOrCreateTable(tableId);
  }

  function syncTablePlayers(roomTable, stateTable) {
    stateTable.players = roomTable.players || [];
    stateTable.ready = roomTable.ready || {};
    stateTable.ownerId = roomTable.ownerId;
  }

  // ═══════════════════════════════════════════════════════════
  // MASAYA KATILMA
  // ═══════════════════════════════════════════════════════════

  socket.on("game:join_table", ({ tableId, userId }) => {
    console.log("🎮 game:join_table -", { tableId, userId, socketId: socket.id });

    const info = findTableInRooms(tableId);
    if (!info) {
      console.log("❌ Masa bulunamadı:", tableId);
      socket.emit("game:error", { message: "Masa bulunamadı" });
      return;
    }

    const { table: roomTable } = info;
    const stateTable = getTable(tableId);

    // Owner belirleme
    if (!roomTable.ownerId) {
      roomTable.ownerId = userId;
    }

    roomTable.players = roomTable.players || [];
    roomTable.ready = roomTable.ready || {};

    // Oyuncu ekle veya güncelle
    let user = roomTable.players.find(p => p.id.toString() === String(userId));

    if (!user) {
      user = {
        id: userId,
        name: "Oyuncu" + (roomTable.players.length + 1),
        avatar: "",
        socketId: socket.id
      };
      roomTable.players.push(user);
    } else {
      user.socketId = socket.id;
    }

    roomTable.ready[user.id.toString()] = false;

    // State table'ı senkronize et
    syncTablePlayers(roomTable, stateTable);

    socket.join(tableId);

    io.to(tableId).emit("game:player_joined", {
      tableId,
      user
    });

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: roomTable.ready
    });

    console.log("✅ Oyuncu masaya eklendi:", user.id, "Socket:", socket.id);
  });

  // ═══════════════════════════════════════════════════════════
  // HAZIR DURUMU
  // ═══════════════════════════════════════════════════════════

  socket.on("game:set_ready", ({ tableId, userId, ready }) => {
    const info = findTableInRooms(tableId);
    if (!info) return;

    const { table: roomTable } = info;
    const stateTable = getTable(tableId);
    const uid = userId.toString();

    roomTable.ready = roomTable.ready || {};
    roomTable.ready[uid] = ready === true;

    syncTablePlayers(roomTable, stateTable);

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: roomTable.ready
    });

    console.log("✅ Hazır durumu değişti:", uid, "->", ready);
  });

  // ═══════════════════════════════════════════════════════════
  // OYUN BAŞLATMA
  // ═══════════════════════════════════════════════════════════

  socket.on("game:start", (payload) => {
    const tableId = payload?.tableId;

    if (!tableId) {
      socket.emit("game:error", { message: "tableId gerekli" });
      return;
    }

    const info = findTableInRooms(tableId);
    if (!info) {
      socket.emit("game:error", { message: "Masa bulunamadı" });
      return;
    }

    const { table: roomTable } = info;
    const stateTable = getTable(tableId);

    // 4 oyuncu kontrolü
    if (roomTable.players.length !== 4) {
      socket.emit("game:error", { message: "4 oyuncu gerekli" });
      return;
    }

    // Tüm oyuncular hazır mı?
    const allReady = roomTable.players.every(p => {
      return roomTable.ready[p.id.toString()] === true;
    });

    if (!allReady) {
      socket.emit("game:error", { message: "Tüm oyuncular hazır değil" });
      return;
    }

    // State table'ı senkronize et
    syncTablePlayers(roomTable, stateTable);

    // ENGINE İLE TAŞ DAĞIT
    const result = dealTiles(stateTable);

    if (!result.success) {
      socket.emit("game:error", { message: result.reason });
      return;
    }

    console.log("🎮 OYUN BAŞLIYOR!");
    console.log("   Gösterge:", result.indicator);
    console.log("   Okey:", result.okeyTile);
    console.log("   Başlangıç oyuncusu:", result.startingPlayerId);
    console.log("   Deste:", result.deckSize, "taş");

    // TÜM OYUNCULARA OYUN DURUMUNU GÖNDER
    // Her oyuncu kendi elini alacak
    io.to(tableId).emit("game:state_changed", {
      tableId,
      hands: stateTable.hands,
      currentTurnPlayerId: stateTable.currentTurnPlayerId,
      indicator: stateTable.indicator,
      okey: stateTable.okeyTile,
      deckCount: stateTable.deck.length,
      gameStarted: true
    });

    console.log("✅ game:state_changed event gönderildi");
  });

  // ═══════════════════════════════════════════════════════════
  // ORTADAN TAŞ ÇEKME
  // ═══════════════════════════════════════════════════════════

  socket.on("game:draw_tile", ({ tableId, userId }) => {
    const stateTable = getTable(tableId);
    const uid = userId.toString();

    const result = drawTileFromDeck(stateTable, uid);

    if (!result.success) {
      socket.emit("game:error", { message: result.reason });

      // Deste boşsa oyun biter
      if (result.reason === "Deste boş") {
        io.to(tableId).emit("game:finished", {
          tableId,
          winnerId: null,
          reason: "Deste bitti - Berabere"
        });
      }
      return;
    }

    console.log("✅ Taş çekildi (ortadan):", result.tile);

    // Sadece çeken oyuncuya taşı gönder
    socket.emit("game:tile_drawn", {
      tableId,
      userId: uid,
      tile: result.tile,
      deckCount: result.deckRemaining,
      source: "deck"
    });

    // Diğerlerine deste güncellemesi
    socket.to(tableId).emit("game:deck_updated", {
      tableId,
      deckCount: result.deckRemaining,
      drawerId: uid
    });
  });

  // ═══════════════════════════════════════════════════════════
  // SOLDAN TAŞ ALMA
  // ═══════════════════════════════════════════════════════════

  socket.on("game:draw_from_discard", ({ tableId, userId }) => {
    const stateTable = getTable(tableId);
    const uid = userId.toString();

    const result = drawTileFromDiscard(stateTable, uid);

    if (!result.success) {
      socket.emit("game:error", { message: result.reason });
      return;
    }

    console.log("✅ Taş çekildi (soldan):", result.tile);

    // Çeken oyuncuya taşı gönder
    socket.emit("game:tile_drawn", {
      tableId,
      userId: uid,
      tile: result.tile,
      deckCount: stateTable.deck.length,
      source: "discard"
    });

    // Diğerlerine bildir
    socket.to(tableId).emit("game:tile_taken_from_discard", {
      tableId,
      takerId: uid
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TAŞ ATMA
  // ═══════════════════════════════════════════════════════════

  socket.on("game:discard_tile", ({ tableId, userId, tile }) => {
    const stateTable = getTable(tableId);
    const uid = userId.toString();

    // Tile objesini oluştur
    const tileObj = {
      color: tile.color,
      number: tile.number,
      fakeJoker: tile.fakeJoker || false
    };

    const result = discardTile(stateTable, uid, tileObj);

    if (!result.success) {
      socket.emit("game:error", { message: result.reason });
      return;
    }

    console.log("✅ Taş atıldı:", result.discardedTile, "-> Sıra:", result.nextPlayerId);

    // Herkese bildir
    io.to(tableId).emit("game:tile_discarded", {
      tableId,
      tile: result.discardedTile,
      userId: uid,
      nextTurn: result.nextPlayerId
    });

    // El bittiyse kontrol et
    const hand = stateTable.hands[uid];
    if (hand && hand.length === 0) {
      io.to(tableId).emit("game:finished", {
        tableId,
        winnerId: uid,
        reason: "Tüm taşlarını bitirdi!"
      });
      console.log("🏆 OYUN BİTTİ! Kazanan:", uid);
    }
  });

  // ═══════════════════════════════════════════════════════════
  // OYUNU BİTİRME (OKEY İLE)
  // ═══════════════════════════════════════════════════════════

  socket.on("game:finish", ({ tableId, userId }) => {
    const stateTable = getTable(tableId);
    const uid = userId.toString();

    const result = finishGame(stateTable, uid);

    if (!result.success) {
      socket.emit("game:error", { message: result.reason || "Oyunu bitiremezsin" });
      return;
    }

    console.log("🏆 OYUN BİTTİ! Kazanan:", uid, "Skor:", result.score);

    io.to(tableId).emit("game:finished", {
      tableId,
      winnerId: uid,
      score: result.score,
      totalScore: result.totalScore,
      groups: result.groups,
      usedOkey: result.usedOkey,
      reason: result.usedOkey ? "Okey ile bitirdi!" : "Oyunu bitirdi!"
    });
  });

  // ═══════════════════════════════════════════════════════════
  // MASADAN AYRILMA
  // ═══════════════════════════════════════════════════════════

  socket.on("game:leave_table", ({ tableId, userId }) => {
    const info = findTableInRooms(tableId);
    if (!info) return;

    const { table: roomTable } = info;
    const stateTable = getTable(tableId);
    const uid = userId.toString();

    // Room table'dan çıkar
    roomTable.players = (roomTable.players || []).filter(
      p => p.id.toString() !== uid
    );
    delete roomTable.ready?.[uid];

    // State table'dan çıkar
    stateTable.players = stateTable.players.filter(
      p => p.id.toString() !== uid
    );
    delete stateTable.ready?.[uid];
    delete stateTable.hands?.[uid];
    delete stateTable.discardPiles?.[uid];

    socket.leave(tableId);

    io.to(tableId).emit("game:player_left", {
      tableId,
      userId: uid
    });

    io.to(tableId).emit("game:ready_changed", {
      tableId,
      ready: roomTable.ready || {}
    });

    // Masa boşsa reset
    if (roomTable.players.length === 0) {
      resetTable(stateTable);
    }

    console.log("👋 Oyuncu ayrıldı:", uid);
  });

  // ═══════════════════════════════════════════════════════════
  // OYUN DURUMU İSTEME
  // ═══════════════════════════════════════════════════════════

  socket.on("game:get_state", ({ tableId, userId }) => {
    const stateTable = getTable(tableId);
    const uid = userId.toString();

    const state = getGameState(stateTable, uid);

    socket.emit("game:state_sync", {
      tableId,
      ...state
    });
  });

  // ═══════════════════════════════════════════════════════════
  // BAĞLANTI KOPMA
  // ═══════════════════════════════════════════════════════════

  socket.on("disconnect", () => {
    console.log("❌ Game socket disconnected:", socket.id);

    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.leave(roomId);
      }
    });
  });
};
