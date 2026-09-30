const assert = require('node:assert/strict')
const test = require('node:test')
const { publicSnapshot, calculateRanking, validateScore } = require('../logic.js')

test('public snapshots hide player levels', () => {
  const snapshot = publicSnapshot({ _id: 'm1', name: '羽毛球友谊赛', players: [{ id: 1, name: '小明', level: 'H', status: 'active' }], rounds: [] }, false)
  assert.deepEqual(snapshot.players, [{ id: 1, name: '小明', status: 'active' }])
})

test('ranking uses net score from completed rounds', () => {
  const ranking = calculateRanking(
    [{ id: 1, name: '甲' }, { id: 2, name: '乙' }, { id: 3, name: '丙' }, { id: 4, name: '丁' }],
    [{ p1: 1, p2: 2, p3: 3, p4: 4, score1: 15, score2: 7, status: 'completed' }]
  )
  assert.equal(ranking[0].id, 1)
  assert.equal(ranking[0].net, 8)
  assert.equal(ranking[2].net, -8)
})

test('scores accept any non-negative integer and reject negatives', () => {
  assert.equal(validateScore(0, 999), true)
  assert.equal(validateScore(-1, 0), false)
  assert.equal(validateScore(1.5, 0), false)
})

test('score corrections replace the result used by rankings', () => {
  const { applyScore } = require('../logic.js')
  const match = { players:[{id:1,name:'甲'},{id:2,name:'乙'},{id:3,name:'丙'},{id:4,name:'丁'}], rounds:[{id:1,p1:1,p2:2,p3:3,p4:4,score1:15,score2:7,status:'completed'}] }
  applyScore(match, 1, 9, 12)
  const ranking = calculateRanking(match.players, match.rounds)
  assert.equal(ranking.find(player => player.id === 1).net, -3)
  assert.equal(ranking.find(player => player.id === 3).net, 3)
})

test('only the creator identity can administer a match', () => {
  const { requireCreator } = require('../logic.js')
  assert.doesNotThrow(() => requireCreator({ creatorOpenId:'creator' }, 'creator'))
  assert.throws(() => requireCreator({ creatorOpenId:'creator' }, 'another-user'), /仅创建者/)
})
