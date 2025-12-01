// -----------------------------
// OKEY GAME SOCKET
// -----------------------------

module.exports = (io, socket) => {

  // Oyuncu masaya bağlandığında
  socket.on("game:join_table", ({ roomId, user }) => {
    socket.join(roomId);

    console.log(`User ${user.id} joined table ${roomId}`);

    // Tüm odaya bildir
    io.to(roomId).emit("game:player_joined", {
      user,
      roomId
    });
  });

  // Oyuncu odadan ayrılırsa
  socket.on("game:leave_table", ({ roomId, userId }) => {
    socket.leave(roomId);

    console.log(`User ${userId} left table ${roomId}`);

    io.to(roomId).emit("game:player_left", {
      userId,
      roomId
    });
  });

  // Masadan genel broadcast (taş dağıtma, sıra geçme vb.)
  socket.on("game:update_state", ({ roomId, state }) => {
    io.to(roomId).emit("game:state_changed", state);
  });

  // Çekilen taş
  socket.on("game:draw_tile", ({ roomId, tile, userId }) => {
    io.to(roomId).emit("game:tile_drawn", { tile, userId });
  });

  // Atılan taş
  socket.on("game:discard_tile", ({ roomId, tile, userId }) => {
    io.to(roomId).emit("game:tile_discarded", { tile, userId });
  });

  // Oyuncu "oku" bastı → hazır oldu
  socket.on("game:ready", ({ roomId, userId }) => {
    io.to(roomId).emit("game:ready_update", { userId });
  });

  // Oyun başladığında
  socket.on("game:start", (roomId) => {
    io.to(roomId).emit("game:started");
  });

  // Soket disconnect
  socket.on("disconnect", () => {
    console.log("Game socket user disconnected:", socket.id);
  });

};
