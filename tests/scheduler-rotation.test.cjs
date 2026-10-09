const assert = require('node:assert/strict')
const test = require('node:test')
const { buildSchedule, isLegalGroup } = require('../cloudfunctions/match/scheduler.cjs')
const roster = levels => [...levels].map((level, i) => ({ id: i + 1, level }))
const ids = r => [r.p1, r.p2, r.p3, r.p4]
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 } }
function metrics(players, rounds) {
  const counts = players.map(p => rounds.filter(r => ids(r).includes(p.id)).length)
  let maxStreak = 0, maxRest = 0
  for (const p of players) { let streak = 0, rest = 0; for (const r of rounds) {
    if (ids(r).includes(p.id)) { streak++; rest = 0 } else { rest++; streak = 0 }
    maxStreak = Math.max(maxStreak, streak); maxRest = Math.max(maxRest, rest)
  } }
  return { counts, maxStreak, maxRest }
}
for (const levels of ['MMMMMM', 'HHMMLL', 'HMLLLL', 'MMMMMMM', 'HHMMMLL', 'MMMMMMMM', 'HHMMMXLL', 'HHMMMMLL', 'MMMMMMMMM', 'HHMMMXLLL', 'HHHHLLLLL']) {
  test(`fair complete rotation with controlled streaks: ${levels}`, () => {
    const players = roster(levels)
    for (let seed = 1; seed <= 8; seed++) {
      const rounds = buildSchedule({ players, roundCount: 15, random: random(seed) })
      assert.equal(rounds.length, 15, `seed ${seed}`)
      for (const r of rounds) { assert.equal(new Set(ids(r)).size, 4); assert.ok(ids(r).every(id => players.some(p => p.id === id))) }
      const m = metrics(players, rounds)
      assert.ok(Math.max(...m.counts) - Math.min(...m.counts) <= 1, `seed ${seed}: ${m.counts}`)
      assert.ok(m.maxStreak <= 2, `seed ${seed}: streak ${m.maxStreak}`)
      assert.ok(m.maxRest <= 3, `seed ${seed}: rest ${m.maxRest}`)
      if (players.length >= 8) assert.equal(ids(rounds[0]).some(id => ids(rounds[1]).includes(id)), false, `opening seed ${seed}`)
    }
  })
}
test('actual high/middle partnerships cover all three middles and rotate quartets', () => {
  for (const levels of ['HHMMMXLL', 'HHMMMXLLL']) for (let seed = 1; seed <= 12; seed++) {
    const players = roster(levels), rounds = buildSchedule({ players, roundCount: 15, random: random(seed) })
    assert.ok(rounds.every(r => isLegalGroup(ids(r), players)))
    for (const high of [1, 2]) {
      const partners = new Set()
      for (const r of rounds) { const a = ids(r); if (a.slice(0,2).includes(high)) a.slice(0,2).filter(id => id !== high).forEach(id => partners.add(id)); if (a.slice(2).includes(high)) a.slice(2).filter(id => id !== high).forEach(id => partners.add(id)) }
      assert.ok([3,4,5].every(id => partners.has(id)), `${levels} seed ${seed}, high ${high}: ${[...partners]}`)
    }
    const quartets = new Set(rounds.map(r => ids(r).sort((a,b) => a-b).join(',')))
    assert.ok(quartets.size >= 6, `${levels} seed ${seed}: ${quartets.size} quartets`)
  }
})
test('extension preserves quotas, partners and streaks across the history boundary', () => {
  const players = roster('HHMMMXLL')
  const previousRounds = buildSchedule({ players, roundCount: 15, random: random(3) })
  const before = JSON.stringify(previousRounds)
  const added = buildSchedule({ players, roundCount: 5, previousRounds, random: random(7) })
  assert.equal(added.length, 5); assert.equal(JSON.stringify(previousRounds), before)
  const m = metrics(players, [...previousRounds, ...added])
  assert.ok(Math.max(...m.counts) - Math.min(...m.counts) <= 1, `${m.counts}`)
  assert.ok(m.maxStreak <= 2); assert.ok(m.maxRest <= 3)
})

