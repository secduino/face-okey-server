const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const gameSocket = require("./sockets/game_socket");
const vipSocket = require("./sockets/vip_socket"); // VIP socket

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("FACE Okey Server Running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// VIP odaları burada tutuyoruz
const rooms = [];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Normal oyun soketi
  gameSocket(io, socket);

  // VIP soketi (EN ÖNEMLİSİ BU)
  vipSocket(io, socket, rooms);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
