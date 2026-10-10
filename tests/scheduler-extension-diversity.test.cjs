const assert = require('node:assert/strict')
const test = require('node:test')
const { buildSchedule } = require('../cloudfunctions/match/scheduler.cjs')
const { analyze, rng, ids } = require('../scripts/audit-scheduler.cjs')

// Fixed deployed schedules reproduce history locking; measure real teams,
// ignoring left/right presentation.
const fixtures = require('./fixtures/extension-history.cjs')

const pairKey = team => [...team].sort((a,b) => a-b).join(',')
const fixtureKey = round => [pairKey(ids(round).slice(0,2)), pairKey(ids(round).slice(2))].sort().join('|')
for (const { levels, history } of fixtures) {
  test('five-round extension changes real groups and partners across seeds: ' + levels, () => {
    const players = [...levels].map((level,i) => ({ id: i+1, level }))
    const previousRounds = history.map(([p1,p2,p3,p4],i) => ({ p1,p2,p3,p4,id:i+1,seq:i+1,status:i===0?'completed':'pending',score1:i===0?21:null,score2:i===0?18:null }))
    const before = JSON.stringify(previousRounds)
    const plans = new Set(), groupPlans = new Set()
    for (let seed=1; seed<=24; seed++) {
      const added = buildSchedule({ players, roundCount:5, previousRounds, random:rng(seed) })
      assert.equal(added.length,5)
      assert.equal(JSON.stringify(previousRounds),before)
      const metrics = analyze(players,[...previousRounds,...added])
      assert.ok(metrics.spread<=1, 'cumulative quotas')
      assert.ok(metrics.maxStreak<=2, 'history boundary streak')
      assert.ok(metrics.maxRest<=(players.length<8?2:3), 'waiting limit')
      assert.ok(metrics.maxRestAfterDouble<=2, 'rest after double')
      assert.equal(metrics.unbalancedSplits,0)
      assert.ok(analyze(players,added).fallbackRounds<=(players.length===8?1:0), 'level fallback')
      plans.add(added.map(fixtureKey).join(';'))
      groupPlans.add(added.map(r=>pairKey(ids(r))).join(';'))
    }
    assert.ok(plans.size>=6, 'real team plans: '+plans.size)
    assert.ok(groupPlans.size>=3, 'group plans: '+groupPlans.size)
    assert.deepEqual(buildSchedule({ players,roundCount:5,previousRounds,random:rng(8) }),buildSchedule({ players,roundCount:5,previousRounds,random:rng(8) }))
  })
}

test('repeated five-round extensions preserve history and cumulative fairness for six to nine players', () => {
  for (const levels of ['MMMMMM','HHMMLL','HHMMMMM','HHMMMXLL','HHMMMXLLL']) {
    const players = [...levels].map((level,i) => ({ id:i+1,level }))
    for (let seed=1;seed<=4;seed++) {
      let history = buildSchedule({players,roundCount:15,random:rng(seed)})
      for (let batch=0;batch<3;batch++) {
        const before=JSON.stringify(history)
        const added=buildSchedule({players,previousRounds:history,roundCount:5,random:rng(seed+batch+31)})
        assert.equal(JSON.stringify(history),before)
        assert.equal(added.length,5)
        history=history.concat(added)
        const metrics=analyze(players,history)
        assert.ok(metrics.spread<=1)
        assert.ok(metrics.maxStreak<=2)
        assert.ok(metrics.maxRest<=(players.length<8?2:3))
        assert.ok(metrics.maxRestAfterDouble<=2)
        assert.equal(metrics.unbalancedSplits,0)
      }
    }
  }
})