const { analyze } = require('../scripts/audit-scheduler.cjs')
test('nine-player controlled doubles are followed by at most two rest rounds', () => {
  const players = roster('HHMMMXLLL')
  for (let seed=1;seed<=100;seed++) {
    const rounds = buildSchedule({ players, roundCount: 15, random: random(seed) })
    const m = analyze(players,rounds)
    assert.ok(m.maxRestAfterDouble<=2, `seed ${seed}: ${m.maxRestAfterDouble}`)
  }
})
test('short, extended and same-level rosters use the same quotas', () => {
  for (let size=4;size<=9;size++) for (const count of [1,2,3,5,10,20]) {
    const players=roster('M'.repeat(size)), rounds=buildSchedule({players,roundCount:count,random:random(size+count)})
    const m=metrics(players,rounds)
    assert.equal(rounds.length,count); assert.ok(Math.max(...m.counts)-Math.min(...m.counts)<=1)
    if(size>=6) assert.ok(m.maxStreak<=2)
  }
})
test('withdrawn players, large IDs and roster order do not change rotation constraints', () => {
  const players=roster('HHMMMXLL').map(p=>({...p,id:1791510444958+p.id*10001})).reverse()
  players.push({id:99,level:'H',status:'withdrawn'})
  const frozen=JSON.stringify(players), rounds=buildSchedule({players,roundCount:15,random:random(19)})
  assert.equal(JSON.stringify(players),frozen)
  assert.ok(rounds.every(r=>!ids(r).includes(99)))
  const m=metrics(players.filter(p=>p.status!=='withdrawn'),rounds)
  assert.ok(Math.max(...m.counts)-Math.min(...m.counts)<=1); assert.ok(m.maxStreak<=2)
})
test('cloud package matches the source scheduler', () => {
  const fs=require('node:fs'),path=require('node:path')
  const source=fs.readFileSync(path.join(__dirname,'../frontend/src/scheduler.js'),'utf8').replaceAll('export function ','function ')
  const packaged=fs.readFileSync(path.join(__dirname,'../cloudfunctions/match/scheduler.cjs'),'utf8')
  assert.equal(packaged,`${source}\nmodule.exports = { buildSchedule, isLegalGroup }\n`)
})

test('late ninth player can catch up within achievable extension quotas', () => {
  for (let seed=1;seed<=8;seed++) {
    const original=roster('MMMMMMMM'), players=roster('MMMMMMMMM')
    const previousRounds=buildSchedule({players:original,roundCount:15,random:random(seed)})
    for (const roundCount of [5,10,15,20]) {
      const added=buildSchedule({players,roundCount,previousRounds,random:random(seed+10)})
      assert.equal(added.length,roundCount)
      const m=analyze(players,added), full=analyze(players,[...previousRounds,...added])
      assert.ok(full.maxStreak<=2, `seed ${seed}, count ${roundCount}: boundary streak`)
      assert.ok(m.maxRest<=3); assert.ok(m.maxRestAfterDouble<=2)
      assert.ok(m.counts[8]>=Math.floor(roundCount*2/3), `newcomer catch-up: ${m.counts}`)
      assert.ok(Math.max(...full.counts.slice(0,8))-Math.min(...full.counts.slice(0,8))<=1)
    }
  }
})
test('seven-player unavoidable doubles are shared across high and middle groups', () => {
  for(const levels of ['HHMMMMM','MMLLLLL']) for(let seed=1;seed<=12;seed++) {
    const players=roster(levels),rounds=buildSchedule({players,roundCount:15,random:random(seed)})
    const m=analyze(players,rounds)
    assert.ok(rounds.every(r=>isLegalGroup(ids(r),players)))
    assert.ok(m.doubleSpread<=2, `${levels}, seed ${seed}: doubles ${m.doubles}`)
    assert.ok(m.maxStreak<=2); assert.ok(m.maxRest<=2)
    assert.equal(m.unbalancedSplits,0)
  }
})

test('eight-player partner rotation precedes choosing zero doubles', () => {
  for (const levels of ['MMMMMMMM','LLLLLLLL','XLLLLLLL']) for(let seed=1;seed<=8;seed++) {
    const players=roster(levels),rounds=buildSchedule({players,roundCount:15,random:random(seed)})
    const m=analyze(players,rounds)
    assert.ok(m.distinctQuartets>=6, `${levels}, seed ${seed}: ${m.distinctQuartets} quartets`)
    assert.ok(m.partnerCoverage.every(count=>count>=4), `${levels}, seed ${seed}: ${m.partnerCoverage}`)
  }
})
