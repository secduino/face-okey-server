module.exports = (io, socket, rooms) => {

  // VIP ODA LİSTELEME
  socket.on("vip:list_rooms", () => {
    console.log("vip:list_rooms -> gönderildi");
    socket.emit("vip:rooms", rooms);
  });

  // VIP ODA OLUŞTURMA
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

    // Odayı oluşturan kişiye bilgi
    socket.emit("vip:room_created", room);

    // Herkese oda listesini yayınla
    io.emit("vip:rooms", rooms);
  });

};
