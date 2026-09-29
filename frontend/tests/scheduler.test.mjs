import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSchedule, isLegalGroup } from '../src/scheduler.js'

const playerSets = [
  [
    { id: 1, level: 'H' }, { id: 2, level: 'H' },
    { id: 3, level: 'M' }, { id: 4, level: 'M' }, { id: 5, level: 'M' }, { id: 6, level: 'M' },
    { id: 7, level: 'L' }, { id: 8, level: 'L' }
  ],
  [
    { id: 1, level: 'H' }, { id: 2, level: 'H' },
    { id: 3, level: 'M' }, { id: 4, level: 'M' }, { id: 5, level: 'M' },
    { id: 6, level: 'L' }, { id: 7, level: 'L' }, { id: 8, level: 'L' }
  ]
]

const seededRandom = (seed) => {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

const idsOf = round => [round.p1, round.p2, round.p3, round.p4]

for (const [index, players] of playerSets.entries()) {
  test(`balances 2-high ${players.filter(p => p.level === 'M').length}-middle ${players.filter(p => p.level === 'L').length}-low rotation`, () => {
    const rounds = buildSchedule({ players, roundCount: 15, random: seededRandom(index + 7) })
    const counts = Object.fromEntries(players.map(player => [player.id, 0]))

    rounds.forEach((round, roundIndex) => {
      const ids = idsOf(round)
      assert.equal(new Set(ids).size, 4)
      assert.equal(isLegalGroup(ids, players), true)
      ids.forEach(id => { counts[id] += 1 })
      const highCount = ids.filter(id => players.find(player => player.id === id).level === 'H').length
      assert.ok(highCount === 0 || highCount === 2)
      if (roundIndex > 0) {
        const previous = idsOf(rounds[roundIndex - 1])
        assert.equal(ids.some(id => previous.includes(id)), false)
      }
    })

    const values = Object.values(counts)
    assert.ok(Math.max(...values) - Math.min(...values) <= 1)
  })
}

test('uses randomness to break equally fair candidate choices', () => {
  const first = buildSchedule({ players: playerSets[0], roundCount: 15, random: seededRandom(1) })
  const second = buildSchedule({ players: playerSets[0], roundCount: 15, random: seededRandom(2) })
  assert.notDeepEqual(first.map(idsOf), second.map(idsOf))
})