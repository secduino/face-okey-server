// sockets/game_socket.js

// Oyun state'i (tüm VIP odalar + oyun durumu)
const vipRooms = {};

/**
 * 106 taşlık deste oluştur
 * 4 renk x 1–13 x 2 set + 2 sahte okey
 */
function createDeck() {
  const colors = ["blue", "black", "red", "green"];
  const deck = [];

  colors.forEach((color) => {
    for (let n = 1; n <= 13; n++) {
      // Her sayıdan 2 taş
      deck.push({
        number: n,
        color,
        fakeJoker: false,
      });
      deck.push({
        number: n,
        color,
        fakeJoker: false,
      });
    }
  });

  // 2 adet sahte okey
  deck.push({ number: 0, color: "joker", fakeJoker: true });
  deck.push({ number: 0, color: "joker", fakeJoker: true });

  return deck;
}

/**
 * Fisher–Yates karıştırma algoritması
 */
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Gösterge ve okey'i belirle
 * Sahte okeyleri gösterge olarak seçmemeye çalışır.
 */
function determineOkey(deck) {
  let indicatorIndex = deck.findIndex((t) => !t.fakeJoker);

  if (indicatorIndex === -1) {
    indicatorIndex = 0;
  }

  const [indicator] = deck.splice(indicatorIndex, 1);

  let okeyNumber = indicator.number + 1;
  if (indicator.number === 13) okeyNumber = 1;
  if (indicator.fakeJoker) okeyNumber = 0; // edge case

  return { indicator, okeyNumber };
}

/**
 * Oyunculara taş dağıt: owner 15, diğerleri 14
 */
function dealTiles(room, deck) {
  const hands = {};
  const players = room.players;

  let firstIndex = players.findIndex((p) => p.id === room.ownerId);
  if (firstIndex === -1) firstIndex = 0;

  for (let i = 0; i < players.length; i++) {
    const player = players[(firstIndex + i) % players.length];
    const count = i === 0 ? 15 : 14;

    hands[player.id] = deck.splice(0, count);
  }

  const currentTurnPlayerId = players[firstIndex].id;

  return { hands, currentTurnPlayerId };
}

module.exports = (io, socket) => {
  /**
   * ----------------------------------------------------
   * VIP ODA OLUŞTUR
   * ----------------------------------------------------
   */
  socket.on("vip:create_room", (data) => {
    console.log("VIP Oda oluşturma isteği:", data);

    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();

    const room = {
      id: roomId,
      name: data.name,
      bet: data.bet,
      ownerId: data.ownerId,
      players: [
        {
          id: data.ownerId,
          socketId: socket.id,
        },
      ],
      state: "waiting", // waiting | playing | finished
      game: null,       // oyun state'i burada tutulacak
    };

    vipRooms[roomId] = room;

    socket.join(roomId);

    console.log("VIP Oda oluşturuldu:", room);

    socket.emit("vip:room_created", room);
  });

  /**
   * ----------------------------------------------------
   * VIP ODAYA KATIL
   * ----------------------------------------------------
   */
  socket.on("vip:join_room", (data) => {
    const { roomId, userId } = data;

    const room = vipRooms[roomId];
    if (!room) {
      socket.emit("vip:join_error", { message: "Oda bulunamadı" });
      return;
    }

    room.players.push({
      id: userId,
      socketId: socket.id,
    });

    socket.join(roomId);

    io.to(roomId).emit("vip:room_updated", room);
  });

  /**
   * ----------------------------------------------------
   * VIP ODADAN AYRIL
   * ----------------------------------------------------
   */
  socket.on("vip:leave_room", (data) => {
    const { roomId, userId } = data;

    const room = vipRooms[roomId];
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== userId);

    socket.leave(roomId);

    if (room.players.length === 0) {
      delete vipRooms[roomId];
    } else {
      io.to(roomId).emit("vip:room_updated", room);
    }
  });

  /**
   * ----------------------------------------------------
   * OYUN BAŞLAT (GERÇEK OKEY)
   * ----------------------------------------------------
   *
   * Flutter tarafı:
   * SocketManager.safeEmit("game:start", {"roomId": roomId});
   */
  socket.on("game:start", (data) => {
    const { roomId } = data;
    const room = vipRooms[roomId];

    if (!room) {
      socket.emit("game:error", { message: "Oda bulunamadı" });
      return;
    }

    if (!room.players || room.players.length < 2) {
      socket.emit("game:error", { message: "Yeterli oyuncu yok" });
      return;
    }

    console.log("GAME START room:", roomId);

    let deck = createDeck();
    deck = shuffleDeck(deck);

    const { indicator, okeyNumber } = determineOkey(deck);
    const { hands, currentTurnPlayerId } = dealTiles(room, deck);

    room.state = "playing";
    room.game = {
      indicator,
      okeyNumber,
      hands,
      remaining: deck,
      currentTurnPlayerId,
      discarded: [],
    };

    io.to(roomId).emit("game:started", {
      roomId,
      players: room.players.map((p) => ({ id: p.id })),
      indicator,
      okeyNumber,
      hands,
      currentTurnPlayerId,
    });
  });

  // İleride: tile çekme / atma / el açma eventleri buraya eklenecek
};
