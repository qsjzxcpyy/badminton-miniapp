const fs = require('node:fs')
const { buildSchedule } = require('../cloudfunctions/match/scheduler.cjs')
const { analyze, rng, ids } = require('./audit-scheduler.cjs')
const report = { generatedAt: new Date().toISOString(), cases: 0, joined: 0, withdrawn: 0, failures: [], samples: [] }
function check(players, previousRounds, roundCount, seed, scenario) {
  report.cases++; report[scenario.kind]++
  const before = JSON.stringify(previousRounds)
  try {
    const added = buildSchedule({ players, previousRounds, roundCount, random: rng(seed + 10) })
    const metrics = analyze(players, added)
    let maxBoundaryStreak = 0, maxBoundaryRest = 0, maxBoundaryRestAfterDouble = 0
    for (const player of players) {
      let streak = 0, rest = 0, lastRun = 0
      // A new arrival's clock begins at the appended schedule.
      const hasHistory = previousRounds.some(round => ids(round).includes(player.id))
      for (const round of (hasHistory ? previousRounds : []).concat(added)) {
        if (ids(round).includes(player.id)) { streak++; rest = 0 }
        else { if (streak) lastRun = streak; streak = 0; rest++ }
        maxBoundaryStreak = Math.max(maxBoundaryStreak, streak)
        maxBoundaryRest = Math.max(maxBoundaryRest, rest)
        if (lastRun >= 2) maxBoundaryRestAfterDouble = Math.max(maxBoundaryRestAfterDouble, rest)
      }
    }
    const errors = []
    if (added.length !== roundCount || JSON.stringify(previousRounds) !== before) errors.push('history or length')
    if (maxBoundaryStreak > 2) errors.push('boundary streak')
    // Historical rest from the former, larger roster may exceed the new rest
    // limit. Check new rounds and the unchanged universal boundary cap of 3.
    if (metrics.maxRest > (players.length < 8 ? 2 : 3) || maxBoundaryRest > 3) errors.push('rest')
    if (maxBoundaryRestAfterDouble > 2) errors.push('rest after double')
    if (metrics.unbalancedSplits) errors.push('team strength')
    if (added.some(round => new Set(ids(round)).size !== 4 || ids(round).some(id => !players.some(p => p.id === id)))) errors.push('roster')
    if (errors.length) report.failures.push({ ...scenario, seed, roundCount, errors, metrics })
    if (seed === 1 && [5,20].includes(roundCount)) report.samples.push({ ...scenario, roundCount, metrics, maxBoundaryStreak })
  } catch (error) { report.failures.push({ ...scenario, seed, roundCount, error: error.message }) }
}
for (const levels of ['MMMMMM','HHMMLL','MMMMMMM','HHMMMLL','MMMMMMMM','HHMMMXLL']) {
  for (let seed = 1; seed <= 4; seed++) {
    const original = [...levels].map((level, i) => ({ id: i + 1, level }))
    const previousRounds = buildSchedule({ players: original, roundCount: 15, random: rng(seed) })
    for (const level of ['H','M','X','L']) for (const count of [5,10,15,20]) {
      check(original.concat({ id: original.length + 1, level }), previousRounds, count, seed, { kind:'joined', levels, level })
    }
  }
}
for (const levels of ['MMMMMMM','HHMMMLL','MMMMMMMM','HHMMMXLL','MMMMMMMMM','HHMMMXLLL']) {
  for (let seed = 1; seed <= 4; seed++) {
    const original = [...levels].map((level, i) => ({ id: i + 1, level }))
    const previousRounds = buildSchedule({ players: original, roundCount: 15, random: rng(seed) })
    for (const removed of [0, original.length - 1]) for (const count of [5,10,15,20]) {
      check(original.filter((_, i) => i !== removed), previousRounds, count, seed, { kind:'withdrawn', levels, removed:removed + 1 })
    }
  }
}
fs.writeFileSync('docs/verification/scheduler-history-audit.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ cases:report.cases, joined:report.joined, withdrawn:report.withdrawn, failures:report.failures.length }))
if (report.failures.length) process.exitCode = 1
