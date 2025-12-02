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
      tables: []
    };

    vipRooms.push(room);

    socket.emit("vip:room_created", room);
    io.emit("vip:rooms", vipRooms);
  });


  // ============================
  // VIP ODAYA GİRİŞ
  // ============================
  socket.on("vip:join_room", ({ roomId, user }) => {
    const room = vipRooms.find(r => r.id === roomId);

    if (!room) {
      socket.emit("vip:error", { message: "Oda bulunamadı" });
      return;
    }

    // Kullanıcı ekle
    if (!room.players.find(p => p.id === user.id)) {
      room.players.push({
        id: user.id,
        name: user.name,
        avatar: user.avatar || "",
        isGuest: user.isGuest || false
      });
    }

    socket.join(roomId);

    // Yeni girene oda bilgisi
    socket.emit("vip:room_joined", {
      room,
      players: room.players,
      tables: room.tables
    });

    // Oda içindeki herkese kullanıcı listesi
    io.to(roomId).emit("vip:room_users", room.players);
  });


  // ============================
  // VIP ODADA MASA OLUŞTURMA
  // ============================
  socket.on("vip:create_table", ({ roomId, ownerId }) => {
    const room = vipRooms.find(r => r.id === roomId);
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


  // ============================
  // VIP MASAYA GİRİŞ
  // ============================
  socket.on("vip:join_table", ({ tableId, roomId, user }) => {

    const room = vipRooms.find(r => r.id === roomId);
    if (!room) return;

    const table = room.tables.find(t => t.id === tableId);
    if (!table) return;

    // Kullanıcı masaya ekle
    if (!table.players.find(p => p.id === user.id)) {
      table.players.push(user);
    }

    socket.join(tableId);

    socket.emit("vip:table_joined", table);
    io.to(roomId).emit("vip:room_tables", room.tables);
  });

};
