// ================================
// OKEY GAME SOCKET - TẢM SÜRÜM
// ================================

module.exports = (io, socket, vipRooms) => {

  // -------------------------------------------------
  // OKEY TAŞLARINI SENİN GÖRSELLERE GÖRE OLUŞTURMA
  // -------------------------------------------------
  function createDeck() {
    const tiles = [];
    let idCounter = 1;
    let assetIndex = 1;

    const colors = [
      { letter: "B" }, // Mavi
      { letter: "S" }, // Siyah
      { letter: "R" }, // Kırmızı
      { letter: "G" }, // Yeşil
    ];

    // 4 renk x 2 set = 104 taş
    for (let set = 0; set < 2; set++) {
      for (const col of colors) {
        for (let value = 1; value <= 13; value++) {

          tiles.push({
            id: idCounter++,
            color: col.letter,
            value,
            isJoker: false,
            asset: `assets/tiles/tile${String(assetIndex).padStart(2, "0")}.png`,
          });

          assetIndex++;
        }
      }
    }

    // ======================
    // SAHTE OKEYLER
    // ======================
    tiles.push({
      id: idCounter++,
      color: "J",
      value: 0,
      isJoker: true,
      asset: "assets/tiles/tile53.png",
    });

    tiles.push({
      id: idCounter++,
      color: "J",
      value: 0,
      isJoker: true,
      asset: "assets/tiles/tile54.png",
    });

    return tiles;
  }

  // -----------------------------------------------
  // MASADA KİŞİ SAYISINA GÖRE TAŞ DAĞITMA
  // -----------------------------------------------
  function dealTiles(players) {
    const deck = createDeck();

    // Karıştır
    deck.sort(() => Math.random() - 0.5);

    const hands = {};

    // Başlatan oyuncu 15 taş
    const starter = players[0].id;

    for (let p of players) {
      hands[p.id] = [];
      const count = p.id === starter ? 15 : 14;

      for (let i = 0; i < count; i++) {
        const tile = deck.pop();
        hands[p.id].push(tile);
      }
    }

    return {
      hands,
      remainingDeck: deck,
      currentTurnPlayerId: starter,
    };
  }

  // ======================================
  // MASAYA KATILMA
  // ======================================
  socket.on("game:join_table", ({ tableId, user }) => {
    socket.join(tableId);

    console.log(`User ${user.id} joined table ${tableId}`);

    io.to(tableId).emit("game:player_joined", {
      user,
      tableId,
    });
  });

  // ======================================
  // OYUN BAŞLATMA
  // ======================================
  socket.on("game:start", (tableId) => {
    // VIP Rooms → table bul
    let table = null;

    for (let room of vipRooms) {
      const t = room.tables.find(tb => tb.id === tableId);
      if (t) table = t;
    }

    if (!table) return;

    if (!table.players || table.players.length === 0) {
      io.to(tableId).emit("game:error", { message: "Masa boş." });
      return;
    }

    // Taş dağıt
    const { hands, remainingDeck, currentTurnPlayerId } = dealTiles(
      table.players
    );

    table.hands = hands;
    table.deck = remainingDeck;
    table.currentTurnPlayerId = currentTurnPlayerId;

    io.to(tableId).emit("game:state_changed", {
      hands,
      currentTurnPlayerId,
    });

    console.log("OYUN BAŞLADI MASA:", tableId);
  });

  // ======================================
  // TAŞ ÇEKME
  // ======================================
  socket.on("game:draw_tile", ({ tableId, userId }) => {
    let table = null;

    for (let room of vipRooms) {
      const t = room.tables.find(tb => tb.id === tableId);
      if (t) table = t;
    }

    if (!table) return;

    const tile = table.deck.pop();
    if (!tile) return;

    table.hands[userId].push(tile);

    io.to(tableId).emit("game:tile_drawn", { tile, userId });
  });

  // ======================================
  // TAŞ ATMA
  // ======================================
  socket.on("game:discard_tile", ({ tableId, tile, userId }) => {
    io.to(tableId).emit("game:tile_discarded", { tile, userId });
  });

  // ======================================
  // SIRA GEÇME
  // ======================================
  socket.on("game:pass_turn", ({ tableId, nextPlayerId }) => {
    io.to(tableId).emit("game:turn_changed", { nextPlayerId });
  });

  socket.on("disconnect", () => {
    console.log("Game socket user disconnected:", socket.id);
  });
};
