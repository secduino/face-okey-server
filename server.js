// server.js

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// Socket modülleri
const vipSocket = require("./sockets/vip_socket");
const gameSocket = require("./sockets/game_socket");

// ==========================
// GLOBAL VERİ YAPILARI
// ==========================

// Tüm VIP odalar tek yerden tutuluyor
// vip_socket ve game_socket BURAYI ortak kullanıyor
const vipRooms = []; 
// room yapısı:
// {
//   id,
//   name,
//   ownerId,
//   moderators: [],
//   bet,
//   expiresAt,
//   players: [],
//   tables: [],  // { id, name, roomId, ownerId, players: [], hands?, deck?, currentTurnPlayerId? }
//   bans: [],
//   chat: [],
// }

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Basit test endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "FACE OKEY SERVER RUNNING" });
});

// ==========================
// SOCKET.IO KURULUMU
// ==========================
const io = new Server(server, {
  cors: {
    origin: "*", // istersen burayı sadece kendi domainine çekersin
    methods: ["GET", "POST"],
  },
});

// Yeni bağlantı geldiğinde
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // VIP oda socketleri
  vipSocket(io, socket, vipRooms);

  // Oyun masası (okey) socketleri
  gameSocket(io, socket, vipRooms);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// ==========================
// SUNUCUYU ÇALIŞTIR
// ==========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`FACE OKEY SERVER listening on port ${PORT}`);
});
