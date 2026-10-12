const LEVELS = ['H', 'M', 'X', 'L']
const LEVEL_NAMES = { H: '高', M: '中', X: '次中', L: '低' }

function filterRounds(rounds, filter, playerId = '') {
  return rounds.filter(round => (filter === 'all' || round.status === filter) &&
    (playerId === '' || [round.p1, round.p2, round.p3, round.p4].some(id => String(id) === String(playerId))))
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
  const rawRounds = snapshot.rounds || []
  const rawCurrent = rawRounds.find(round => round.status === 'active')
  const currentIds = rawCurrent ? [rawCurrent.p1, rawCurrent.p2, rawCurrent.p3, rawCurrent.p4] : []
  const rawNext = rawCurrent && rawRounds.slice(rawRounds.indexOf(rawCurrent) + 1).find(round => round.status === 'pending')
  const nextIds = rawNext ? [rawNext.p1, rawNext.p2, rawNext.p3, rawNext.p4] : []
  const member = id => {
    const player = players.find(player => player.id === id) || {id, name:'待定'}
    return {id:player.id, name:player.name, initial:(player.name || '?').slice(0, 1),
      isLongName:(player.name || '').length > 5, upNext:nextIds.includes(id),
      readiness:currentIds.includes(id) ? '继续上场' : '准备上场'}
  }
  const rounds = rawRounds.map(round => ({
    ...round,
    team1: [member(round.p1).name, member(round.p2).name].join(' / '),
    team2: [member(round.p3).name, member(round.p4).name].join(' / '),
    team1Players: [member(round.p1), member(round.p2)],
    team2Players: [member(round.p3), member(round.p4)],
    score1Label: round.score1 === null || round.score1 === undefined ? '—' : String(round.score1),
    score2Label: round.score2 === null || round.score2 === undefined ? '—' : String(round.score2),
    winner:round.status === 'completed' && round.score1 !== round.score2 ? (round.score1 > round.score2 ? 'A' : 'B') : '',
    seqLabel: String(round.seq).padStart(2, '0'),
    statusText: { active: '正在上场', completed: '已完成', pending: '待上场' }[round.status] || '待上场'
  }))
  const rankingRows = (snapshot.ranking || []).map((player, index) => ({
    ...player,
    rankLabel: String(index + 1).padStart(2, '0'),
    initial: (player.name || '?').slice(0, 1),
    avatarClass: `avatar-${index % 5}`,
    netLabel: player.net > 0 ? `+${player.net}` : String(player.net),
    winRate:player.games ? Math.round(player.wins / player.games * 100) : 0
  }))
  const completedCount = rounds.filter(round => round.status === 'completed').length
  const activePlayers = players.filter(player => player.status !== 'withdrawn')
  const historicalIds = new Set(rawRounds.flatMap(round => [round.p1, round.p2, round.p3, round.p4]))
  return {
    players,
    playerCount: activePlayers.length,
    roundCount: rounds.length,
    adminPlayers: activePlayers,
    schedulePlayers:players.filter(player => player.status !== 'withdrawn' || historicalIds.has(player.id)),
    restingPlayers:rawCurrent ? activePlayers.filter(player => !currentIds.includes(player.id)).map(player => member(player.id)) : [],
    rounds,
    rankingRows,
    rankingLeader: rankingRows[0] || null,
    currentRound: rounds.find(round => round.id === (rawCurrent && rawCurrent.id)) || null,
    nextRound: rounds.find(round => round.id === (rawNext && rawNext.id)) || null,
    completedCount,
    progressPercent:rounds.length ? Math.round(completedCount / rounds.length * 100) : 0,
    remainingCount:rounds.length - completedCount,
    remainingMinutes:(rounds.length - completedCount) * 12,
    isFinished:rounds.length > 0 && completedCount === rounds.length
  }
}

module.exports = { decorateMatch, decoratePlayers, filterRounds }
