// engine/player_manager.js
// Oyuncu Yönetimi - Başlangıç puanı 1000, puan işlemleri

// Başlangıç puanı
const STARTING_SCORE = 1000;

// Runtime oyuncu verileri (Firebase ile senkronize edilecek)
const players = {};

// Oyuncu oluştur veya getir
function getOrCreatePlayer(userId, name) {
  if (!players[userId]) {
    players[userId] = {
      id: userId,
      name: name,
      score: STARTING_SCORE,
      totalGames: 0,
      wins: 0,
      losses: 0,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
  } else {
    players[userId].lastSeenAt = Date.now();
    if (name) players[userId].name = name;
  }
  return players[userId];
}

// Oyuncu bilgilerini al
function getPlayer(userId) {
  return players[userId] || null;
}

// Oyuncu puanını al
function getPlayerScore(userId) {
  return players[userId]?.score || STARTING_SCORE;
}

// Oyuncu puanını güncelle
function updatePlayerScore(userId, change) {
  if (!players[userId]) return null;
  
  players[userId].score += change;
  
  // Minimum 0 puan
  if (players[userId].score < 0) {
    players[userId].score = 0;
  }
  
  return players[userId].score;
}

// Oyuncu puanını set et
function setPlayerScore(userId, score) {
  if (!players[userId]) return null;
  
  players[userId].score = Math.max(0, score);
  return players[userId].score;
}

// Oyun sonucu güncelle
function updateGameResult(userId, won) {
  if (!players[userId]) return null;
  
  players[userId].totalGames++;
  if (won) {
    players[userId].wins++;
  } else {
    players[userId].losses++;
  }
  
  return players[userId];
}

// Oyuncu istatistikleri
function getPlayerStats(userId) {
  const player = players[userId];
  if (!player) return null;
  
  return {
    id: player.id,
    name: player.name,
    score: player.score,
    totalGames: player.totalGames,
    wins: player.wins,
    losses: player.losses,
    winRate: player.totalGames > 0 
      ? Math.round((player.wins / player.totalGames) * 100) 
      : 0,
  };
}

// Liderlik tablosu (top N oyuncu)
function getLeaderboard(limit = 50) {
  return Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p, index) => ({
      rank: index + 1,
      id: p.id,
      name: p.name,
      score: p.score,
    }));
}

// Firebase'den oyuncu verilerini yükle
function loadPlayerFromFirebase(userData) {
  if (!userData || !userData.id) return null;
  
  players[userData.id] = {
    id: userData.id,
    name: userData.name || 'Oyuncu',
    score: userData.score ?? STARTING_SCORE,
    totalGames: userData.totalGames || 0,
    wins: userData.wins || 0,
    losses: userData.losses || 0,
    createdAt: userData.createdAt || Date.now(),
    lastSeenAt: Date.now(),
  };
  
  return players[userData.id];
}

// Oyuncu verilerini Firebase formatına çevir
function getPlayerForFirebase(userId) {
  const player = players[userId];
  if (!player) return null;
  
  return {
    id: player.id,
    name: player.name,
    score: player.score,
    totalGames: player.totalGames,
    wins: player.wins,
    losses: player.losses,
    createdAt: player.createdAt,
    lastSeenAt: player.lastSeenAt,
  };
}

// Tüm oyuncuları getir
function getAllPlayers() {
  return Object.values(players);
}

// Oyuncu sayısı
function getPlayerCount() {
  return Object.keys(players).length;
}

module.exports = {
  STARTING_SCORE,
  getOrCreatePlayer,
  getPlayer,
  getPlayerScore,
  updatePlayerScore,
  setPlayerScore,
  updateGameResult,
  getPlayerStats,
  getLeaderboard,
  loadPlayerFromFirebase,
  getPlayerForFirebase,
  getAllPlayers,
  getPlayerCount,
  players,
};
