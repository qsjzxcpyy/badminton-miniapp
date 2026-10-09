const assert=require('node:assert/strict')
const test=require('node:test')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const {buildSchedule}=require('../scheduler.cjs')
const {analyze,rng}=require('../../../scripts/audit-scheduler.cjs')
function harness(match, seed=9, options={}) {
  const stored=structuredClone(match)
  const matches={
    doc:()=>({get:async()=>({data:structuredClone(stored)})}),
    where:query=>({limit:()=>({get:async()=>({data:query.inviteCode===stored.inviteCode?[structuredClone(stored)]:[]})}),update:async({data})=>{if(options.beforeUpdate) options.beforeUpdate(stored); if(query.revision!==stored.revision) return {stats:{updated:0}}; Object.assign(stored,data);return {stats:{updated:1}}}})
  }
  const cloud={init:()=>{},database:()=>({collection:()=>matches}),getWXContext:()=>({OPENID:options.openId || 'creator'})}
  const exports={}
  const math=Object.create(Math); math.random=rng(seed)
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../index.js'),'utf8'),{
    require: name=>name==='wx-server-sdk'?cloud:name==='./scheduler.cjs' && options.buildSchedule?{buildSchedule:options.buildSchedule}:require(path.join(__dirname,'..',name)),
    exports,Date,Math:math
  })
  return {call:exports.main,stored}
}
function matchWithSchedule(levels) {
  const players=[...levels].map((level,i)=>({id:i+1,name:`P${i+1}`,level,status:'active'}))
  const rounds=buildSchedule({players,roundCount:15,random:rng(3)}).map((r,i)=>({...r,id:i+1,seq:i+1,status:i===0?'active':'pending',score1:null,score2:null}))
  return {_id:'local',creatorOpenId:'creator',revision:2,players,rounds}
}
test('cloud extension counts all scheduled rounds and preserves the existing pending schedule',async()=>{
  for(const levels of ['MMMMMM','MMMMMMM','HHMMMXLL','HHMMMXLLL']) {
    const match=matchWithSchedule(levels), original=JSON.stringify(match.rounds)
    const {call,stored}=harness(match)
    await call({action:'extendSchedule',matchId:'local',count:5})
    assert.equal(stored.rounds.length,20)
    assert.equal(JSON.stringify(stored.rounds.slice(0,15)),original)
    const m=analyze(stored.players,stored.rounds)
    assert.ok(m.spread<=1,`${levels}: ${m.counts}`)
    assert.ok(m.maxStreak<=2,`${levels}: streak ${m.maxStreak}`)
    assert.ok(m.maxRest<=3,`${levels}: rest ${m.maxRest}`)
  }
})
test('cloud regeneration keeps completed scores and the active round',async()=>{
  const match=matchWithSchedule('HHMMMXLL')
  match.rounds[0]={...match.rounds[0],status:'completed',score1:15,score2:9}
  match.rounds[1].status='active'
  const prefix=JSON.stringify(match.rounds.slice(0,2))
  const {call,stored}=harness(match)
  await call({action:'generateSchedule',matchId:'local',roundCount:15})
  assert.equal(JSON.stringify(stored.rounds.slice(0,2)),prefix)
  assert.equal(stored.revision,3)
  const m=analyze(stored.players,stored.rounds)
  assert.ok(m.spread<=1);assert.ok(m.maxStreak<=2);assert.ok(m.maxRest<=3)
})


for (const action of ['savePlayers', 'generateSchedule', 'extendSchedule']) {
  test(`${action} rejects a supplied stale revision without changing stored data`, async () => {
    const match = matchWithSchedule('MMMMMMMM')
    const { call, stored } = harness(match)
    const before = JSON.stringify(stored)
    await assert.rejects(call({
      action, matchId: 'local', revision: 1, count: 5, roundCount: 15,
      players: match.players.map(player => ({ ...player, name: 'Changed' }))
    }), /\u6570\u636e\u5df2\u88ab\u5176\u4ed6\u4eba\u66f4\u65b0/)
    assert.equal(JSON.stringify(stored), before)
  })
  test(`${action} accepts the current revision and advances it once`, async () => {
    const match = matchWithSchedule('MMMMMMMM')
    const { call, stored } = harness(match)
    const result = await call({ action, matchId: 'local', revision: 2, players: match.players, count: 5 })
    assert.equal(result.ok, true)
    assert.equal(stored.revision, 3)
    assert.equal(result.match.revision, 3)
  })
}

test('roster saves without a revision retain backward compatibility', async () => {
  const match = matchWithSchedule('MMMMMMMM')
  const { call, stored } = harness(match)
  await call({ action: 'savePlayers', matchId: 'local', players: match.players })
  assert.equal(stored.revision, 3)
})


