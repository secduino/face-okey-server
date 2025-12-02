// rooms/vipRooms.js

const VIP_PLANS = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '12M': 365,
};

const vipRooms = []; 
// Oda yapısı:
// {
//   id,
//   name,
//   ownerId,
//   moderators: [],
//   planType,
//   expiresAt,
//   players: [],
//   bans: [],
//   tables: [],
//   chat: []   // <--- yeni eklenen önemli özellik
// }

function findRoom(roomId) {
  return vipRooms.find(r => r.id === roomId);
}

function createVipRoom({ name, ownerId, planType }) {
  const days = VIP_PLANS[planType];
  const now = Date.now();

  const room = {
    id: "vip_" + now,
    name,
    ownerId,
    moderators: [],
    planType,
    expiresAt: now + days * 86400000,
    players: [],
    bans: [],
    tables: [],
    chat: []
  };

  vipRooms.push(room);
  return room;
}

function extendVipRoom(room, planType) {
  const days = VIP_PLANS[planType];
  const now = Date.now();

  if (room.expiresAt > now) {
    // aktif oda → süre eklenir
    room.expiresAt += days * 86400000;
  } else {
    // süresi dolmuş → sıfırdan başlar
    room.expiresAt = now + days * 86400000;
  }

  room.planType = planType;
  return room;
}

module.exports = {
  vipRooms,
  findRoom,
  createVipRoom,
  extendVipRoom,
  VIP_PLANS
};
