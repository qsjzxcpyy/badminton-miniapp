const assert = require('node:assert/strict')
const test = require('node:test')
const { decorateMatch, filterRounds } = require('../miniprogram/pages/index/view-model.js')

const players = [
  { id: 1, name: '齐诗郡', level: 'H', status: 'active' },
  { id: 2, name: '陆娆', level: 'M', status: 'active' },
  { id: 3, name: '陈谭玲', level: 'M', status: 'active' },
  { id: 4, name: '庞旖旎', level: 'X', status: 'withdrawn' }
]

test('court and schedule use compact team names and preserve score edits', () => {
  const state = decorateMatch({ id: 'one', players, rounds: [{ id: 1, seq: 1, p1: 1, p2: 2, p3: 3, p4: 4, score1: 15, score2: 7, status: 'completed' }, { id: 2, seq: 2, p1: 2, p2: 3, p3: 1, p4: 4, score1: null, score2: null, status: 'active' }], ranking: [] })
  assert.equal(state.rounds[0].team1, '齐诗郡 / 陆娆')
  assert.equal(state.rounds[0].score1Label, '15')
  assert.equal(state.rounds[1].score1Label, '—')
  assert.equal(state.currentRound.seq, 2)
  assert.equal(state.completedCount, 1)
  assert.equal(filterRounds(state.rounds, 'completed').length, 1)
  assert.equal(state.adminPlayers.length, 3)
})

test('ranking rows prepare numbers and avatars without calling functions in WXML', () => {
  const state = decorateMatch({ id: 'one', players, rounds: [], ranking: [{ id: 1, name: '齐诗郡', net: 8, wins: 1, games: 1 }, { id: 2, name: '陆娆', net: -8, wins: 0, games: 1 }] })
  assert.equal(state.rankingRows[0].netLabel, '+8')
  assert.equal(state.rankingRows[1].netLabel, '-8')
  assert.equal(state.rankingRows[0].initial, '齐')
})
