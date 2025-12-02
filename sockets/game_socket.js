// sockets/game_socket.js

module.exports = (io, socket, vipRooms) => {

  // ---------------------------------------------------------
  // MASAYI BUL
  // ---------------------------------------------------------
  function findTable(tableId) {
    for (const room of vipRooms) {
      if (!room.tables) continue;
      const table = room.tables.find(t => t.id === tableId);
      if (table) return { room, table };
    }
    return null;
  }

  // ---------------------------------------------------------
  // TAŞ DESTESİ OLUŞTURMA (106 TAŞ)
  // 4 renk x 2 set x (1–13) = 104 + 2 joker = 106
  // ---------------------------------------------------------
  function createTileDeck() {
    const deck = [];

    const colors = ['blue', 'black', 'red', 'green'];

    // 1–13 arası taşların 2 seti
    for (const color of colors) {
      for (let number = 1; number <= 13; number++) {
        deck.push({ color, number, fakeJoker: false });
        deck.push({ color, number, fakeJoker: false });
      }
    }

    // Joker taşları (2 adet)
    deck.push({ color: 'joker', number: 0, fakeJoker: false });
    deck.push({ color: 'joker', number: 0, fakeJoker: false });

    return deck;
  }

  // ---------------------------------------------------------
  // DESTEYİ KARIŞTIR (Fisher–Yates)
  // ---------------------------------------------------------
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // ---------------------------------------------------------
  // OKEY BELİRLEME
  // - Bir gösterge taş seçilir (joker olmayan bir taş)
  // - Okey = gösterge ile aynı renkte, numara+1 (13 → 1)
  // - Göstergeyi desteden çıkarıyoruz (basit versiyon)
  // ---------------------------------------------------------
  function pickOkey(deck) {
    const idx = deck.findIndex(t => t.color !== 'joker');
    if (idx === -1) {
      return { deck, okeyTile: null };
    }

    const indicator = deck[idx];
    const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;

    const okeyTile = {
      color: indicator.color,
      number: okeyNumber,
      fakeJoker: false,
    };

    // Göstergeyi desteden çıkar (oyuna dahil etme)
    deck.splice(idx, 1);

    return { deck, okeyTile };
  }

  // ---------------------------------------------------------
  // TAS DAĞITMA (başlangıç)
  // ---------------------------------------------------------
  function dealTiles(table) {
    let deck = createTileDeck();
    shuffle(deck);

    // Okey seç
    const picked = pickOkey(deck);
    deck = picked.deck;
    table.okeyTile = picked.okeyTile || null;

    table.deck = deck;
    table.hands = table.hands || {};

    const players = table.players.map(p => p.id.toString());

    // Başlangıçta sıra 1. oyuncuda
    table.currentTurnPlayerId = players[0];

    players.forEach((playerId, index) => {
      const handSize = index === 0 ? 15 : 14;
      table.hands[playerId] = deck.splice(0, handSize);
    });

    // Atılan taşlar için yığın
    table.discardPile = [];
  }

  // ---------------------------------------------------------
  // OYUNU BİTİRME (basit versiyon)
  // ---------------------------------------------------------
  function finishGame(table, reason = 'finished') {
    // Basit: en yüksek skorlu oyuncuyu bul
    // Şu an tüm oyuncular 1000 başlıyor, gerçek hesap henüz yok.
    const scores = table.scores || {};
    const playerIds = Object.keys(scores);
    if (!playerIds.length) return;

    let bestId = playerIds[0];
    let bestScore = scores[bestId];

    for (const pid of playerIds) {
      if (scores[pid] > bestScore) {
        bestScore = scores[pid];
        bestId = pid;
      }
    }

    io.to(table.id).emit('game:finished', {
      reason,
      winnerId: bestId,
      scores,
    });
  }

  // ---------------------------------------------------------
  // MASAYA BAĞLANMA
  // payload: { tableId, userId }
  // ---------------------------------------------------------
  socket.on('game:join_table', ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.players = table.players || [];

    let user = table.players.find(p => p.id.toString() === String(userId));

    // Eğer masa oyuncu listesinde yoksa, basit bir user objesi ekle
    if (!user) {
      user = {
        id: userId,
        name: 'Player',
        avatar: '',
        isGuest: true,
      };
      table.players.push(user);
    }

    // Socket masaya katılır
    socket.join(tableId);

    // Tüm oyunculara duyur
    io.to(tableId).emit('game:player_joined', {
      user,
      tableId,
    });
  });

  // ---------------------------------------------------------
  // OYUN BAŞLATMA
  // payload: tableId VEYA { tableId }
  // ---------------------------------------------------------
  socket.on('game:start', (payload) => {
    const tableId = typeof payload === 'string'
      ? payload
      : (payload && payload.tableId);

    if (!tableId) return;

    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    table.players = table.players || [];

    if (table.players.length < 2) {
      io.to(tableId).emit('game:error', {
        message: 'Oyun başlamak için en az 2 oyuncu gerekir.',
      });
      return;
    }

    // Skorlar (başlangıç: 1000)
    table.scores = table.scores || {};
    table.players.forEach(p => {
      const pid = p.id.toString();
      if (table.scores[pid] == null) {
        table.scores[pid] = 1000;
      }
    });

    // Dağıt
    dealTiles(table);

    // Tüm oyunculara gönder
    io.to(tableId).emit('game:state_changed', {
      hands: table.hands,
      currentTurnPlayerId: table.currentTurnPlayerId,
      okey: table.okeyTile || null,
    });
  });

  // ---------------------------------------------------------
  // TAŞ ÇEKME
  // payload: { tableId, userId }
  // ---------------------------------------------------------
  socket.on('game:draw_tile', ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (!table.deck || !table.hands) return;
    if (table.currentTurnPlayerId !== String(userId)) return;

    if (table.deck.length === 0) {
      // Deste bitti, basit bitiş
      finishGame(table, 'deck_empty');
      return;
    }

    const tile = table.deck.shift();

    table.hands[userId] = table.hands[userId] || [];
    table.hands[userId].push(tile);

    io.to(tableId).emit('game:tile_drawn', {
      tableId,
      userId,
      tile,
    });
  });

  // ---------------------------------------------------------
  // TAŞ ATMA
  // payload: { tableId, tile: {number,color,fakeJoker}, userId }
  // ---------------------------------------------------------
  socket.on('game:discard_tile', ({ tableId, tile, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;

    if (!table.hands || !table.players) return;
    if (table.currentTurnPlayerId !== String(userId)) return;

    const uid = String(userId);

    // ELİNDEN TAŞI ÇIKAR
    const hand = table.hands[uid] || [];
    table.hands[uid] = hand.filter(
      (t) =>
        !(
          t.color === tile.color &&
          t.number === tile.number &&
          !!t.fakeJoker === !!tile.fakeJoker
        )
    );

    // Atılan taş yığınına ekle
    table.discardPile = table.discardPile || [];
    table.discardPile.push(tile);

    // SIRA DEĞİŞTİR
    const idx = table.players.findIndex(p => p.id.toString() === uid);
    if (idx === -1) return;

    const nextIndex = (idx + 1) % table.players.length;
    table.currentTurnPlayerId = table.players[nextIndex].id.toString();

    // Tüm oyunculara duyur
    io.to(tableId).emit('game:tile_discarded', {
      tableId,
      tile,
      userId,
      nextTurn: table.currentTurnPlayerId,
    });

    // İstersen burada bitiş kontrolü koyabilirsin (elde taş kalmadı vs.)
  });

  // ---------------------------------------------------------
  // OYUNCU AYRILDI
  // payload: { tableId, userId }
  // ---------------------------------------------------------
  socket.on('game:leave_table', ({ tableId, userId }) => {
    const info = findTable(tableId);
    if (!info) return;

    const { table } = info;
    const uid = String(userId);

    table.players = (table.players || []).filter(
      (p) => p.id.toString() !== uid
    );

    if (table.hands && table.hands[uid]) {
      delete table.hands[uid];
    }

    io.to(tableId).emit('game:player_left', {
      userId: uid,
      tableId,
    });

    socket.leave(tableId);
  });

  // ---------------------------------------------------------
  // CLIENT SOKET KAPANDI
  // ---------------------------------------------------------
  socket.on('disconnect', () => {
    console.log('Game socket disconnected:', socket.id);
  });
};
