module.exports = (io, socket, rooms) => {
  
  // ODA LİSTELEME
  socket.on("vip:list_rooms", () => {
    console.log("vip:list_rooms -> gönderildi");
    socket.emit("vip:rooms", rooms);
  });

  // ODA OLUŞTURMA
  socket.on("vip:create_room", (data) => {
    const room = {
      id: "room_" + Date.now(),
      name: data.name,
      bet: data.bet,
      ownerId: data.ownerId,
      players: []
    };

    rooms.push(room);

    socket.emit("vip:room_created", room);
    io.emit("vip:rooms", rooms); // TÜM CİHAZLARA yayın
  });
};
