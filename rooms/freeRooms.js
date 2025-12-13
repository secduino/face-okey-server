// rooms/freeRooms.js
// Free Room Yapılandırması - Örnek ekran görüntüsüne göre

const FREE_ROOMS = [
  { id: 'turkiye', name: 'Türkiye', minScore: 20000, icon: '🇹🇷' },
  { id: 'ustalar1', name: 'Ustalar 1', minScore: 15000, icon: '⭐' },
  { id: 'ustalar2', name: 'Ustalar 2', minScore: 10000, icon: '⭐' },
  { id: 'ustalar3', name: 'Ustalar 3', minScore: 7500, icon: '⭐' },
  { id: 'ustalar4', name: 'Ustalar 4', minScore: 5000, icon: '⭐' },
  { id: 'ankara1', name: 'Ankara 1', minScore: 4000, icon: '🏛️' },
  { id: 'bursa1', name: 'Bursa 1', minScore: 3000, icon: '🏙️' },
  { id: 'yas30', name: '30 Yaş', minScore: 2500, icon: '👤' },
  { id: 'yas40', name: '40 Yaş', minScore: 2000, icon: '👤' },
  { id: 'mersin', name: 'Mersin', minScore: 1750, icon: '🌊' },
  { id: 'istanbul4', name: 'İstanbul 4', minScore: 1500, icon: '🌉' },
  { id: 'bursa2', name: 'Bursa 2', minScore: 1250, icon: '🏙️' },
  { id: 'gaziantep', name: 'Gaziantep', minScore: 1000, icon: '🏺' },
  { id: 'balikesir', name: 'Balıkesir', minScore: 0, icon: '🌿' },
  { id: 'aydin', name: 'Aydın', minScore: 0, icon: '☀️' },
  { id: 'giresun', name: 'Giresun', minScore: 0, icon: '🌰' },
  { id: 'amerika', name: 'Amerika', minScore: 0, icon: '🇺🇸' },
];

// Her oda için runtime state
const freeRoomStates = {};

// Oda state'ini başlat
function initFreeRooms() {
  FREE_ROOMS.forEach(room => {
    freeRoomStates[room.id] = {
      ...room,
      players: [],      // Odadaki oyuncular
      tables: [],       // Odadaki masalar
      chat: [],         // Oda sohbeti
      onlineCount: 0,   // Online oyuncu sayısı
      playingCount: 0,  // Oynayan oyuncu sayısı
      waitingCount: 0,  // Bekleyen oyuncu sayısı
    };
  });
  return freeRoomStates;
}

// Oyuncu odaya girebilir mi?
function canJoinRoom(roomId, playerScore) {
  const room = FREE_ROOMS.find(r => r.id === roomId);
  if (!room) return { allowed: false, reason: 'Oda bulunamadı' };
  if (playerScore < room.minScore) {
    return { 
      allowed: false, 
      reason: `Bu odaya girmek için en az ${room.minScore} puan gerekli` 
    };
  }
  return { allowed: true };
}

// Oda listesini al (client için)
function getRoomList() {
  return FREE_ROOMS.map(room => {
    const state = freeRoomStates[room.id] || {};
    return {
      id: room.id,
      name: room.name,
      minScore: room.minScore,
      minScoreDisplay: room.minScore > 0 ? `${room.minScore}+` : '0+',
      icon: room.icon,
      playerCount: state.onlineCount || 0,
      playingCount: state.playingCount || 0,
      waitingCount: state.waitingCount || 0,
    };
  });
}

// Odaya oyuncu ekle
function addPlayerToRoom(roomId, player) {
  if (!freeRoomStates[roomId]) return false;
  
  // Zaten odada mı?
  const existing = freeRoomStates[roomId].players.find(p => p.id === player.id);
  if (existing) return true;
  
  freeRoomStates[roomId].players.push({
    id: player.id,
    name: player.name,
    score: player.score,
    status: 'waiting', // waiting, playing, away
    joinedAt: Date.now(),
  });
  
  updateRoomCounts(roomId);
  return true;
}

// Odadan oyuncu çıkar
function removePlayerFromRoom(roomId, playerId) {
  if (!freeRoomStates[roomId]) return false;
  
  freeRoomStates[roomId].players = freeRoomStates[roomId].players.filter(
    p => p.id !== playerId
  );
  
  updateRoomCounts(roomId);
  return true;
}

// Oda sayılarını güncelle
function updateRoomCounts(roomId) {
  const room = freeRoomStates[roomId];
  if (!room) return;
  
  room.onlineCount = room.players.length;
  room.waitingCount = room.players.filter(p => p.status === 'waiting').length;
  room.playingCount = room.players.filter(p => p.status === 'playing').length;
}

