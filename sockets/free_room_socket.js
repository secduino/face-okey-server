// sockets/free_room_socket.js
// Free Room Socket Event Handler

const {
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
} = require('../rooms/freeRooms');

module.exports = (io, socket) => {
  
  // Oda listesini al
  socket.on('free:get_room_list', (callback) => {
    const rooms = getRoomList();
    if (typeof callback === 'function') {
      callback({ success: true, rooms });
    } else {
      socket.emit('free:room_list', { rooms });
    }
  });

  // Odaya katıl
  socket.on('free:join_room', ({ roomId, player }) => {
    // Puan kontrolü
    const canJoin = canJoinRoom(roomId, player.score || 0);
    if (!canJoin.allowed) {
      socket.emit('free:error', { message: canJoin.reason });
      return;
    }
    
    // Odaya ekle
    addPlayerToRoom(roomId, player);
    
    // Socket room'a katıl
    socket.join(`free_room_${roomId}`);
    socket.currentFreeRoom = roomId;
    socket.playerId = player.id;
    
    // Oyuncuya oda bilgilerini gönder
    socket.emit('free:room_joined', {
      roomId,
      players: getRoomPlayers(roomId),
      tables: getRoomTables(roomId),
    });
    
    // Diğer oyunculara bildir
    socket.to(`free_room_${roomId}`).emit('free:player_joined', {
      player: {
        id: player.id,
        name: player.name,
        score: player.score,
        status: 'waiting',
      }
    });
    
    // Oda listesini güncelle
    io.emit('free:room_list_updated', { rooms: getRoomList() });
  });

  // Odadan ayrıl
  socket.on('free:leave_room', ({ roomId }) => {
    if (!socket.playerId) return;
    
    removePlayerFromRoom(roomId, socket.playerId);
    socket.leave(`free_room_${roomId}`);
    
    // Diğerlerine bildir
    socket.to(`free_room_${roomId}`).emit('free:player_left', {
      playerId: socket.playerId
    });
    
    socket.currentFreeRoom = null;
    
    // Oda listesini güncelle
    io.emit('free:room_list_updated', { rooms: getRoomList() });
  });

  // Oda oyuncularını al
  socket.on('free:get_players', ({ roomId }, callback) => {
    const players = getRoomPlayers(roomId);
    if (typeof callback === 'function') {
      callback({ success: true, players });
    } else {
      socket.emit('free:players', { players });
    }
  });

  // Masa listesini al
  socket.on('free:get_tables', ({ roomId }, callback) => {
    const tables = getRoomTables(roomId);
    if (typeof callback === 'function') {
      callback({ success: true, tables });
    } else {
      socket.emit('free:tables', { tables });
    }
  });

  // Masa oluştur
  socket.on('free:create_table', ({ roomId, settings }) => {
    if (!socket.playerId) return;
    
    const player = freeRoomStates[roomId]?.players.find(p => p.id === socket.playerId);
    if (!player) {
      socket.emit('free:error', { message: 'Önce odaya katılmalısınız' });
      return;
    }
    
    const table = createTable(roomId, socket.playerId, {
      ...settings,
      ownerName: player.name,
    });
    
    if (table) {
      // Masaya katıl
      joinTable(roomId, table.id, player);
      socket.join(`free_table_${table.id}`);
      
      socket.emit('free:table_created', { table });
      
      // Odadaki herkese bildir
      io.to(`free_room_${roomId}`).emit('free:table_added', { table });
    }
  });

  // Masaya katıl
  socket.on('free:join_table', ({ roomId, tableId }) => {
    if (!socket.playerId) return;
    
    const player = freeRoomStates[roomId]?.players.find(p => p.id === socket.playerId);
    if (!player) {
      socket.emit('free:error', { message: 'Önce odaya katılmalısınız' });
      return;
    }
    
    const result = joinTable(roomId, tableId, player);
    
    if (result.success) {
      socket.join(`free_table_${tableId}`);
      socket.emit('free:table_joined', { table: result.table });
      
      // Masadakilere bildir
      io.to(`free_table_${tableId}`).emit('free:player_joined_table', {
        tableId,
        player: {
          id: player.id,
          name: player.name,
          score: player.score,
        }
      });
      
      // Oda listesini güncelle
      io.to(`free_room_${roomId}`).emit('free:table_updated', { 
        tableId,
        table: result.table 
      });
    } else {
      socket.emit('free:error', { message: result.reason });
    }
  });

  // Masadan ayrıl
  socket.on('free:leave_table', ({ roomId, tableId }) => {
    if (!socket.playerId) return;
    
    leaveTable(roomId, tableId, socket.playerId);
    socket.leave(`free_table_${tableId}`);
    
    // Masadakilere bildir
    io.to(`free_table_${tableId}`).emit('free:player_left_table', {
      tableId,
      playerId: socket.playerId
    });
    
    // Oda listesini güncelle
    const tables = getRoomTables(roomId);
    io.to(`free_room_${roomId}`).emit('free:tables_updated', { tables });
  });

  // Oda sohbet mesajı gönder
  socket.on('free:send_room_message', ({ roomId, text }) => {
    if (!socket.playerId) return;
    
    const player = freeRoomStates[roomId]?.players.find(p => p.id === socket.playerId);
    if (!player) return;
    
    addRoomChatMessage(roomId, {
      senderId: socket.playerId,
      senderName: player.name,
      text,
    });
    
    // Odadaki herkese gönder
    io.to(`free_room_${roomId}`).emit('free:room_message', {
      senderId: socket.playerId,
      senderName: player.name,
      text,
      timestamp: Date.now(),
    });
  });

  // Masa sohbet mesajı gönder
  socket.on('free:send_table_message', ({ roomId, tableId, text }) => {
    if (!socket.playerId) return;
    
    const player = freeRoomStates[roomId]?.players.find(p => p.id === socket.playerId);
    if (!player) return;
    
    addTableChatMessage(roomId, tableId, {
      senderId: socket.playerId,
      senderName: player.name,
      text,
    });
    
    // Sadece masadakilere gönder
    io.to(`free_table_${tableId}`).emit('free:table_message', {
      tableId,
      senderId: socket.playerId,
      senderName: player.name,
      text,
      timestamp: Date.now(),
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.currentFreeRoom && socket.playerId) {
      removePlayerFromRoom(socket.currentFreeRoom, socket.playerId);
      
      socket.to(`free_room_${socket.currentFreeRoom}`).emit('free:player_left', {
        playerId: socket.playerId
      });
      
      io.emit('free:room_list_updated', { rooms: getRoomList() });
    }
  });
};
