// -----------------------------
// OKEY GAME SOCKET (MASA)
// -----------------------------

module.exports = (io, socket) => {

  // MASAYA GİRİŞ
  socket.on("game:join_table", ({ tableId, user }) => {
    socket.join(tableId);

    console.log(`User ${user.id} joined table ${tableId}`);

    io.to(tableId).emit("game:player_joined", {
      user,
      tableId
    });
  });

  // MASADAN AYRILMA
  socket.on("game:leave_table", ({ tableId, userId }) => {
    socket.leave(tableId);

    console.log(`User ${userId} left table ${tableId}`);

    io.to(tableId).emit("game:player_left", {
      userId,
      tableId
    });
  });

  // MASA DURUMU (OYUN STATE)
  socket.on("game:update_state", ({ tableId, state }) => {
    io.to(tableId).emit("game:state_changed", state);
  });

  // TAŞ ÇEKME
  socket.on("game:draw_tile", ({ tableId, tile, userId }) => {
    io.to(tableId).emit("game:tile_drawn", { tile, userId });
  });

  // TAŞ ATMA
  socket.on("game:discard_tile", ({ tableId, tile, userId }) => {
    io.to(tableId).emit("game:tile_discarded", { tile, userId });
  });

  // OKU BASMA (Hazırım)
  socket.on("game:ready", ({ tableId, userId }) => {
    io.to(tableId).emit("game:ready_update", { userId });
  });

  // OYUN BAŞLA
  socket.on("game:start", (tableId) => {
    io.to(tableId).emit("game:started");
  });
};
