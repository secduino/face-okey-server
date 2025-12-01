module.exports = (io, socket) => {
  // Normal odalar ile karışmasın diye ayrı VIP room listesi
  const vipRooms = {};

  function generateRoomId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  // ----------------------------------------------------
  // VIP ODA OLUŞTUR
  // ----------------------------------------------------
  socket.on("vip:create_room", (data) => {
    console.log("VIP Oda oluşturma isteği:", data);

    const roomId = generateRoomId();

    const room = {
      id: roomId,
      name: data.name,
      bet: data.bet,
      ownerId: data.ownerId,
      players: [
        {
          id: data.ownerId,
          socketId: socket.id,
        }
      ]
    };

    vipRooms[roomId] = room;

    socket.join(roomId);

    console.log("VIP Oda oluşturuldu:", room);

    // Flutter tarafına oda bilgisi dön
    socket.emit("vip:room_created", room);
  });

  // ----------------------------------------------------
  // VIP ODA KATIL
  // ----------------------------------------------------
  socket.on("vip:join_room", (data) => {
    const { roomId, userId } = data;

    if (!vipRooms[roomId]) {
      socket.emit("vip:join_error", { message: "Oda bulunamadı" });
      return;
    }

    vipRooms[roomId].players.push({
      id: userId,
      socketId: socket.id,
    });

    socket.join(roomId);

    io.to(roomId).emit("vip:room_updated", vipRooms[roomId]);
  });

  // ----------------------------------------------------
  // VIP ODADAN AYRIL
  // ----------------------------------------------------
  socket.on("vip:leave_room", (data) => {
    const { roomId, userId } = data;

    if (!vipRooms[roomId]) return;

    vipRooms[roomId].players = vipRooms[roomId].players.filter(
      (p) => p.id !== userId
    );

    socket.leave(roomId);

    // Oda boşaldıysa sil
    if (vipRooms[roomId].players.length === 0) {
      delete vipRooms[roomId];
    } else {
      io.to(roomId).emit("vip:room_updated", vipRooms[roomId]);
    }
  });
};
