function validateScore(score1, score2) {
  return Number.isInteger(score1) && Number.isInteger(score2) && score1 >= 0 && score2 >= 0
}

function calculateRanking(players = [], rounds = []) {
  const output = players.map(player => ({ id: player.id, name: player.name, net: 0, wins: 0, games: 0 }))
  const byId = Object.fromEntries(output.map(player => [player.id, player]))
  rounds.filter(round => round.status === 'completed' && validateScore(round.score1, round.score2)).forEach(round => {
    const diff = round.score1 - round.score2
    const teamA = [byId[round.p1], byId[round.p2]]
    const teamB = [byId[round.p3], byId[round.p4]]
    teamA.forEach(player => { if (player) { player.net += diff; player.games += 1; if (diff > 0) player.wins += 1 } })
    teamB.forEach(player => { if (player) { player.net -= diff; player.games += 1; if (diff < 0) player.wins += 1 } })
  })
  return output.sort((left, right) => right.net - left.net || right.wins - left.wins || left.games - right.games || String(left.name).localeCompare(String(right.name), 'zh'))
}

function publicSnapshot(match, isCreator = false) {
  const snapshot = {
    id: match._id || match.id,
    name: match.name,
    inviteCode: match.inviteCode,
    revision: match.revision || 0,
    players: (match.players || []).map(player => isCreator
      ? { ...player }
      : { id: player.id, name: player.name, status: player.status || 'active' }),
    rounds: (match.rounds || []).map(round => ({ ...round })),
    ranking: calculateRanking(match.players || [], match.rounds || [])
  }
  if (!isCreator) delete snapshot.inviteCode
  return snapshot
}

function requireCreator(match, openId) {
  if (!match || match.creatorOpenId !== openId) throw new Error('仅创建者可以管理比赛')
}

function applyScore(match, roundId, score1, score2) {
  if (!validateScore(score1, score2)) throw new Error('比分必须是非负整数')
  const round = (match.rounds || []).find(item => item.id === roundId)
  if (!round) throw new Error('未找到该小局')
  round.score1 = score1
  round.score2 = score2
  round.status = 'completed'
  const next = (match.rounds || []).find(item => item.status === 'pending')
  if (next) next.status = 'active'
  return match
}

module.exports = { validateScore, calculateRanking, publicSnapshot, requireCreator, applyScore }