for (const levels of ['MMMMMM', 'MMMMMMM', 'HHMMMXLL', 'HHMMMXLLL']) {
  for (const finished of [false, true]) {
    test(`restart ${levels} (${finished ? 'finished' : 'in progress'}) keeps the invite and roster and clears all results`, async () => {
      const match = matchWithSchedule(levels)
      Object.assign(match, { name: 'Weekly games', inviteCode: '123456' })
      match.rounds.forEach((round, i) => {
        if (finished || i < 3) Object.assign(round, { status: 'completed', score1: 21, score2: 18 })
        else if (i === 3) round.status = 'active'
      })
      const oldIds = new Set(match.rounds.map(r => r.id))
      const { call, stored } = harness(match)
      const result = await call({ action: 'restartMatch', matchId: 'local', revision: 2 })
      assert.equal(result.ok, true)
      assert.equal(stored._id, 'local')
      assert.equal(stored.name, match.name)
      assert.equal(stored.inviteCode, match.inviteCode)
      assert.equal(stored.creatorOpenId, match.creatorOpenId)
      assert.deepEqual(stored.players, match.players)
      assert.equal(stored.revision, 3)
      assert.equal(stored.rounds.length, 15)
      assert.equal(stored.rounds[0].status, 'active')
      assert.ok(stored.rounds.slice(1).every(r => r.status === 'pending'))
      assert.ok(stored.rounds.every((r, i) => r.seq === i + 1 && r.score1 === null && r.score2 === null && !oldIds.has(r.id)))
      assert.ok(result.match.ranking.every(p => p.net === 0 && p.wins === 0 && p.games === 0))
      const m = analyze(stored.players, stored.rounds)
      assert.ok(m.spread <= 1); assert.ok(m.maxStreak <= 2); assert.ok(m.maxRest <= 3)
      const joined = await call({ action: 'joinMatch', inviteCode: '123456' })
      assert.equal(joined.isCreator, true)
      assert.equal(joined.match.id, 'local')
      assert.equal(joined.match.rounds[0].id, stored.rounds[0].id)
    })
  }
}

for (const event of [{ revision: 1 }, {}, { revision: 2, guest: true }]) {
  test(`restart rejects ${event.guest ? 'a non-creator' : event.revision ? 'a stale revision' : 'an omitted revision'}`, async () => {
    const match = matchWithSchedule('MMMMMMMM')
    const { call, stored } = harness(match, 9, { openId: event.guest ? 'guest' : 'creator' })
    const before = JSON.stringify(stored)
    await assert.rejects(call({ action: 'restartMatch', matchId: 'local', ...event }), event.guest ? /仅创建者/ : event.revision ? /数据已被其他人更新/ : /需要最新数据/)
    assert.equal(JSON.stringify(stored), before)
  })
}

test('restart excludes withdrawn players while retaining the roster and their statuses', async () => {
  const match = matchWithSchedule('MMMMMMMM')
  match.players[7].status = 'withdrawn'
  const { call, stored } = harness(match)
  await call({ action: 'restartMatch', matchId: 'local', revision: 2 })
  assert.deepEqual(stored.players, match.players)
  assert.ok(stored.rounds.every(r => ![r.p1,r.p2,r.p3,r.p4].includes(8)))
})

for (const options of [
  { buildSchedule: () => { throw new Error('generation failed') } },
  { buildSchedule: () => [] }
]) {
  test('failed restart generation leaves the old schedule and scores intact', async () => {
    const match = matchWithSchedule('MMMMMMMM')
    const { call, stored } = harness(match, 9, options)
    const before = JSON.stringify(stored)
    await assert.rejects(call({ action: 'restartMatch', matchId: 'local', revision: 2 }), /generation failed|无法生成完整赛程/)
    assert.equal(JSON.stringify(stored), before)
  })
}

test('restart with fewer than four active players leaves the match unchanged', async () => {
  const match = matchWithSchedule('MMMMMMMM')
  match.players.slice(3).forEach(p => { p.status = 'withdrawn' })
  const { call, stored } = harness(match)
  const before = JSON.stringify(stored)
  await assert.rejects(call({ action: 'restartMatch', matchId: 'local', revision: 2 }), /至少需要/)
  assert.equal(JSON.stringify(stored), before)
})

test('a concurrent score write prevents restart from replacing the newer data', async () => {
  const match = matchWithSchedule('MMMMMMMM')
  const { call, stored } = harness(match, 9, { beforeUpdate: current => {
    current.revision++
    current.rounds[0].score1 = 21
  } })
  await assert.rejects(call({ action: 'restartMatch', matchId: 'local', revision: 2 }), /数据已被其他人更新/)
  assert.equal(stored.rounds[0].id, 1)
  assert.equal(stored.rounds[0].score1, 21)
})

test('multiple restarts and extensions never reuse IDs and reject old score submissions', async () => {
  const match = matchWithSchedule('MMMMMMMM')
  const { call, stored } = harness(match)
  const ids = new Set(stored.rounds.map(r => r.id))
  for (let i = 0; i < 2; i++) {
    await call({ action: 'restartMatch', matchId: 'local', revision: stored.revision })
    assert.ok(stored.rounds.every(r => !ids.has(r.id)))
    stored.rounds.forEach(r => ids.add(r.id))
    const before = JSON.stringify(stored)
    await assert.rejects(call({ action: 'saveScore', matchId: 'local', roundId: 1, score1: 21, score2: 18 }), /未找到/)
    assert.equal(JSON.stringify(stored), before)
    await call({ action: 'extendSchedule', matchId: 'local', revision: stored.revision, count: 5 })
    assert.ok(stored.rounds.slice(-5).every(r => !ids.has(r.id)))
    stored.rounds.forEach(r => ids.add(r.id))
  }
})


test('ordinary players can reuse the invite after restart and receive a fresh schedule without levels', async () => {
  const match = matchWithSchedule('HHMMMXLL')
  match.inviteCode = '123456'
  const admin = harness(match)
  await admin.call({ action: 'restartMatch', matchId: 'local', revision: 2 })
  const guest = harness(admin.stored, 9, { openId: 'guest' })
  const result = await guest.call({ action: 'joinMatch', inviteCode: '123456' })
  assert.equal(result.isCreator, false)
  assert.equal(result.match.id, 'local')
  assert.equal(result.match.rounds[0].seq, 1)
  assert.equal(result.match.rounds[0].id, 16)
  assert.ok(result.match.players.every(p => p.level === undefined))
  assert.equal(result.match.inviteCode, undefined)
  assert.ok(result.match.ranking.every(p => p.games === 0))
})
