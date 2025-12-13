// sockets/vip_room_socket.js
// VIP Room Socket Event Handler - Moderasyon ve Sohbet

const {
  VIP_PRICES,
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
  sendVipRoomMessage,
  getVipRoomList,
  getVipRoomDetails,
  createVipTable,
  sendTableMessage,
  vipRoomStates,
} = require('../rooms/vipRoomManager');

module.exports = (io, socket) => {
  
  // VIP fiyatlarını al
  socket.on('vip:get_prices', (callback) => {
    if (typeof callback === 'function') {
      callback({ success: true, prices: VIP_PRICES });
    } else {
      socket.emit('vip:prices', { prices: VIP_PRICES });
    }
  });

  // VIP oda listesini al
  socket.on('vip:get_room_list', (callback) => {
    const rooms = getVipRoomList();
    if (typeof callback === 'function') {
      callback({ success: true, rooms });
    } else {
      socket.emit('vip:room_list', { rooms });
    }
  });

  // VIP oda oluştur
  socket.on('vip:create_room', ({ ownerId, ownerName, roomName }) => {
    const room = createVipRoom(ownerId, ownerName, roomName);
    
    socket.join(`vip_room_${room.id}`);
    socket.currentVipRoom = room.id;
    socket.playerId = ownerId;
    
    socket.emit('vip:room_created', { room });
    
    // Listeyi güncelle
    io.emit('vip:room_list_updated', { rooms: getVipRoomList() });
  });

  // VIP odaya katıl
  socket.on('vip:join_room', ({ roomId, player }) => {
    const result = joinVipRoom(roomId, player);
    
    if (!result.success) {
      socket.emit('vip:error', { message: result.reason });
      return;
    }
    
    socket.join(`vip_room_${roomId}`);
    socket.currentVipRoom = roomId;
    socket.playerId = player.id;
    
    // Oda detaylarını gönder
    const details = getVipRoomDetails(roomId);
    socket.emit('vip:room_joined', { room: details });
    
    // Diğerlerine bildir
    socket.to(`vip_room_${roomId}`).emit('vip:player_joined', {
      player: {
        id: player.id,
        name: player.name,
        score: player.score,
        status: 'waiting',
      }
    });
  });

  // VIP odadan ayrıl
  socket.on('vip:leave_room', ({ roomId }) => {
    if (!socket.playerId) return;
    
    leaveVipRoom(roomId, socket.playerId);
    socket.leave(`vip_room_${roomId}`);
    
    socket.to(`vip_room_${roomId}`).emit('vip:player_left', {
      playerId: socket.playerId
    });
    
    socket.currentVipRoom = null;
  });

  // Moderator ekle
  socket.on('vip:add_moderator', ({ roomId, targetId }) => {
    if (!socket.playerId) return;
    
    const result = addModerator(roomId, socket.playerId, targetId);
    
    if (result.success) {
      io.to(`vip_room_${roomId}`).emit('vip:moderator_added', { targetId });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Moderator kaldır
  socket.on('vip:remove_moderator', ({ roomId, targetId }) => {
    if (!socket.playerId) return;
    
    const result = removeModerator(roomId, socket.playerId, targetId);
    
    if (result.success) {
      io.to(`vip_room_${roomId}`).emit('vip:moderator_removed', { targetId });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Oyuncu at
  socket.on('vip:kick_player', ({ roomId, targetId }) => {
    if (!socket.playerId) return;
    
    const result = kickPlayer(roomId, socket.playerId, targetId);
    
    if (result.success) {
      // Atılan oyuncuya bildir
      io.to(`vip_room_${roomId}`).emit('vip:player_kicked', { 
        targetId,
        kickedBy: socket.playerId 
      });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Oyuncu banla
  socket.on('vip:ban_player', ({ roomId, targetId }) => {
    if (!socket.playerId) return;
    
    const result = banPlayer(roomId, socket.playerId, targetId);
    
    if (result.success) {
      io.to(`vip_room_${roomId}`).emit('vip:player_banned', { 
        targetId,
        bannedBy: socket.playerId 
      });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Ban kaldır
  socket.on('vip:unban_player', ({ roomId, targetId }) => {
    if (!socket.playerId) return;
    
    const result = unbanPlayer(roomId, socket.playerId, targetId);
    
    if (result.success) {
      socket.emit('vip:player_unbanned', { targetId });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Oyuncu sustur
  socket.on('vip:mute_player', ({ roomId, targetId, duration }) => {
    if (!socket.playerId) return;
    
    const result = mutePlayer(roomId, socket.playerId, targetId, duration);
    
    if (result.success) {
      io.to(`vip_room_${roomId}`).emit('vip:player_muted', { 
        targetId,
        until: result.until,
        mutedBy: socket.playerId 
      });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Susturma kaldır
  socket.on('vip:unmute_player', ({ roomId, targetId }) => {
    if (!socket.playerId) return;
    
    const result = unmutePlayer(roomId, socket.playerId, targetId);
    
    if (result.success) {
      io.to(`vip_room_${roomId}`).emit('vip:player_unmuted', { 
        targetId,
        unmutedBy: socket.playerId 
      });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Oda sohbet mesajı gönder
  socket.on('vip:send_room_message', ({ roomId, text }) => {
    if (!socket.playerId) return;
    
    const room = vipRoomStates[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.playerId);
    if (!player) return;
    
    const result = sendVipRoomMessage(roomId, socket.playerId, player.name, text);
    
    if (result.success) {
      io.to(`vip_room_${roomId}`).emit('vip:room_message', result.message);
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // VIP odada masa oluştur
  socket.on('vip:create_table', ({ roomId, settings }) => {
    if (!socket.playerId) return;
    
    const table = createVipTable(roomId, socket.playerId, settings);
    
    if (table) {
      socket.join(`vip_table_${table.id}`);
      socket.emit('vip:table_created', { table });
      
      io.to(`vip_room_${roomId}`).emit('vip:table_added', { table });
    }
  });

  // Masa sohbet mesajı gönder
  socket.on('vip:send_table_message', ({ roomId, tableId, text }) => {
    if (!socket.playerId) return;
    
    const room = vipRoomStates[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.playerId);
    if (!player) return;
    
    const result = sendTableMessage(roomId, tableId, socket.playerId, player.name, text);
    
    if (result.success) {
      // Sadece masadakilere gönder
      io.to(`vip_table_${tableId}`).emit('vip:table_message', {
        tableId,
        message: result.message
      });
    } else {
      socket.emit('vip:error', { message: result.reason });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.currentVipRoom && socket.playerId) {
      leaveVipRoom(socket.currentVipRoom, socket.playerId);
      
      socket.to(`vip_room_${socket.currentVipRoom}`).emit('vip:player_left', {
        playerId: socket.playerId
      });
    }
  });
};
