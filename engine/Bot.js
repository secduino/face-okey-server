// engine/Bot.js

const { checkWinning } = require('./game_rules');
const { isWildcard } = require('./tile_util');

class Bot {
  constructor(name, hand = []) {
    this.id = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.name = name;
    this.hand = hand;
    this.isBot = true;
    this.socketId = null;
    this.avatar = "bot";
  }

  chooseDiscard(okeyTile) {
    if (this.hand.length === 0) return null;

    const counts = {};
    for (const tile of this.hand) {
      const key = `${tile.color}-${tile.number}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    const nonJokers = this.hand.filter(t => !isWildcard(t, okeyTile));
    if (nonJokers.length === 0) return this.hand[0];

    let candidate = nonJokers[0];
    let minCount = Infinity;
    for (const tile of nonJokers) {
      const key = `${tile.color}-${tile.number}`;
      if (counts[key] < minCount) {
        minCount = counts[key];
        candidate = tile;
      }
    }
    return candidate;
  }

  makeMove(deck, discardPile, okeyTile) {
    if (deck.length === 0) {
      return { action: 'wait', reason: 'deck_empty' };
    }

    const drawn = deck.shift();
    this.hand.push(drawn);

    if (checkWinning(this.hand, okeyTile).won) {
      return { action: 'win', discarded: null };
    }

    const toDiscard = this.chooseDiscard(okeyTile);
    if (!toDiscard) return { action: 'wait', reason: 'no_discard' };

    this.hand = this.hand.filter(t => !(
      t.color === toDiscard.color &&
      t.number === toDiscard.number &&
      !!t.fakeJoker === !!toDiscard.fakeJoker
    ));
    discardPile.push(toDiscard);

    return { action: 'discard', discarded: toDiscard };
  }
}

module.exports = Bot;
