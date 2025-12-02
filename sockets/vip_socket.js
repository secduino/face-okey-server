// sockets/vip_socket.js
// TAM SÜRÜM – TÜM VİP ÖZELLİKLER ENTEGRE EDİLMİŞ

module.exports = (io, socket, vipRooms) => {

  // -----------------------------------------------------
  // Yardımcı fonksiyonlar
  // -----------------------------------------------------
  function findRoom(roomId) {
    return vipRooms.find(r => r.id === roomId);
  }

  function isOwner(room, userId) {
    return room.ownerId === userId;
  }

  function isModerator(room, userId) {
    return room.moderators.includes(userId);
  }

  function isBanned(room, userId) {
    const now = Date.now();
    const record = room.bans.find(b => b.userId === userId);
    if (!record) return false;
    if (record.permanent) return true;
    return record.expiresAt > now;
  }

  // -----------------------------------------------------
  // 1) odaları listele
  // -----------------------------------------------------
  socket.on("vip:list_rooms", () => {
    socket.emit("vip:rooms", vipRooms);
  });


  // -----------------------------------------------------
  // 2) VIP oda oluştur
  // -----------------------------------------------------
  socket.on("vip:create_room", (data) => {
    const room = {
      id: "vip_" + Date.now(),
      name: data.name,
      ownerId: data.ownerId,

      // Yeni özellikler:
      moderators: [],       // yetkili kullanıcılar
      bet: data.bet || 0,   // artık bahis değil ama field dursun

      expiresAt: Date.now() + (30 * 86400000), // varsayılan 1 aylık

      players: [],
      tables: [],
      bans: [],
      chat: [],
    };

    vipRooms.push(room);

    socket.emit("vip:room_created", room);
    io.emit("vip:rooms", vipRooms);
  });


  // -----------------------------------------------------
  // 3) VIP ODAYA GİRİŞ
  // -----------------------------------------------------
  socket.on("vip:join_room", ({ roomId, user }) => {
    const room = findRoom(roomId);

    if (!room) {
      socket.emit("vip:error", { message: "Oda bulunamadı" });
      return;
    }

    // BAN KONTROLÜ
    if (isBanned(room, user.id)) {
      socket.emit("vip:error", { message: "Bu odadan yasaklandınız." });
      return;
    }

    // Kullanıcı zaten yoksa ekle
    if (!room.players.find(p => p.id === user.id)) {
      room.players.push({
        id: user.id,
        name: user.name,
        avatar: user.avatar || "",
        isGuest: user.isGuest || false
      });
    }

    socket.join(roomId);

    // Yeni girene tam veri gönder
    socket.emit("vip:room_joined", {
      room,
      players: room.players,
      tables: room.tables,
      chat: room.chat,
      moderators: room.moderators,
    });

    // Oda içindeki herkese oyuncu listesi gönder
    io.to(roomId).emit("vip:room_users", room.players);
  });


  // -----------------------------------------------------
  // 4) VIP ODADA MASA OLUŞTURMA
  // -----------------------------------------------------
  socket.on("vip:create_table", ({ roomId, ownerId }) => {
    const room = findRoom(roomId);
    if (!room) return;

    const table = {
      id: "table_" + Date.now(),
      name: "Masa " + (room.tables.length + 1),
      roomId,
      ownerId,
      players: []
    };

    room.tables.push(table);

    socket.emit("vip:table_created", table);
    io.to(roomId).emit("vip:room_tables", room.tables);
  });


  // -----------------------------------------------------
  // 5) VIP MASAYA GİRİŞ
  // -----------------------------------------------------
  socket.on("vip:join_table", ({ tableId, roomId, user }) => {
    const room = findRoom(roomId);
    if (!room) return;

    const table = room.tables.find(t => t.id === tableId);
    if (!table) return;

    if (!table.players.find(p => p.id === user.id)) {
      table.players.push(user);
    }

    socket.join(tableId);

    socket.emit("vip:table_joined", table);
    io.to(roomId).emit("vip:room_tables", room.tables);
  });


  // -----------------------------------------------------
  // 6) VIP CHAT MESAJI
  // -----------------------------------------------------
  socket.on("vip:chat_message", ({ roomId, user, message }) => {
    const room = findRoom(roomId);
    if (!room) return;

    const msg = {
      id: "msg_" + Date.now(),
      userId: user.id,
      userName: user.name,
      avatar: user.avatar || "",
      message,
      time: Date.now()
    };

    room.chat.push(msg);
    io.to(roomId).emit("vip:chat_new_message", msg);
  });


  // -----------------------------------------------------
  // 7) KICK (owner + moderator)
  // -----------------------------------------------------
  socket.on("vip:kick_player", ({ roomId, requesterId, targetUserId }) => {
    const room = findRoom(roomId);
    if (!room) return;

    if (!isOwner(room, requesterId) && !isModerator(room, requesterId)) {
      socket.emit("vip:error", { message: "Bu işlem için yetkin yok." });
      return;
    }

    room.players = room.players.filter(p => p.id !== targetUserId);

    io.to(roomId).emit("vip:room_users", room.players);
  });


  // -----------------------------------------------------
  // 8) BAN (mod: 1–7 gün, owner: sınırsız)
  // -----------------------------------------------------
  socket.on("vip:ban_player", ({ roomId, requesterId, targetUserId, days, permanent }) => {
    const room = findRoom(roomId);
    if (!room) return;

    if (!isOwner(room, requesterId) && !isModerator(room, requesterId)) {
      socket.emit("vip:error", { message: "Yetkin yok." });
      return;
    }

    if (isModerator(room, requesterId)) {
      // mod sınırlı ban verebilir
      if (permanent) {
        socket.emit("vip:error", { message: "Moderator kalıcı ban veremez." });
        return;
      }
      if (days < 1 || days > 7) {
        socket.emit("vip:error", { message: "Ban süresi 1-7 gün olmalı." });
        return;
      }
    }

    const banRecord = {
      userId: targetUserId,
      createdBy: requesterId,
      permanent: permanent || false,
      expiresAt: permanent ? null : Date.now() + days * 86400000
    };

    room.bans.push(banRecord);
    room.players = room.players.filter(p => p.id !== targetUserId);

    io.to(roomId).emit("vip:room_users", room.players);
  });


  // -----------------------------------------------------
  // 9) MODERATÖR YETKİ VER
  // -----------------------------------------------------
  socket.on("vip:grant_mod", ({ roomId, requesterId, targetUserId }) => {
    const room = findRoom(roomId);
    if (!room) return;

    if (!isOwner(room, requesterId)) {
      socket.emit("vip:error", { message: "Sadece oda sahibi mod atayabilir." });
      return;
    }

    if (!room.moderators.includes(targetUserId)) {
      room.moderators.push(targetUserId);
    }

    io.to(roomId).emit("vip:mods_updated", room.moderators);
  });


  // -----------------------------------------------------
  // 10) MODERATÖR YETKİ KALDIR
  // -----------------------------------------------------
  socket.on("vip:revoke_mod", ({ roomId, requesterId, targetUserId }) => {
    const room = findRoom(roomId);
    if (!room) return;

    if (!isOwner(room, requesterId)) {
      socket.emit("vip:error", { message: "Sadece oda sahibi mod yetkisini kaldırabilir." });
      return;
    }

    room.moderators = room.moderators.filter(id => id !== targetUserId);
    io.to(roomId).emit("vip:mods_updated", room.moderators);
  });

};