// Oyuncu durumunu güncelle
function updatePlayerStatus(roomId, playerId, status) {
  if (!freeRoomStates[roomId]) return false;
  
  const player = freeRoomStates[roomId].players.find(p => p.id === playerId);
  if (player) {
    player.status = status;
    updateRoomCounts(roomId);
    return true;
  }
  return false;
}

// Oda içindeki oyuncuları getir
function getRoomPlayers(roomId) {
  if (!freeRoomStates[roomId]) return [];
  return freeRoomStates[roomId].players.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    status: p.status,
    statusText: p.status === 'playing' ? 'Oynuyor' : 
                p.status === 'away' ? 'Çevrimiçi' : 'Bekliyor',
  }));
}

// Masaları getir
function getRoomTables(roomId) {
  if (!freeRoomStates[roomId]) return [];
  return freeRoomStates[roomId].tables;
}

// Masa oluştur
function createTable(roomId, ownerId, settings = {}) {
  if (!freeRoomStates[roomId]) return null;
  
  const tableId = `${roomId}_table_${Date.now()}`;
  const table = {
    id: tableId,
    roomId: roomId,
    ownerId: ownerId,
    ownerName: settings.ownerName || 'Oyuncu',
    players: [],
    maxPlayers: 4,
    settings: {
      startingScore: settings.startingScore || 5,
      hasPartner: settings.hasPartner !== false,
      showIndicator: settings.showIndicator !== false,
      isColored: settings.isColored !== false,
    },
    status: 'waiting', // waiting, playing, finished
    createdAt: Date.now(),
    chat: [], // Masa sohbeti
  };
  
  freeRoomStates[roomId].tables.push(table);
  return table;
}

// Masaya katıl
function joinTable(roomId, tableId, player) {
  if (!freeRoomStates[roomId]) return { success: false, reason: 'Oda bulunamadı' };
  
  const table = freeRoomStates[roomId].tables.find(t => t.id === tableId);
  if (!table) return { success: false, reason: 'Masa bulunamadı' };
  if (table.players.length >= table.maxPlayers) {
    return { success: false, reason: 'Masa dolu' };
  }
  if (table.status === 'playing') {
    return { success: false, reason: 'Oyun devam ediyor' };
  }
  
  // Zaten masada mı?
  if (table.players.find(p => p.id === player.id)) {
    return { success: true, table };
  }
  
  table.players.push({
    id: player.id,
    name: player.name,
    score: player.score,
    isReady: false,
  });
  
  // Oyuncu durumunu güncelle
  updatePlayerStatus(roomId, player.id, 'playing');
  
  return { success: true, table };
}

// Masadan ayrıl
function leaveTable(roomId, tableId, playerId) {
  if (!freeRoomStates[roomId]) return false;
  
  const table = freeRoomStates[roomId].tables.find(t => t.id === tableId);
  if (!table) return false;
  
  table.players = table.players.filter(p => p.id !== playerId);
  
  // Oyuncu durumunu güncelle
  updatePlayerStatus(roomId, playerId, 'waiting');
  
  // Masa boşaldıysa sil
  if (table.players.length === 0) {
    freeRoomStates[roomId].tables = freeRoomStates[roomId].tables.filter(
      t => t.id !== tableId
    );
  }
  
  return true;
}

// Oda sohbetine mesaj ekle
function addRoomChatMessage(roomId, message) {
  if (!freeRoomStates[roomId]) return false;
  
  freeRoomStates[roomId].chat.push({
    id: `msg_${Date.now()}`,
    senderId: message.senderId,
    senderName: message.senderName,
    text: message.text,
    timestamp: Date.now(),
  });
  
  // Son 100 mesajı tut
  if (freeRoomStates[roomId].chat.length > 100) {
    freeRoomStates[roomId].chat = freeRoomStates[roomId].chat.slice(-100);
  }
  
  return true;
}

// Masa sohbetine mesaj ekle
function addTableChatMessage(roomId, tableId, message) {
  if (!freeRoomStates[roomId]) return false;
  
  const table = freeRoomStates[roomId].tables.find(t => t.id === tableId);
  if (!table) return false;
  
  table.chat.push({
    id: `msg_${Date.now()}`,
    senderId: message.senderId,
    senderName: message.senderName,
    text: message.text,
    timestamp: Date.now(),
  });
  
  // Son 50 mesajı tut
  if (table.chat.length > 50) {
    table.chat = table.chat.slice(-50);
  }
  
  return true;
}

module.exports = {
  FREE_ROOMS,
  initFreeRooms,
  canJoinRoom,
  getRoomList,
  addPlayerToRoom,
  removePlayerFromRoom,
  updatePlayerStatus,
  getRoomPlayers,
  getRoomTables,
  createTable,
  joinTable,
  leaveTable,
  addRoomChatMessage,
  addTableChatMessage,
  freeRoomStates,
};
