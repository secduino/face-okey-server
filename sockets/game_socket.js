// ------------------------
// GLOBAL ODA LİSTESİ
// ------------------------
const vipRooms = [];  
let roomCounter = 1;

module.exports = (io, socket) => {

  // ODAYI TÜM KULLANICILARA GÖNDER
  const broadcastRooms = () => {
    io.emit("vip:rooms", vipRooms);
  };

  // ------------------------
  // VIP ODA OLUŞTUR
  // ------------------------
  socket.on("vip:create_room", (data) => {
    const roomId = "ROOM_" + roomCounter++;

    const newRoom = {
      id: roomId,
      name: data.name,
      bet: data.bet,
      ownerId: data.ownerId,
      players: []
    };

    vipRooms.push(newRoom);

    // Oda oluşturan cihaza bildirim
    socket.emit("vip:room_created", newRoom);

    // Diğer kullanıcıların listesi güncellensin
    broadcastRooms();
  });

  // ------------------------
  // ODA LİSTESİ İSTE → TEK KOD
  // ------------------------
  socket.on("vip:get_rooms", () => {
    socket.emit("vip:rooms", vipRooms);
  });

  // ------------------------
  // ODAYA KATIL
  // ------------------------
  socket.on("vip:join_room", ({ roomId, user }) => {
    const room = vipRooms.find(r => r.id === roomId);
    if (!room) return;

    if (room.players.some(p => p.id === user.id)) return;

    room.players.push(user);

    io.to(socket.id).emit("vip:joined_room", room);

    broadcastRooms();
  });

  // ------------------------
  // OYUNCU AYRILIRSA
  // ------------------------
  socket.on("disconnect", () => {
    vipRooms.forEach(room => {
      room.players = room.players.filter(p => p.socketId !== socket.id);
    });

    broadcastRooms();
  });
};
