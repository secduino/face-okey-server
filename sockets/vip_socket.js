module.exports = (io, socket, rooms) => {

  // ================================
  // VIP ODA LİSTELEME
  // ================================
  socket.on("vip:list_rooms", () => {
    socket.emit("vip:rooms", rooms);
  });

  // ================================
  // VIP ODA OLUŞTURMA
  // ================================
  socket.on("vip:create_room", (data) => {
    const room = {
      id: "room_" + Date.now(),
      name: data.name,
      bet: data.bet,
      ownerId: data.ownerId,
      players: []
    };

    rooms.push(room);

    console.log("VIP ROOM CREATED:", room);

    // Odayı oluşturan kişiye geri gönder
    socket.emit("vip:room_created", room);

    // Herkese oda listesini gönder
    io.emit("vip:rooms", rooms);
  });

  // ================================
  // VIP ODAYA KATILMA  🔥 SORUN BURADAYDI
  // ================================
  socket.on("vip:join_room", (data) => {
    const roomId = data.roomId;
    const user = data.user;

    const room = rooms.find(r => r.id === roomId);

    if (!room) {
      socket.emit("vip:error", { message: "Oda bulunamadı" });
      return;
    }

    // Aynı kullanıcı 2 kere eklenmesin
    const already = room.players.find(p => p.id === user.id);
    if (!already) {
      room.players.push({
        id: user.id,
        name: user.name || "Player",
        avatar: user.avatar || "",
        isGuest: user.isGuest || false
      });
    }

    console.log("VIP ROOM JOINED:", room);

    // Katılan kullanıcıya özel cevap
    socket.emit("vip:room_joined", room);

    // Diğer herkese güncel oda listesini gönder
    io.emit("vip:rooms", rooms);
  });

};
