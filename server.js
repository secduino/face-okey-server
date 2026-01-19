// server.js
// FACE Okey Game Server - Ana giriş noktası

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ═══════════════════════════════════════════════════════════
// MODÜL İMPORTLARI
// ═══════════════════════════════════════════════════════════

// Free Rooms
const { initFreeRooms, getRoomList } = require('./rooms/freeRooms');
const freeRoomSocket = require('./sockets/free_room_socket');

// VIP Rooms
const { getVipRoomList } = require('./rooms/vipRoomManager');
const vipRoomSocket = require('./sockets/vip_room_socket');

// Game Engine
const gameSocket = require('./sockets/game_socket');

// Player Manager
const {
  STARTING_SCORE,
  getOrCreatePlayer,
  getLeaderboard
} = require('./engine/player_manager');

// VIP Rooms (eski - game_socket için)
const vipRoomsModule = require('./rooms/vipRooms');
const vipRooms = vipRoomsModule.vipRooms; // Array'i al

// ═══════════════════════════════════════════════════════════
// BAŞLATMA
// ═══════════════════════════════════════════════════════════

// Free room'ları başlat
initFreeRooms();

console.log('✅ Free Rooms başlatıldı');
console.log('✅ VIP Room Manager hazır');
console.log(`✅ Başlangıç puanı: ${STARTING_SCORE}`);

// ═══════════════════════════════════════════════════════════
// REST API ENDPOINTS
// ═══════════════════════════════════════════════════════════

// Sağlık kontrolü
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    startingScore: STARTING_SCORE,
  });
});

// Free room listesi
app.get('/api/rooms/free', (req, res) => {
  res.json({
    success: true,
    rooms: getRoomList()
  });
});

// VIP room listesi
app.get('/api/rooms/vip', (req, res) => {
  res.json({
    success: true,
    rooms: getVipRoomList()
  });
});

// Liderlik tablosu
app.get('/api/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    success: true,
    leaderboard: getLeaderboard(limit)
  });
});

// Oyuncu bilgisi
app.get('/api/player/:userId', (req, res) => {
  const player = getOrCreatePlayer(req.params.userId);
  res.json({
    success: true,
    player
  });
});

// VIP abonelik fiyatları
app.get('/api/vip/prices', (req, res) => {
  const { VIP_PRICES } = require('./rooms/vipRoomManager');
  res.json({
    success: true,
    prices: VIP_PRICES
  });
});

// ═══════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════

io.on("connection", (socket) => {
  console.log("🔌 Yeni bağlantı:", socket.id);

  // Oyuncu kaydı
  socket.on('register', ({ userId, name }) => {
    const player = getOrCreatePlayer(userId, name);
    socket.userId = userId;
    socket.playerName = name;

    socket.emit('registered', {
      player,
      startingScore: STARTING_SCORE
    });

    console.log(`👤 Oyuncu kayıt: ${name} (${userId}) - Puan: ${player.score}`);
  });

  // Free Room Socket Events
  freeRoomSocket(io, socket);

  // VIP Room Socket Events
  vipRoomSocket(io, socket);

  // Game Socket Events (mevcut oyun mantığı)
  gameSocket(io, socket, vipRooms);

  socket.on("disconnect", () => {
    console.log("🔌 Bağlantı koptu:", socket.id);
  });
});

// ═══════════════════════════════════════════════════════════
// SUNUCUYU BAŞLAT
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           FACE OKEY GAME SERVER                            ║
╠════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                ║
║  Başlangıç Puanı: ${STARTING_SCORE}                                    ║
║                                                            ║
║  Endpoints:                                                ║
║  - GET /health                                             ║
║  - GET /api/rooms/free                                     ║
║  - GET /api/rooms/vip                                      ║
║  - GET /api/leaderboard                                    ║
║  - GET /api/player/:userId                                 ║
║  - GET /api/vip/prices                                     ║
╚════════════════════════════════════════════════════════════╝
  `);
});
