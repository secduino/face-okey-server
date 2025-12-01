const rooms = {};

function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
  createRoom() {
    const roomId = generateRoomId();
    
    rooms[roomId] = {
      players: 1
    };

    return roomId;
  },

  joinRoom(roomId) {
    if (!rooms[roomId]) return false;

    if (rooms[roomId].players >= 4) return false;

    rooms[roomId].players += 1;
    return true;
  }
};
