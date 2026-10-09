const LEVELS = ['H', 'M', 'X', 'L']
const LEVEL_NAMES = { H: '高', M: '中', X: '次中', L: '低' }

function filterRounds(rounds, filter) {
  return filter === 'all' ? rounds : rounds.filter(round => round.status === filter)
}

function decoratePlayers(players) {
  return players.map(player => ({
    ...player,
    levelIndex: LEVELS.indexOf(player.level),
    levelLabel: LEVEL_NAMES[player.level] || ''
  }))
}

function decorateMatch(snapshot) {
  const players = decoratePlayers(snapshot.players || [])
  const name = id => (players.find(player => player.id === id) || {}).name || '待定'
  const rounds = (snapshot.rounds || []).map(round => ({
    ...round,
    team1: [name(round.p1), name(round.p2)].join(' / '),
    team2: [name(round.p3), name(round.p4)].join(' / '),
    score1Label: round.score1 === null ? '—' : String(round.score1),
    score2Label: round.score2 === null ? '—' : String(round.score2),
    seqLabel: String(round.seq).padStart(2, '0'),
    statusText: { active: '进行中', completed: '已完成 · 可修改', pending: '待开始' }[round.status] || '待开始'
  }))
  const currentIndex = rounds.findIndex(round => round.status === 'active')
  const rankingRows = (snapshot.ranking || []).map((player, index) => ({
    ...player,
    rankLabel: String(index + 1).padStart(2, '0'),
    initial: (player.name || '?').slice(0, 1),
    avatarClass: `avatar-${index % 5}`,
    netLabel: player.net > 0 ? `+${player.net}` : String(player.net)
  }))
  return {
    players,
    playerCount: players.length,
    roundCount: rounds.length,
    adminPlayers: players.filter(player => player.status !== 'withdrawn'),
    rounds,
    rankingRows,
    rankingLeader: rankingRows[0] || null,
    currentRound: currentIndex >= 0 ? rounds[currentIndex] : null,
    nextRound: currentIndex >= 0 ? rounds[currentIndex + 1] || null : null,
    completedCount: rounds.filter(round => round.status === 'completed').length
  }
}

module.exports = { decorateMatch, decoratePlayers, filterRounds }