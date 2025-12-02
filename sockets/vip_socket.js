module.exports = (io, socket, vipRooms) => {

  // ============================
  // VIP ODA LİSTELEME
  // ============================
  socket.on("vip:list_rooms", () => {
    socket.emit("vip:rooms", vipRooms);
  });


  // ============================
  // VIP ODA OLUŞTURMA
  // ============================
  socket.on("vip:create_room", (data) => {
    const room = {
      id: "vip_" + Date.now(),
      name: data.name,
      ownerId: data.ownerId,
      bet: data.bet,

      players: [],
      tables: []        // 🔥 MASALAR BURADA
    };

    vipRooms.push(room);

    socket.emit("vip:room_created", room);
    io.emit("vip:rooms", vipRooms);
  });


  // ============================
  // VIP ODAYA GİRİŞ
  // ============================
  socket.on("vip:join_room", (data) => {
    const { roomId, user } = data;

    const room = vipRooms.find(r => r.id === roomId);
    if (!room) {
      socket.emit("vip:error", { message: "Oda yok" });
      return;
    }

    // Odaya dahil et
    if (!room.players.find(p => p.id === user.id)) {
      room.players.push({
        id: user.id,
        name: user.name,
        avatar: user.avatar || "",
        isGuest: user.isGuest || false
      });
    }

    socket.join(roomId);

    // 🔥 Bu oda detaylarını sadece yeni girene gönder
    socket.emit("vip:room_joined", {
      room,
      players: room.players,
      tables: room.tables
    });

    // 🔥 Oda içindeki diğer kullanıcılara sadece kullanıcı listesi
    io.to(roomId).emit("vip:room_users", room.players);
  });


  // ============================
  // VIP ODADA MASA OLUŞTURMA
  // ============================
  socket.on("vip:create_table", (data) => {
    const { roomId, ownerId } = data;

    const room = vipRooms.find(r => r.id === roomId);
    if (!room) {
      socket.emit("vip:error", { message: "Oda bulunamadı" });
      return;
    }

    const table = {
      id: "table_" + Date.now(),
      name: "Masa " + (room.tables.length + 1),
      roomId: roomId,
      ownerId: ownerId,
      players: []
    };

    room.tables.push(table);

    // 🔥 Masa oluşturan kullanıcıya masa bilgisi
    socket.emit("vip:table_created", table);

    // 🔥 Oda içindeki herkese yeni masa listesi
    io.to(roomId).emit("vip:room_tables", room.tables);
  });


  // ============================
  // VIP MASAYA GİRİŞ
  // ============================
  socket.on("vip:join_table", ({ tableId, roomId, user }) => {

    const room = vipRooms.find(r => r.id === roomId);
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

};
