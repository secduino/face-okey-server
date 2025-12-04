// sockets/vip_socket.js

module.exports = (io, socket, vipRooms) => {

  // ---------------------------------------------------------
  // UTIL FONKSİYONLARI
  // ---------------------------------------------------------
  function getRoom(roomId) {
    const room = vipRooms.find(r => r.id === roomId);
    console.log("🔍 getRoom:", roomId, room ? "✅ BULUNDU" : "❌ BULUNAMADI");
    return room;
  }

  function isBanned(room, userId) {
    const now = Date.now();
    const ban = room.bans?.find(b => b.userId === userId);
    if (!ban) return false;

    // Süresi bitmiş ise ban'ı kaldır
    if (ban.until && ban.until < now) {
      room.bans = room.bans.filter(b => b.userId !== userId);
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------
  // VIP ODA LİSTELEME
  // ---------------------------------------------------------
  socket.on("vip:list_rooms", () => {
    console.log("📋 vip:list_rooms - Odalar gönderiliyor");
    console.log("   Toplam oda sayısı:", vipRooms.length);
    socket.emit("vip:rooms", vipRooms);
  });

  // ---------------------------------------------------------
  // VIP ODA OLUŞTURMA
  // ---------------------------------------------------------
  socket.on("vip:create_room", (data) => {
    console.log("🎮 vip:create_room event geldi:", data);

    const now = Date.now();

    const room = {
      id: "vip_" + now,
      name: data.name,
      ownerId: data.ownerId,
      moderators: [],
      bans: [],
      chat: [],
      expiresAt: now + (data.duration || 0),
      players: [],
      tables: []
    };

    vipRooms.push(room);

    console.log("✅ VIP Oda oluşturuldu:", room.id, "Sahibi:", data.ownerId);

    socket.emit("vip:room_created", room);
    
    // TÜM CLIENTLARA ODA LİSTESİNİ GÖNDER
    io.emit("vip:rooms", vipRooms);
  });

  // ---------------------------------------------------------
  // VIP ODAYA GİRİŞ
  // ---------------------------------------------------------
  socket.on("vip:join_room", ({ roomId, user }) => {
    console.log("🎮 vip:join_room event geldi:", { roomId, userId: user.id });

    const room = getRoom(roomId);
    if (!room) {
      console.log("❌ Oda bulunamadı:", roomId);
      socket.emit("vip:error", { message: "Oda bulunamadı" });
      return;
    }

    // Ban kontrol
    if (isBanned(room, user.id)) {
      console.log("❌ Kullanıcı yasaklı:", user.id);
      socket.emit("vip:error", { message: "Bu odadan yasaklandın." });
      return;
    }

    // Daha önce yoksa ekle
    if (!room.players.find(p => p.id === user.id)) {
      room.players.push({
        id: user.id,
        name: user.name,
        avatar: user.avatar || "",
        isGuest: user.isGuest || false,
        score: 1000
      });
      console.log("✅ Oyuncu odaya eklendi:", user.id, "Toplam:", room.players.length);
    }

    socket.join(roomId);

    // Bu kullanıcıya özel oda bilgisi
    socket.emit("vip:room_joined", {
      room,
      players: room.players,
      tables: room.tables
    });

    // Tüm odaya oyuncu listesi
    io.to(roomId).emit("vip:room_users", room.players);
    
    // Tüm odaya masa listesi
    io.to(roomId).emit("vip:room_tables", room.tables);
  });

  // ---------------------------------------------------------
  // YETKİ KONTROL FONKSİYONU
  // ---------------------------------------------------------
  function hasPermission(room, userId) {
    return (
      room.ownerId === userId ||
      room.moderators.includes(userId)
    );
  }

  // ---------------------------------------------------------
  // MOD EKLEME / ÇIKARMA
  // ---------------------------------------------------------
  socket.on("vip:mod_toggle", ({ roomId, targetId, requesterId }) => {
    console.log("🎮 vip:mod_toggle event geldi:", { roomId, targetId, requesterId });

    const room = getRoom(roomId);
    if (!room) return;

    if (room.ownerId !== requesterId) {
      console.log("❌ Sadece owner mod verebilir");
      return;
    }

    if (room.moderators.includes(targetId)) {
      room.moderators = room.moderators.filter(id => id !== targetId);
      console.log("✅ Mod yetkisi kaldırıldı:", targetId);
    } else {
      room.moderators.push(targetId);
      console.log("✅ Mod yetkisi verildi:", targetId);
    }

    io.to(roomId).emit("vip:room_users", room.players);
  });

  // ---------------------------------------------------------
  // OYUNCU ATMA (OWNER / MOD)
  // ---------------------------------------------------------
  socket.on("vip:kick_player", ({ roomId, targetId, requesterId }) => {
    console.log("🎮 vip:kick_player event geldi:", { roomId, targetId, requesterId });

    const room = getRoom(roomId);
    if (!room) return;

    if (!hasPermission(room, requesterId)) {
      console.log("❌ Yetkisi yok");
      return;
    }

    room.players = room.players.filter(p => p.id !== targetId);

    console.log("✅ Oyuncu atıldı:", targetId);

    io.to(roomId).emit("vip:room_users", room.players);
    io.to(roomId).emit("vip:kicked", { userId: targetId });
  });

  // ---------------------------------------------------------
  // YASAKLAMA (BAN)
  // ---------------------------------------------------------
  socket.on("vip:ban_player", ({ roomId, targetId, requesterId, days }) => {
    console.log("🎮 vip:ban_player event geldi:", { roomId, targetId, requesterId, days });

    const room = getRoom(roomId);
    if (!room) return;

    if (!hasPermission(room, requesterId)) {
      console.log("❌ Yetkisi yok");
      return;
    }

    const until = Date.now() + days * 24 * 60 * 60 * 1000;

    room.bans.push({
      userId: targetId,
      until
    });

    room.players = room.players.filter(p => p.id !== targetId);

    console.log("✅ Oyuncu yasaklandı:", targetId, "Gün:", days);

    io.to(roomId).emit("vip:room_users", room.players);
    io.to(roomId).emit("vip:banned", { userId: targetId, until });
  });

  // ---------------------------------------------------------
  // VIP ODADA MASA OLUŞTURMA
  // ---------------------------------------------------------
  socket.on("vip:create_table", ({ roomId, ownerId }) => {
    console.log("🎮 vip:create_table event geldi:", { roomId, ownerId });

    const room = getRoom(roomId);
    if (!room) {
      console.log("❌ Oda bulunamadı:", roomId);
      return;
    }

    const table = {
      id: "table_" + Date.now(),
      name: "Masa " + (room.tables.length + 1),
      roomId,
      ownerId,
      players: [],
      hands: {},
      deck: [],
      currentTurnPlayerId: null,
      ready: {}
    };

    room.tables.push(table);

    console.log("✅ Masa oluşturuldu:", table.id, "Owner:", ownerId);
    
    // ✅ TÜM ODAYA MASA LİSTESİNİ GÖNDER (OLUŞTURAN DAHİL!)
    io.to(roomId).emit("vip:room_tables", room.tables);
    
    console.log("📤 vip:room_tables broadcast edildi, toplam masa:", room.tables.length);
  });

  // ---------------------------------------------------------
  // VIP MASAYA GİRİŞ
  // ---------------------------------------------------------
  socket.on("vip:join_table", ({ tableId, roomId, user }) => {
    console.log("🎮 vip:join_table event geldi:", { tableId, roomId, userId: user.id });

    const room = getRoom(roomId);
    if (!room) {
      console.log("❌ Oda bulunamadı:", roomId);
      return;
    }

    const table = room.tables.find(t => t.id === tableId);
    if (!table) {
      console.log("❌ Masa bulunamadı:", tableId);
      return;
    }

    if (!table.players.find(p => p.id === user.id)) {
      table.players.push(user);
      console.log("✅ Oyuncu masaya eklendi:", user.id, "Toplam:", table.players.length);
    }

    socket.join(tableId);

    // ✅ MASAYI OWNERİD İLE BİRLİKTE GÖNDER
    socket.emit("vip:table_joined", {
      ...table,
      ownerId: table.ownerId // Explicitly include ownerId
    });
    
    console.log("📤 vip:table_joined gönderildi, ownerId:", table.ownerId);
    
    // TÜM ODAYA MASA LİSTESİNİ GÖNDER
    io.to(roomId).emit("vip:room_tables", room.tables);
  });

  // ---------------------------------------------------------
  // ODA İÇİ CHAT
  // ---------------------------------------------------------
  socket.on("vip:chat_message", ({ roomId, userId, userName, msg }) => {
    console.log("💬 vip:chat_message:", { roomId, userId, msg: msg.substring(0, 30) });

    const room = getRoom(roomId);
    if (!room) return;

    const chatMsg = {
      id: Date.now(),
      userId,
      userName,
      msg,
      time: Date.now()
    };

    room.chat.push(chatMsg);

    io.to(roomId).emit("vip:chat_new_message", chatMsg);
  });

  // ---------------------------------------------------------
  // SOKET BAĞLANTISI KOPTU
  // ---------------------------------------------------------
  socket.on("disconnect", () => {
    console.log("❌ VIP socket disconnected:", socket.id);
    
    // ✅ OYUNCUNUN TÜM ROOM'LARDAN VE MASALARDAN AYRILMASINI SAĞLA
    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.leave(roomId);
        console.log("🚪 Socket left room:", roomId);
      }
    });
  });
};
