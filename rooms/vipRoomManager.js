// rooms/vipRoomManager.js
// VIP Oda Yönetimi - Abonelik, Moderasyon, Sohbet

// Abonelik fiyatları (TL)
const VIP_PRICES = {
  '1_month': { duration: 1, price: 500, label: '1 Ay' },
  '6_months': { duration: 6, price: 3000, label: '6 Ay' },
  '12_months': { duration: 12, price: 6000, label: '12 Ay' },
};

// VIP oda kapasitesi
const VIP_ROOM_CAPACITY = 100;

// Runtime VIP oda state'leri
const vipRoomStates = {};

// VIP oda oluştur
function createVipRoom(ownerId, ownerName, roomName) {
  const roomId = `vip_${ownerId}_${Date.now()}`;
  
  vipRoomStates[roomId] = {
    id: roomId,
    name: roomName,
    ownerId: ownerId,
    ownerName: ownerName,
    
    // Kapasite
    maxPlayers: VIP_ROOM_CAPACITY,
    
    // Oyuncular ve roller
    players: [],
    moderators: [], // Moderator ID'leri
    bannedPlayers: [], // Banlı oyuncu ID'leri
    mutedPlayers: [], // Susturulmuş oyuncular [{id, until}]
    
    // Masalar
    tables: [],
    
    // Sohbet
    chat: [],
    
    // İstatistikler
    createdAt: Date.now(),
    totalGames: 0,
  };
  
  return vipRoomStates[roomId];
}

// VIP odaya katıl
function joinVipRoom(roomId, player) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  // Banlı mı?
  if (room.bannedPlayers.includes(player.id)) {
    return { success: false, reason: 'Bu odadan banlandınız' };
  }
  
  // Kapasite kontrolü
  if (room.players.length >= room.maxPlayers) {
    return { success: false, reason: 'Oda dolu' };
  }
  
  // Zaten odada mı?
  if (room.players.find(p => p.id === player.id)) {
    return { success: true, room };
  }
  
  room.players.push({
    id: player.id,
    name: player.name,
    score: player.score,
    status: 'waiting',
    joinedAt: Date.now(),
    isModerator: room.moderators.includes(player.id),
    isOwner: room.ownerId === player.id,
  });
  
  return { success: true, room };
}

// VIP odadan ayrıl
function leaveVipRoom(roomId, playerId) {
  const room = vipRoomStates[roomId];
  if (!room) return false;
  
  room.players = room.players.filter(p => p.id !== playerId);
  return true;
}

// Moderator ekle
function addModerator(roomId, requesterId, targetId) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  // Sadece oda sahibi moderator ekleyebilir
  if (room.ownerId !== requesterId) {
    return { success: false, reason: 'Bu işlem için yetkiniz yok' };
  }
  
  if (!room.moderators.includes(targetId)) {
    room.moderators.push(targetId);
    
    // Oyuncu listesinde güncelle
    const player = room.players.find(p => p.id === targetId);
    if (player) player.isModerator = true;
  }
  
  return { success: true };
}

// Moderator kaldır
function removeModerator(roomId, requesterId, targetId) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  if (room.ownerId !== requesterId) {
    return { success: false, reason: 'Bu işlem için yetkiniz yok' };
  }
  
  room.moderators = room.moderators.filter(id => id !== targetId);
  
  const player = room.players.find(p => p.id === targetId);
  if (player) player.isModerator = false;
  
  return { success: true };
}

// Oyuncu at (geçici)
function kickPlayer(roomId, requesterId, targetId) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  // Yetki kontrolü
  const isOwner = room.ownerId === requesterId;
  const isModerator = room.moderators.includes(requesterId);
  
  if (!isOwner && !isModerator) {
    return { success: false, reason: 'Bu işlem için yetkiniz yok' };
  }
  
  // Oda sahibi atılamaz
  if (targetId === room.ownerId) {
    return { success: false, reason: 'Oda sahibi atılamaz' };
  }
  
  // Moderator sadece normal oyuncuları atabilir
  if (isModerator && !isOwner && room.moderators.includes(targetId)) {
    return { success: false, reason: 'Moderatörü atamazsınız' };
  }
  
  room.players = room.players.filter(p => p.id !== targetId);
  
  return { success: true, targetId };
}

// Oyuncu banla (kalıcı)
function banPlayer(roomId, requesterId, targetId) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  const isOwner = room.ownerId === requesterId;
  const isModerator = room.moderators.includes(requesterId);
  
  if (!isOwner && !isModerator) {
    return { success: false, reason: 'Bu işlem için yetkiniz yok' };
  }
  
  if (targetId === room.ownerId) {
    return { success: false, reason: 'Oda sahibi banlanamaz' };
  }
  
  if (isModerator && !isOwner && room.moderators.includes(targetId)) {
    return { success: false, reason: 'Moderatörü banlayamazsınız' };
  }
  
  // Banla
  if (!room.bannedPlayers.includes(targetId)) {
    room.bannedPlayers.push(targetId);
  }
  
  // Odadan çıkar
  room.players = room.players.filter(p => p.id !== targetId);
  
  return { success: true, targetId };
}

// Ban kaldır
function unbanPlayer(roomId, requesterId, targetId) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  if (room.ownerId !== requesterId) {
    return { success: false, reason: 'Bu işlem için yetkiniz yok' };
  }
  
  room.bannedPlayers = room.bannedPlayers.filter(id => id !== targetId);
  
  return { success: true };
}

