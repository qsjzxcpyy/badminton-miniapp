const cloud = require('wx-server-sdk')
const { buildSchedule } = require('./scheduler.cjs')
const { publicSnapshot, requireCreator, applyScore } = require('./logic.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const matches = db.collection('matches')

function fail(message) { throw new Error(message) }
function now() { return new Date() }
async function getMatch(matchId) {
  if (!matchId) fail('缺少比赛编号')
  const result = await matches.doc(matchId).get()
  return result.data
}
async function getByInvite(inviteCode) {
  if (!/^\d{6}$/.test(String(inviteCode || ''))) fail('请输入 6 位邀请码')
  const result = await matches.where({ inviteCode: String(inviteCode) }).limit(1).get()
  if (!result.data.length) fail('未找到该比赛')
  return result.data[0]
}
function revisionOf(match) { return Number.isInteger(match.revision) ? match.revision : 0 }
async function updateWithRevision(match, revision, patch) {
  const result = await matches.where({ _id: match._id, revision }).update({ data: { ...patch, revision: revision + 1, updatedAt: now() } })
  if (!result.stats || result.stats.updated !== 1) fail('数据已被其他人更新，请刷新后重试')
}
function activePlayers(match) { return (match.players || []).filter(player => (player.status || 'active') === 'active') }

exports.main = async (event = {}) => {
  const { OPENID: openId } = cloud.getWXContext()
  const action = event.action

  if (action === 'createMatch') {
    const name = String(event.name || '').trim()
    const inviteCode = String(event.inviteCode || '').trim()
    if (!name) fail('请输入比赛名称')
    if (!/^\d{6}$/.test(inviteCode)) fail('邀请码必须是 6 位数字')
    const existing = await matches.where({ inviteCode }).limit(1).get()
    if (existing.data.length) fail('邀请码已被使用，请更换一个')
    const rosterResult = await db.collection('rosters').where({ ownerOpenId: openId }).limit(1).get()
    const defaultPlayers = rosterResult.data.length && Array.isArray(rosterResult.data[0].players) ? rosterResult.data[0].players : []
    const result = await matches.add({ data: {
      name, inviteCode, creatorOpenId: openId, revision: 0, players: defaultPlayers, rounds: [], createdAt: now(), updatedAt: now()
    } })
    const match = { _id: result._id, name, inviteCode, creatorOpenId: openId, revision: 0, players: defaultPlayers, rounds: [] }
    return { ok: true, isCreator: true, match: publicSnapshot(match, true) }
  }

  let match = event.matchId ? await getMatch(event.matchId) : await getByInvite(event.inviteCode)
  const isCreator = match.creatorOpenId === openId

  if (action === 'getMatch' || action === 'joinMatch') return { ok: true, isCreator, match: publicSnapshot(match, isCreator) }

  if (action === 'savePlayers') {
    requireCreator(match, openId)
    const players = Array.isArray(event.players) ? event.players.map(player => ({
      id: player.id, name: String(player.name || '').trim(), level: player.level, status: player.status || 'active'
    })).filter(player => player.name && ['H', 'M', 'X', 'L'].includes(player.level)) : []
    if (players.some(player => !Number.isFinite(player.id))) fail('球员编号无效')
    await updateWithRevision(match, revisionOf(match), { players })
    match.players = players
    match.revision = revisionOf(match) + 1
    return { ok: true, isCreator: true, match: publicSnapshot(match, true) }
  }

  if (action === 'saveDefaultRoster') {
    requireCreator(match, openId)
    const players = Array.isArray(event.players) ? event.players.map(player => ({ id: player.id, name: String(player.name || '').trim(), level: player.level, status: 'active' })).filter(player => player.name && ['H', 'M', 'X', 'L'].includes(player.level)) : []
    const rosterCollection = db.collection('rosters')
    const existing = await rosterCollection.where({ ownerOpenId: openId }).limit(1).get()
    if (existing.data.length) await rosterCollection.doc(existing.data[0]._id).update({ data: { players, updatedAt: now() } })
    else await rosterCollection.add({ data: { ownerOpenId: openId, players, createdAt: now(), updatedAt: now() } })
    return { ok: true, isCreator: true, match: publicSnapshot(match, true) }
  }
  if (action === 'generateSchedule') {
    requireCreator(match, openId)
    const players = activePlayers(match)
    if (players.length < 4) fail('至少需要 4 名正常球员')
    const currentRounds = Array.isArray(match.rounds) ? match.rounds.map(round => ({ ...round })) : []
    const pending = currentRounds.filter(round => round.status === 'pending')
    const rounds = currentRounds.length ? currentRounds : Array.from({ length: Number(event.roundCount) || 15 }, (_, index) => ({ id: index + 1, seq: index + 1, status: 'pending', score1: null, score2: null }))
    const pendingRounds = rounds.filter(round => round.status === 'pending')
    if (!pendingRounds.length) fail('没有待生成的赛程')
    const previousRounds = rounds.filter(round => round.status === 'completed' || round.status === 'active')
    const generated = buildSchedule({ players, roundCount: pendingRounds.length, previousRounds, random: Math.random })
    if (generated.length !== pendingRounds.length) fail('当前人员组合无法生成合法赛程')
    pendingRounds.forEach((round, index) => Object.assign(round, generated[index], { score1: null, score2: null }))
    if (!rounds.some(round => round.status === 'active')) rounds.find(round => round.status === 'pending').status = 'active'
    await updateWithRevision(match, revisionOf(match), { rounds })
    match.rounds = rounds
    match.revision = revisionOf(match) + 1
    return { ok: true, isCreator: true, match: publicSnapshot(match, true) }
  }

  if (action === 'extendSchedule') {
    requireCreator(match, openId)
    const players = activePlayers(match)
    if (players.length < 4) fail('至少需要 4 名正常球员')
    const rounds = Array.isArray(match.rounds) ? match.rounds.map(round => ({ ...round })) : []
    const count = Math.max(1, Math.min(20, Number(event.count) || 5))
    const nextId = Math.max(0, ...rounds.map(round => Number(round.id) || 0)) + 1
    const nextSeq = Math.max(0, ...rounds.map(round => Number(round.seq) || 0)) + 1
    const newRounds = Array.from({ length: count }, (_, index) => ({ id: nextId + index, seq: nextSeq + index, status: 'pending', score1: null, score2: null }))
    const previousRounds = rounds.filter(round => round.status === 'completed' || round.status === 'active')
    const generated = buildSchedule({ players, roundCount: count, previousRounds, random: Math.random })
    if (generated.length !== count) fail('当前人员组合无法追加合法赛程')
    newRounds.forEach((round, index) => Object.assign(round, generated[index]))
    rounds.push(...newRounds)
    if (!rounds.some(round => round.status === 'active')) rounds.find(round => round.status === 'pending').status = 'active'
    await updateWithRevision(match, revisionOf(match), { rounds })
    match.rounds = rounds
    match.revision = revisionOf(match) + 1
    return { ok: true, isCreator: true, match: publicSnapshot(match, true) }
  }
  if (action === 'saveScore') {
    const revision = revisionOf(match)
    applyScore(match, event.roundId, Number(event.score1), Number(event.score2))
    await updateWithRevision(match, revision, { rounds: match.rounds })
    match.revision = revision + 1
    return { ok: true, isCreator, match: publicSnapshot(match, isCreator) }
  }

  fail('不支持的操作')
}






