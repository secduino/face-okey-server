const express = require("express");
const http = require("http");
const cors = require("cors");
const socketIO = require("socket.io");

// Global VIP Room Yapısı
const vipRooms = [];

// Express Setup
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// SOCKET DOSYALARI
const gameSocket = require("./sockets/game_socket");
const vipSocket = require("./sockets/vip_socket");

// ==============================
// SOCKET BAĞLANTISI
// ==============================
io.on("connection", (socket) => {
  console.log("Yeni kullanıcı bağlandı:", socket.id);

  // VIP SOKETLERİ
  vipSocket(io, socket, vipRooms);

  // OKEY MASA SOKETLERİ
  gameSocket(io, socket);

  socket.on("disconnect", () => {
    console.log("Kullanıcı ayrıldı:", socket.id);
  });
});

// Server Başlatma
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SERVER ÇALIŞIYOR → PORT: ${PORT}`);
});