// Oyuncu sustur
function mutePlayer(roomId, requesterId, targetId, duration = null) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  const isOwner = room.ownerId === requesterId;
  const isModerator = room.moderators.includes(requesterId);
  
  if (!isOwner && !isModerator) {
    return { success: false, reason: 'Bu işlem için yetkiniz yok' };
  }
  
  if (targetId === room.ownerId) {
    return { success: false, reason: 'Oda sahibi susturulamaz' };
  }
  
  // Mute süresi (null = kalıcı)
  const until = duration ? Date.now() + (duration * 60 * 1000) : null;
  
  // Var olan mute'u güncelle veya yeni ekle
  const existingMute = room.mutedPlayers.find(m => m.id === targetId);
  if (existingMute) {
    existingMute.until = until;
  } else {
    room.mutedPlayers.push({ id: targetId, until });
  }
  
  return { success: true, until };
}

// Susturma kaldır
function unmutePlayer(roomId, requesterId, targetId) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  const isOwner = room.ownerId === requesterId;
  const isModerator = room.moderators.includes(requesterId);
  
  if (!isOwner && !isModerator) {
    return { success: false, reason: 'Bu işlem için yetkiniz yok' };
  }
  
  room.mutedPlayers = room.mutedPlayers.filter(m => m.id !== targetId);
  
  return { success: true };
}

// Oyuncu susturulmuş mu?
function isPlayerMuted(roomId, playerId) {
  const room = vipRoomStates[roomId];
  if (!room) return false;
  
  const mute = room.mutedPlayers.find(m => m.id === playerId);
  if (!mute) return false;
  
  // Kalıcı mute
  if (mute.until === null) return true;
  
  // Süreli mute - süresi dolmuş mu?
  if (Date.now() > mute.until) {
    room.mutedPlayers = room.mutedPlayers.filter(m => m.id !== playerId);
    return false;
  }
  
  return true;
}

// VIP oda sohbetine mesaj gönder
function sendVipRoomMessage(roomId, senderId, senderName, text) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  // Susturulmuş mu?
  if (isPlayerMuted(roomId, senderId)) {
    return { success: false, reason: 'Susturuldunuz, mesaj gönderemezsiniz' };
  }
  
  const message = {
    id: `msg_${Date.now()}`,
    senderId,
    senderName,
    text,
    timestamp: Date.now(),
  };
  
  room.chat.push(message);
  
  // Son 200 mesajı tut
  if (room.chat.length > 200) {
    room.chat = room.chat.slice(-200);
  }
  
  return { success: true, message };
}

// VIP oda listesini al
function getVipRoomList() {
  return Object.values(vipRoomStates).map(room => ({
    id: room.id,
    name: room.name,
    ownerName: room.ownerName,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    tableCount: room.tables.length,
  }));
}

// VIP oda detaylarını al
function getVipRoomDetails(roomId) {
  const room = vipRoomStates[roomId];
  if (!room) return null;
  
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    players: room.players,
    moderators: room.moderators,
    tables: room.tables,
    chat: room.chat.slice(-50), // Son 50 mesaj
    createdAt: room.createdAt,
  };
}

// VIP odada masa oluştur
function createVipTable(roomId, ownerId, settings = {}) {
  const room = vipRoomStates[roomId];
  if (!room) return null;
  
  const tableId = `${roomId}_table_${Date.now()}`;
  const table = {
    id: tableId,
    roomId: roomId,
    ownerId: ownerId,
    players: [],
    maxPlayers: 4,
    settings: {
      startingScore: settings.startingScore || 5,
      hasPartner: settings.hasPartner !== false,
      showIndicator: settings.showIndicator !== false,
      isColored: settings.isColored !== false,
    },
    status: 'waiting',
    createdAt: Date.now(),
    chat: [], // Masa sohbeti
  };
  
  room.tables.push(table);
  return table;
}

// Masa sohbetine mesaj gönder
function sendTableMessage(roomId, tableId, senderId, senderName, text) {
  const room = vipRoomStates[roomId];
  if (!room) return { success: false, reason: 'Oda bulunamadı' };
  
  const table = room.tables.find(t => t.id === tableId);
  if (!table) return { success: false, reason: 'Masa bulunamadı' };
  
  // Masada mı?
  if (!table.players.find(p => p.id === senderId)) {
    return { success: false, reason: 'Bu masada değilsiniz' };
  }
  
  const message = {
    id: `msg_${Date.now()}`,
    senderId,
    senderName,
    text,
    timestamp: Date.now(),
  };
  
  table.chat.push(message);
  
  // Son 50 mesajı tut
  if (table.chat.length > 50) {
    table.chat = table.chat.slice(-50);
  }
  
  return { success: true, message };
}

module.exports = {
  VIP_PRICES,
  VIP_ROOM_CAPACITY,
  vipRoomStates,
  createVipRoom,
  joinVipRoom,
  leaveVipRoom,
  addModerator,
  removeModerator,
  kickPlayer,
  banPlayer,
  unbanPlayer,
  mutePlayer,
  unmutePlayer,
  isPlayerMuted,
  sendVipRoomMessage,
  getVipRoomList,
  getVipRoomDetails,
  createVipTable,
  sendTableMessage,
};
