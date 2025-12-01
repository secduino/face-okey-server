const roomController = require("../controllers/room_controller");

module.exports = (io, socket) => {
  
  // ODA OLUŞTUR
  socket.on("createRoom", (data) => {
    const roomId = roomController.createRoom();
    socket.join(roomId);

    socket.emit("roomCreated", { roomId });
    console.log("Room created:", roomId);
  });

  // ODAYA KATIL
  socket.on("joinRoom", (data) => {
    const ok = roomController.joinRoom(data.roomId);

    if (!ok) {
      socket.emit("joinError", { message: "Room is full or not exist" });
      return;
    }

    socket.join(data.roomId);
    socket.emit("joinedRoom", { roomId: data.roomId });

    socket.to(data.roomId).emit("playerJoined", { id: socket.id });

    console.log("Player joined room:", data.roomId);
  });

  // MESAJ
  socket.on("sendMessage", (data) => {
    io.to(data.roomId).emit("receiveMessage", {
      id: socket.id,
      message: data.message
    });
  });

};
