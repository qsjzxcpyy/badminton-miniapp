const assert = require('node:assert/strict')
const test = require('node:test')
const { buildSchedule, isLegalGroup } = require('../scheduler.cjs')

test('cloud scheduler produces legal rounds for eight players', () => {
  const players = [
    { id: 1, level: 'H' }, { id: 2, level: 'H' },
    { id: 3, level: 'M' }, { id: 4, level: 'M' }, { id: 5, level: 'M' },
    { id: 6, level: 'X' }, { id: 7, level: 'L' }, { id: 8, level: 'L' }
  ]
  const rounds = buildSchedule({ players, roundCount: 10, random: () => 0.42 })
  assert.equal(rounds.length, 10)
  rounds.forEach(round => assert.equal(isLegalGroup([round.p1, round.p2, round.p3, round.p4], players), true))
})
