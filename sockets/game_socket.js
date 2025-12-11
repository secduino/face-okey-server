// sockets/game_socket.js
// Engine ile entegre edilmiş versiyon + Bot Sistemi

const {
  getOrCreateTable,
  resetTableForNewRound,
  dealTiles,
  drawTileFromDeck,
  drawTileFromDiscard,
  discardTile,
  finishGame,
  startNewRound,
  getGameState
} = require("../engine/game_state");

const { sameTile, tileToString } = require("../engine/tile_util");
const { botMakeMove, createBot, isBot, canBotFinish } = require("../engine/bot_engine");

// ═══════════════════════════════════════════════════════════
// BOT SİSTEMİ GLOBAL DEĞİŞKENLER
// ═══════════════════════════════════════════════════════════
const BOT_REPLACE_DELAY = 10000; // 10 saniye - oyuncu geri dönmezse bot devreye girer
const BOT_MOVE_DELAY = 1500;     // 1.5 saniye - bot hamle arası bekleme

// Disconnect olan oyuncuları takip et
const disconnectedPlayers = new Map(); // "tableId_playerId" -> { timeout, playerData }

// Aktif bot timer'ları
const botTimers = new Map(); // "tableId" -> intervalId

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
  // BOT SİSTEMİ FONKSİYONLARI
  // ═══════════════════════════════════════════════════════════

  // Oyuncuyu bot ile değiştir
  function replacePlayerWithBot(tableId, playerId) {
    const info = findTableInRooms(tableId);
    if (!info) return false;

    const { table: roomTable } = info;
    const stateTable = getTable(tableId);
    
    // Oyuncuyu bul
    const playerIndex = roomTable.players.findIndex(p => p.id.toString() === playerId.toString());
    if (playerIndex === -1) return false;

    const player = roomTable.players[playerIndex];
    
    // Zaten bot mu kontrol et
    if (player.isBot) return false;

    // Bot oluştur
    const bot = createBot(playerId, player.name);
    roomTable.players[playerIndex] = bot;
    
    // State table'ı güncelle
    syncTablePlayers(roomTable, stateTable);

    console.log(`🤖 Bot devreye girdi: ${bot.name} (ID: ${playerId})`);

    // Tüm oyunculara bildir
    io.to(tableId).emit("game:player_became_bot", {
      tableId,
      playerId: playerId.toString(),
      botName: bot.name
    });

    // Eğer sıra bot'taysa, hamle yaptır
    if (stateTable.currentTurnPlayerId === playerId.toString()) {
      setTimeout(() => executeBotTurn(tableId, playerId.toString()), BOT_MOVE_DELAY);
    }

    return true;
  }

  // Bot'u oyuncuya geri çevir (reconnect durumunda)
  function replaceBotWithPlayer(tableId, playerId, socketId) {
    const info = findTableInRooms(tableId);
    if (!info) return false;

    const { table: roomTable } = info;
    const stateTable = getTable(tableId);
    
    const playerIndex = roomTable.players.findIndex(p => p.id.toString() === playerId.toString());
    if (playerIndex === -1) return false;

    const bot = roomTable.players[playerIndex];
    
    // Bot değilse bir şey yapma
    if (!bot.isBot) return false;

    // Oyuncuyu geri getir
    roomTable.players[playerIndex] = {
      id: playerId,
      name: bot.name.replace(" (Bot)", ""),
      isBot: false,
      socketId: socketId
    };

    syncTablePlayers(roomTable, stateTable);

    console.log(`👤 Oyuncu geri döndü: ${roomTable.players[playerIndex].name}`);

    io.to(tableId).emit("game:player_returned", {
      tableId,
      playerId: playerId.toString(),
      playerName: roomTable.players[playerIndex].name
    });

    return true;
  }

  // Bot hamle döngüsü
  function executeBotTurn(tableId, botPlayerId) {
    const stateTable = getTable(tableId);
    
    // Oyun durumu kontrolü
    if (!stateTable.gameStarted) return;
    if (stateTable.currentTurnPlayerId !== botPlayerId) return;

    // Bot mu kontrol et
    const info = findTableInRooms(tableId);
    if (!info) return;
    
    const player = info.table.players.find(p => p.id.toString() === botPlayerId);
    if (!player || !player.isBot) return;

    const hand = stateTable.hands[botPlayerId];
    if (!hand) return;

    console.log(`🤖 Bot sırası: ${player.name}, El: ${hand.length} taş`);

    // Bot hamle yap
    const result = botMakeMove(stateTable, botPlayerId);

    if (result.action === "draw") {
      // Taş çekti - herkese bildir
      io.to(tableId).emit("game:tile_drawn", {
        tableId,
        playerId: botPlayerId,
        source: "deck",
        deckCount: result.deckCount
      });

      // Taş atması gerekiyor - biraz bekle ve at
      setTimeout(() => executeBotDiscard(tableId, botPlayerId), BOT_MOVE_DELAY);
    }
    else if (result.action === "finish") {
      // Bot bitirdi!
      executeBotFinish(tableId, botPlayerId, result);
    }
    else if (result.action === "discard") {
      // Taş attı
      broadcastDiscard(tableId, botPlayerId, result.tile, stateTable);
    }
  }

  // Bot taş atma
  function executeBotDiscard(tableId, botPlayerId) {
    const stateTable = getTable(tableId);
    const hand = stateTable.hands[botPlayerId];
    
    if (!hand || hand.length !== 15) return;

    // Önce bitiş kontrolü
    const finishCheck = canBotFinish(hand, stateTable.okeyTile);
    if (finishCheck.canFinish) {
      executeBotFinish(tableId, botPlayerId, finishCheck);
      return;
    }

    // Bitiremiyorsa taş at
    const result = botMakeMove(stateTable, botPlayerId);
    
    if (result.action === "discard") {
      broadcastDiscard(tableId, botPlayerId, result.tile, stateTable);
    }
  }

  // Taş atma broadcast
  function broadcastDiscard(tableId, playerId, tile, stateTable) {
    // Sırayı değiştir
    const playerIds = stateTable.players.map(p => p.id.toString());
    const currentIndex = playerIds.indexOf(playerId);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    stateTable.currentTurnPlayerId = playerIds[nextIndex];
    stateTable.hasDrawnThisTurn = false;

    io.to(tableId).emit("game:tile_discarded", {
      tableId,
      playerId,
      tile,
      nextPlayerId: stateTable.currentTurnPlayerId
    });

    // Sonraki oyuncu bot mu?
    const nextPlayer = stateTable.players.find(p => p.id.toString() === stateTable.currentTurnPlayerId);
    if (nextPlayer && nextPlayer.isBot) {
      setTimeout(() => executeBotTurn(tableId, stateTable.currentTurnPlayerId), BOT_MOVE_DELAY);
    }
  }

  // Bot oyunu bitirme
  function executeBotFinish(tableId, botPlayerId, finishResult) {
    const stateTable = getTable(tableId);
    
    console.log(`🤖🏆 Bot oyunu bitiriyor: ${botPlayerId}`);

    // finishGame engine fonksiyonunu kullan
    const result = finishGame(stateTable, botPlayerId);

    if (result.success) {
      const botPlayer = stateTable.players.find(p => p.id.toString() === botPlayerId);
      
      io.to(tableId).emit("game:round_finished", {
        tableId,
        winnerId: botPlayerId,
        winnerName: botPlayer ? botPlayer.name : "Bot",
        roundResult: result.roundResult,
        tableScores: result.tableScores,
        gameOver: result.gameOver,
        loser: result.loser,
        loserName: result.loserName,
        groups: result.groups,
        usedOkey: result.usedOkey,
        reason: result.roundResult?.discardedIsOkey 
          ? "Bot Okey atarak bitirdi! (x4 puan)" 
          : "Bot eli bitirdi!"
      });
    }
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
    const uid = userId.toString();

    // Owner belirleme
    if (!roomTable.ownerId) {
      roomTable.ownerId = userId;
    }

    roomTable.players = roomTable.players || [];
    roomTable.ready = roomTable.ready || {};

    // Disconnect timeout varsa iptal et
    const disconnectKey = `${tableId}_${uid}`;
    if (disconnectedPlayers.has(disconnectKey)) {
      const data = disconnectedPlayers.get(disconnectKey);
      clearTimeout(data.timeout);
      disconnectedPlayers.delete(disconnectKey);
      console.log(`✅ Disconnect timeout iptal edildi: ${uid}`);
    }

    // Oyuncu ekle veya güncelle
    let user = roomTable.players.find(p => p.id.toString() === uid);

    if (!user) {
      user = {
        id: userId,
        name: "Oyuncu" + (roomTable.players.length + 1),
        avatar: "",
        socketId: socket.id,
        isBot: false
      };
      roomTable.players.push(user);
    } else {
      // Eğer bot ise, oyuncuya geri çevir
      if (user.isBot) {
        replaceBotWithPlayer(tableId, uid, socket.id);
        user = roomTable.players.find(p => p.id.toString() === uid);
      } else {
        user.socketId = socket.id;
      }
    }

    roomTable.ready[uid] = false;

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
    const startingPoints = payload?.startingPoints || 20;

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

    // Başlangıç puanını ayarla
    const validPoints = [5, 7, 20];
    stateTable.settings.startingPoints = validPoints.includes(startingPoints) ? startingPoints : 20;
    console.log("📊 Başlangıç puanı:", stateTable.settings.startingPoints);

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
      tableScores: stateTable.tableScores,
      totalScores: stateTable.totalScores,
      gameStarted: true,
      players: roomTable.players.map(p => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot || false
      }))
    });

    console.log("✅ game:state_changed event gönderildi");

    // İlk oyuncu bot mu? Bot ise hamle yaptır
    const firstPlayer = roomTable.players.find(p => p.id.toString() === stateTable.currentTurnPlayerId);
    if (firstPlayer && firstPlayer.isBot) {
      console.log(`🤖 İlk sıra bot'ta: ${firstPlayer.name}`);
      setTimeout(() => executeBotTurn(tableId, stateTable.currentTurnPlayerId), BOT_MOVE_DELAY);
    }
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

    // Sonraki oyuncu bot mu? Bot ise hamle yaptır
    const info = findTableInRooms(tableId);
    if (info) {
      const nextPlayer = info.table.players.find(p => p.id.toString() === result.nextPlayerId);
      if (nextPlayer && nextPlayer.isBot) {
        console.log(`🤖 Sıra bot'a geçti: ${nextPlayer.name}`);
        setTimeout(() => executeBotTurn(tableId, result.nextPlayerId), BOT_MOVE_DELAY);
      }
    }

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

    console.log("🏆 EL BİTTİ! Kazanan:", result.winnerName);
    console.log("📊 Puan değişimleri:", result.roundResult.scoreChanges);
    console.log("📊 Güncel puanlar:", result.tableScores);

    io.to(tableId).emit("game:round_finished", {
      tableId,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      
      // El sonucu
      roundResult: result.roundResult,
      
      // Güncel puanlar
      tableScores: result.tableScores,
      
      // Oyun tamamen bitti mi?
      gameOver: result.gameOver,
      loser: result.loser,
      loserName: result.loserName,
      
      // Bitiş detayları
      groups: result.groups,
      usedOkey: result.usedOkey,
      discardedIsOkey: result.roundResult.discardedIsOkey,
      
      reason: result.roundResult.discardedIsOkey 
        ? "Okey atarak bitirdi! (x4 puan)" 
        : "Eli bitirdi!"
    });
  });

  // ═══════════════════════════════════════════════════════════
  // YENİ EL BAŞLAT
  // ═══════════════════════════════════════════════════════════

  socket.on("game:new_round", ({ tableId, userId }) => {
    const stateTable = getOrCreateTable(tableId);
    const uid = userId.toString();

    console.log("🔄 Yeni el isteği:", uid, "masa:", tableId);
    console.log("📊 Masa sahibi:", stateTable.ownerId);

    // Sadece masa sahibi yeni el başlatabilir
    if (stateTable.ownerId !== uid) {
      socket.emit("game:error", { message: "Sadece masa sahibi yeni el başlatabilir" });
      return;
    }

    const result = startNewRound(stateTable);

    if (!result.success) {
      socket.emit("game:error", { message: result.reason });
      return;
    }

    console.log("🎮 YENİ EL BAŞLADI! Round:", stateTable.roundNumber);
    console.log("📊 Gösterge:", result.indicator);
    console.log("📊 Okey:", result.okeyTile);
    console.log("📊 Başlangıç oyuncusu:", result.startingPlayerId);
    console.log("📊 Deste:", result.deckSize, "taş");

    // Tüm oyunculara gönder (ilk başlangıçla aynı format)
    io.to(tableId).emit("game:state_changed", {
      tableId,
      hands: stateTable.hands,
      currentTurnPlayerId: result.startingPlayerId,
      indicator: result.indicator,
      okey: result.okeyTile,
      deckCount: result.deckSize,
      tableScores: stateTable.tableScores,
      totalScores: stateTable.totalScores,
      roundNumber: stateTable.roundNumber,
      gameStarted: true
    });

    console.log("✅ Yeni el game:state_changed gönderildi");
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
  // BAĞLANTI KOPMA - BOT SİSTEMİ
  // ═══════════════════════════════════════════════════════════

  socket.on("disconnect", () => {
    console.log("❌ Game socket disconnected:", socket.id);

    // Bu socket'e ait oyuncuyu bul
    for (const room of vipRooms) {
      if (!room.tables) continue;
      
      for (const table of room.tables) {
        if (!table.players) continue;
        
        const player = table.players.find(p => p.socketId === socket.id);
        if (!player) continue;
        
        const tableId = table.id;
        const playerId = player.id.toString();
        const stateTable = getTable(tableId);

        // Zaten bot ise bir şey yapma
        if (player.isBot) continue;

        // Oyun başlamışsa bot timer'ı başlat
        if (stateTable.gameStarted) {
          console.log(`⏱️ ${player.name} bağlantısı koptu. 10 saniye içinde geri dönmezse bot devreye girecek...`);

          // Diğer oyunculara bildir
          io.to(tableId).emit("game:player_disconnected", {
            tableId,
            playerId,
            playerName: player.name,
            waitingSeconds: BOT_REPLACE_DELAY / 1000
          });

          // 10 saniye sonra bot ile değiştir
          const disconnectKey = `${tableId}_${playerId}`;
          const timeout = setTimeout(() => {
            console.log(`🤖 ${player.name} geri dönmedi, bot devreye giriyor...`);
            replacePlayerWithBot(tableId, playerId);
            disconnectedPlayers.delete(disconnectKey);
          }, BOT_REPLACE_DELAY);

          disconnectedPlayers.set(disconnectKey, {
            timeout,
            playerData: player,
            disconnectedAt: Date.now()
          });
        }
      }
    }

    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.leave(roomId);
      }
    });
  });
};
