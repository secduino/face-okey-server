// /engine/bot_engine.js
// Bot AI - Bağlantısı kopan oyuncuların yerine otomatik oynayan bot

const { isWildcard, tileToString } = require("./tile_util");
const { checkWinning, checkPairsWinning } = require("./game_rules");

// -------------------------------------------------------------
// BOT KARAR: TAŞ ATMA
// 
// Strateji:
// 1. Joker (Okey) asla atılmaz
// 2. En az tekrar eden taş atılır
// 3. Eşleşmemiş, tek kalan taşlar öncelikli atılır
// -------------------------------------------------------------
function chooseTileToDiscard(hand, okeyTile) {
  if (!hand || hand.length === 0) return null;

  // Joker olmayan taşları filtrele
  const nonJokers = hand.filter(t => !isWildcard(t, okeyTile));
  
  // Eğer tüm taşlar joker ise (imkansız ama güvenlik için)
  if (nonJokers.length === 0) {
    return hand[0];
  }

  // Taş frekanslarını hesapla (renk-sayı bazında)
  const frequency = {};
  for (const tile of nonJokers) {
    const key = `${tile.color}-${tile.number}`;
    frequency[key] = (frequency[key] || 0) + 1;
  }

  // En az tekrar eden taşı bul
  let minFreq = Infinity;
  let tileToDiscard = null;

  for (const tile of nonJokers) {
    const key = `${tile.color}-${tile.number}`;
    const freq = frequency[key];
    
    if (freq < minFreq) {
      minFreq = freq;
      tileToDiscard = tile;
    }
  }

  console.log(`🤖 Bot taş seçti: ${tileToString(tileToDiscard)} (frekans: ${minFreq})`);
  return tileToDiscard;
}

// -------------------------------------------------------------
// BOT: BİTİŞ KONTROLÜ
// 
// 15 taşlık el ile bitirebilir mi kontrol eder
// Hem normal bitiş hem çift bitiş denenir
// -------------------------------------------------------------
function canBotFinish(hand, okeyTile) {
  if (!hand || hand.length !== 15) {
    return { canFinish: false, reason: "15 taş gerekli" };
  }

  // Normal bitiş kontrolü
  const normalResult = checkWinning(hand, okeyTile);
  if (normalResult.won) {
    return {
      canFinish: true,
      type: "normal",
      discardedTile: normalResult.discardedTile,
      groups: normalResult.groups,
      usedOkey: normalResult.usedOkey
    };
  }

  // Çift bitiş kontrolü - her taşı atarak dene
  for (let i = 0; i < hand.length; i++) {
    const discarded = hand[i];
    const remaining = hand.filter((_, idx) => idx !== i);
    
    const pairsResult = checkPairsWinning(remaining, okeyTile);
    if (pairsResult.won) {
      return {
        canFinish: true,
        type: "pairs",
        discardedTile: discarded,
        pairs: pairsResult.pairs
      };
    }
  }

  return { canFinish: false, reason: "Geçerli bitiş bulunamadı" };
}

// -------------------------------------------------------------
// BOT HAMLE DÖNGÜSÜ
// 
// 1. Taş çek (desteden)
// 2. Bitiş kontrolü yap
// 3. Bitiremiyorsa taş at
// -------------------------------------------------------------
function botMakeMove(stateTable, botPlayerId) {
  const hand = stateTable.hands[botPlayerId];
  const okeyTile = stateTable.okeyTile;

  console.log(`🤖 Bot hamle yapıyor: ${botPlayerId}`);
  console.log(`   El: ${hand.map(t => tileToString(t)).join(', ')}`);

  // 1. El 14 taşsa - taş çekmeli
  if (hand.length === 14) {
    // Desteden çek (soldan almaz - basit strateji)
    if (stateTable.deck.length > 0) {
      const drawnTile = stateTable.deck.shift();
      hand.push(drawnTile);
      console.log(`🤖 Bot desteden çekti: ${tileToString(drawnTile)}`);
      
      return {
        action: "draw",
        tile: drawnTile,
        deckCount: stateTable.deck.length,
        needsDiscard: true
      };
    } else {
      return { action: "error", reason: "Deste boş" };
    }
  }

  // 2. El 15 taşsa - bitiş kontrolü veya taş atma
  if (hand.length === 15) {
    // Bitirebilir mi?
    const finishResult = canBotFinish(hand, okeyTile);
    
    if (finishResult.canFinish) {
      console.log(`🤖 Bot bitirebilir! Tip: ${finishResult.type}`);
      return {
        action: "finish",
        ...finishResult
      };
    }

    // Bitiremiyorsa taş at
    const tileToDiscard = chooseTileToDiscard(hand, okeyTile);
    
    if (tileToDiscard) {
      // Elden çıkar
      const idx = hand.findIndex(t => 
        t.color === tileToDiscard.color && 
        t.number === tileToDiscard.number &&
        !!t.fakeJoker === !!tileToDiscard.fakeJoker
      );
      
      if (idx !== -1) {
        hand.splice(idx, 1);
        
        // Discard pile'a ekle
        stateTable.discardPiles[botPlayerId] = stateTable.discardPiles[botPlayerId] || [];
        stateTable.discardPiles[botPlayerId].push(tileToDiscard);
        stateTable.lastDiscardedTile = { tile: tileToDiscard, playerId: botPlayerId };

        console.log(`🤖 Bot taş attı: ${tileToString(tileToDiscard)}`);
        
        return {
          action: "discard",
          tile: tileToDiscard,
          handSize: hand.length
        };
      }
    }
  }

  return { action: "error", reason: "Geçersiz el durumu" };
}

// -------------------------------------------------------------
// BOT OLUŞTUR
// 
// Bağlantısı kopan oyuncunun yerine bot oluşturur
// -------------------------------------------------------------
function createBot(playerId, playerName) {
  return {
    id: playerId,
    name: `${playerName} (Bot)`,
    isBot: true,
    originalPlayerId: playerId,
    createdAt: Date.now()
  };
}

// -------------------------------------------------------------
// BOT KONTROLÜ
// -------------------------------------------------------------
function isBot(player) {
  return player && player.isBot === true;
}

// -------------------------------------------------------------
module.exports = {
  chooseTileToDiscard,
  canBotFinish,
  botMakeMove,
  createBot,
  isBot
};
