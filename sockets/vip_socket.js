// sockets/vip_socket.js

module.exports = (io, socket, vipRooms) => {

  // ---------------------------------------------------------
  // UTIL FONKSİYONLARI
  // ---------------------------------------------------------
  function getRoom(roomId) {
    return vipRooms.find(r => r.id === roomId);
  }

  function isBanned(room, userId) {
    const now = Date.now();
    const ban = room.bans?.find(b => b.userId === userId);
    if (!ban) return false;

    // Süresi bitmişse ban'ı kaldır
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
    socket.emit("vip:rooms", vipRooms);
  });

  // ---------------------------------------------------------
  // VIP ODA OLUŞTURMA
  // ---------------------------------------------------------
  socket.on("vip:create_room", (data) => {
    const now = Date.now();

    const room = {
      id: "vip_" + now,
      name: data.name,
      ownerId: data.ownerId,

      moderators: [],       // yetki verilen kişiler
      bans: [],             // { userId, until }
      chat: [],             // { id, userId, userName, msg, time }

      expiresAt: now + (data.duration || 0), // PREMIUM SÜRE

      players: [],
      tables: []
    };

    vipRooms.push(room);

    socket.emit("vip:room_created", room);
    io.emit("vip:rooms", vipRooms);
  });

  // ---------------------------------------------------------
  // VIP ODAYA GİRİŞ
  // ---------------------------------------------------------
  socket.on("vip:join_room", ({ roomId, user }) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit("vip:error", { message: "Oda bulunamadı" });
      return;
    }

    // Ban kontrol
    if (isBanned(room, user.id)) {
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
        score: 1000,             // BAŞLANGIÇ PUANI
      });
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
    const room = getRoom(roomId);
    if (!room) return;

    if (room.ownerId !== requesterId) return; // sadece owner mod verebilir

    if (room.moderators.includes(targetId)) {
      room.moderators = room.moderators.filter(id => id !== targetId);
    } else {
      room.moderators.push(targetId);
    }

    io.to(roomId).emit("vip:room_users", room.players);
  });

  // ---------------------------------------------------------
  // OYUNCU ATMA (OWNER / MOD)
  // ---------------------------------------------------------
  socket.on("vip:kick_player", ({ roomId, targetId, requesterId }) => {
    const room = getRoom(roomId);
    if (!room) return;

    if (!hasPermission(room, requesterId)) return;

    room.players = room.players.filter(p => p.id !== targetId);

    io.to(roomId).emit("vip:room_users", room.players);

    // Hedef oyuncu socket odadan çıkarılır
    io.to(roomId).emit("vip:kicked", { userId: targetId });
  });

  // ---------------------------------------------------------
  // YASAKLAMA (BAN)
  // ---------------------------------------------------------
  socket.on("vip:ban_player", ({ roomId, targetId, requesterId, days }) => {
    const room = getRoom(roomId);
    if (!room) return;

    if (!hasPermission(room, requesterId)) return;

    const until = Date.now() + days * 24 * 60 * 60 * 1000;

    room.bans.push({
      userId: targetId,
      until
    });

    room.players = room.players.filter(p => p.id !== targetId);

    io.to(roomId).emit("vip:room_users", room.players);
    io.to(roomId).emit("vip:banned", { userId: targetId, until });
  });

  // ---------------------------------------------------------
  // VIP ODADA MASA OLUŞTURMA
  // ---------------------------------------------------------
  socket.on("vip:create_table", ({ roomId, ownerId }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const table = {
      id: "table_" + Date.now(),
      name: "Masa " + (room.tables.length + 1),
      roomId,
      ownerId,
      players: [],
      hands: {},
      deck: [],
      currentTurnPlayerId: null
    };

    room.tables.push(table);

    socket.emit("vip:table_created", table);
    io.to(roomId).emit("vip:room_tables", room.tables);
  });

  // ---------------------------------------------------------
  // VIP MASAYA GİRİŞ
  // ---------------------------------------------------------
  socket.on("vip:join_table", ({ tableId, roomId, user }) => {
    const room = getRoom(roomId);
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

  // ---------------------------------------------------------
  // ODA İÇİ CHAT
  // ---------------------------------------------------------
  socket.on("vip:chat_message", ({ roomId, userId, userName, msg }) => {
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

};
