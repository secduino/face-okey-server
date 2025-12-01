const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const gameSocket = require("./sockets/game_socket");
const vipSocket = require("./sockets/vip_socket"); // VIP Sockets

// ------------------------------------------------
// APP
// ------------------------------------------------
const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("FACE Okey Server Running");
});

// ------------------------------------------------
// HTTP SERVER
// ------------------------------------------------
const server = http.createServer(app);

// ------------------------------------------------
// GLOBAL ROOM LIST (VIP Rooms)
// ------------------------------------------------
const rooms = []; // VIP odalar burada tutulacak

// ------------------------------------------------
// SOCKET.IO
// ------------------------------------------------
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ------------------------------------------------
// SOCKET CONNECTION
// ------------------------------------------------
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Game Logic
  gameSocket(io, socket);

  // VIP Room Logic
  vipSocket(io, socket, rooms);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// ------------------------------------------------
// SERVER LISTEN
// ------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
