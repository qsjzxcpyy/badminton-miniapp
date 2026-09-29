const LEVEL_WEIGHT = { H: 3, M: 2, X: 1.5, L: 1 }

function combinations(items, size) {
  const output = []
  const walk = (start, chosen) => {
    if (chosen.length === size) {
      output.push([...chosen])
      return
    }
    for (let index = start; index <= items.length - (size - chosen.length); index += 1) {
      chosen.push(items[index])
      walk(index + 1, chosen)
      chosen.pop()
    }
  }
  walk(0, [])
  return output
}

function shuffle(items, random) {
  const output = [...items]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

function pairKey(left, right) {
  return [left, right].sort((a, b) => a - b).join(':')
}

function quartetKey(ids) {
  return [...ids].sort((a, b) => a - b).join(',')
}

function addPair(history, left, right) {
  const key = pairKey(left, right)
  history[key] = (history[key] || 0) + 1
}

function pairRepeat(history, left, right) {
  return history[pairKey(left, right)] || 0
}

function recordRoundHistory(state, ids, arranged) {
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      addPair(state.groupPairs, ids[left], ids[right])
    }
  }
  addPair(state.teamPairs, arranged[0], arranged[1])
  addPair(state.teamPairs, arranged[2], arranged[3])
  for (const left of arranged.slice(0, 2)) {
    for (const right of arranged.slice(2, 4)) addPair(state.opponentPairs, left, right)
  }
  const key = quartetKey(ids)
  state.quartets[key] = (state.quartets[key] || 0) + 1
  state.maxQuartetCount = Math.max(state.maxQuartetCount, state.quartets[key])
}

export function isLegalGroup(ids, players) {
  if (ids.length !== 4 || new Set(ids).size !== 4) return false
  const levelFor = id => players.find(player => player.id === id)?.level
  const levels = ids.map(levelFor)
  if (levels.some(level => !level)) return false
  if (levels.includes('H') && (levels.includes('X') || levels.includes('L'))) return false
  const high = levels.filter(level => level === 'H').length
  const middle = levels.filter(level => level === 'M').length
  return !(high === 1 && middle === 3)
}

function isHighLowFallback(ids, players) {
  const levels = ids.map(id => players.find(player => player.id === id)?.level)
  return levels.filter(level => level === 'H').length === 1
    && levels.filter(level => level === 'M').length === 2
    && levels.filter(level => level === 'L').length === 1
}

function compareNumbers(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function levelBalance(split, levelFor) {
  const left = split.slice(0, 2).reduce((sum, id) => sum + LEVEL_WEIGHT[levelFor(id)], 0)
  const right = split.slice(2).reduce((sum, id) => sum + LEVEL_WEIGHT[levelFor(id)], 0)
  return Math.abs(left - right)
}

function arrangeTeams(ids, levelFor, state, random) {
  const splits = [
    [ids[0], ids[1], ids[2], ids[3]],
    [ids[0], ids[2], ids[1], ids[3]],
    [ids[0], ids[3], ids[1], ids[2]]
  ]
  const scored = splits.map(split => ({
    split,
    cost: [
      levelBalance(split, levelFor),
      pairRepeat(state.teamPairs, split[0], split[1]) + pairRepeat(state.teamPairs, split[2], split[3]),
      split.slice(0, 2).reduce((sum, left) => sum + split.slice(2, 4).reduce((inner, right) => inner + pairRepeat(state.opponentPairs, left, right), 0), 0),
      random()
    ]
  }))
  scored.sort((left, right) => compareNumbers(left.cost, right.cost))
  return scored[0].split
}

function stateCost(state, playerIds, levelFor) {
  const values = playerIds.map(id => state.counts[id])
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
  const highIds = playerIds.filter(id => levelFor(id) === 'H')
  const middleIds = playerIds.filter(id => levelFor(id) === 'M')
  const highPartnerCoverage = highIds.length && middleIds.length
    ? highIds.map(highId => middleIds.filter(middleId => pairRepeat(state.groupPairs, highId, middleId) > 0))
    : []
  const minimumHighPartnerCoverage = highPartnerCoverage.length ? Math.min(...highPartnerCoverage.map(partners => partners.length)) : 0
  const totalHighPartnerCoverage = highPartnerCoverage.reduce((sum, partners) => sum + partners.length, 0)
  return [
    Math.max(...values) - Math.min(...values),
    state.maxConsecutive,
    state.consecutive,
    variance,
    -minimumHighPartnerCoverage,
    -totalHighPartnerCoverage,
    state.highMiddleRepeatScore,
    state.maxQuartetCount,
    state.groupRepeatScore,
    state.teamRepeatScore,
    state.opponentRepeatScore,
    state.tieBreaker
  ]
}

function isHighPairTransition(candidate, previous, levelFor, totalHigh) {
  if (!previous || totalHigh !== 2) return true
  const previousHigh = previous.filter(id => levelFor(id) === 'H').length
  if (previousHigh !== 2) return true
  const currentHigh = candidate.filter(id => levelFor(id) === 'H').length
  return currentHigh === 0 || currentHigh === 2
}

function cloneState(state) {
  return {
    ...state,
    counts: { ...state.counts },
    lastPlayed: { ...state.lastPlayed },
    groupPairs: { ...state.groupPairs },
    teamPairs: { ...state.teamPairs },
    opponentPairs: { ...state.opponentPairs },
    quartets: { ...state.quartets },
    rounds: [...state.rounds]
  }
}


function structuredCoverage(ids, partnerIds, groupPairs) {
  return ids.map(id => new Set(partnerIds.filter(partnerId => pairRepeat(groupPairs, id, partnerId) > 0)))
}

function structuredStateCost(state, playerIds, highIds, middleIds, lowIds) {
  const values = playerIds.map(id => state.counts[id])
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
  const highCoverage = structuredCoverage(highIds, middleIds, state.groupPairs)
  const lowCoverage = structuredCoverage(lowIds, middleIds, state.groupPairs)
  const missingHighCoverage = highCoverage.reduce((sum, partners) => sum + Math.max(0, middleIds.length - partners.size), 0)
  const missingLowCoverage = lowCoverage.reduce((sum, partners) => sum + Math.max(0, middleIds.length - partners.size), 0)
  return [
    Math.max(...values) - Math.min(...values),
    variance,
    missingHighCoverage,
    missingLowCoverage,
    state.maxQuartetCount,
    state.groupRepeatScore,
    state.highMiddleRepeatScore,
    state.lowMiddleRepeatScore || 0,
    state.teamRepeatScore,
    state.opponentRepeatScore,
    state.maxConsecutive,
    state.consecutive,
    state.tieBreaker
  ]
}

function rolePattern(roundCount, random) {
  const highCount = random() < 0.5 ? Math.floor(roundCount / 2) : Math.ceil(roundCount / 2)
  const startHigh = highCount > roundCount / 2
  return Array.from({ length: roundCount }, (_, index) => {
    const alternatingHigh = (index + (startHigh ? 0 : 1)) % 2 === 0
    return alternatingHigh && index < highCount * 2 ? 'high' : 'mixed'
  })
}

function buildStructuredHighRotation(players, roundCount, random) {
  const highIds = players.filter(player => player.level === 'H').map(player => player.id)
  const middleIds = players.filter(player => player.level === 'M').map(player => player.id)
  const lowIds = players.filter(player => player.level === 'L').map(player => player.id)
  const nextMiddleIds = players.filter(player => player.level === 'X').map(player => player.id)
  const isSupportedShape = highIds.length === 2
    && (middleIds.length === 3 && nextMiddleIds.length === 1 && lowIds.length === 2
      || middleIds.length === 4 && nextMiddleIds.length === 0 && lowIds.length === 2)
  if (!isSupportedShape || roundCount <= 0) return null

  const playerIds = players.map(player => player.id)
  const levelFor = id => players.find(player => player.id === id)?.level
  const highCandidates = combinations(middleIds, 2).map(pair => [highIds[0], pair[0], highIds[1], pair[1]])
  const nonHighIds = playerIds.filter(id => levelFor(id) !== 'H')
  const mixedCandidates = combinations(nonHighIds, 4).filter(ids => isLegalGroup(ids, players))
  if (!highCandidates.length || !mixedCandidates.length) return null

  const initial = {
    counts: Object.fromEntries(playerIds.map(id => [id, 0])),
    lastPlayed: Object.fromEntries(playerIds.map(id => [id, -1000])),
    previous: null,
    rounds: [],
    consecutive: 0,
    maxConsecutive: 0,
    groupPairs: {},
    teamPairs: {},
    opponentPairs: {},
    quartets: {},
    maxQuartetCount: 0,
    groupRepeatScore: 0,
    highMiddleRepeatScore: 0,
    lowMiddleRepeatScore: 0,
    teamRepeatScore: 0,
    opponentRepeatScore: 0,
    tieBreaker: random()
  }
  const pattern = rolePattern(roundCount, random)
  let beam = [initial]
  const beamWidth = 500

  for (let step = 0; step < roundCount; step += 1) {
    const expanded = []
    const candidates = shuffle(pattern[step] === 'high' ? highCandidates : mixedCandidates, random)
    beam.forEach(state => {
      candidates.forEach(candidate => {
        const next = cloneState(state)
        const overlap = next.previous ? candidate.filter(id => next.previous.includes(id)).length : 0
        const arranged = arrangeTeams(candidate, levelFor, next, random)
        const groupRepeat = candidate.reduce((sum, id, index) => sum + candidate.slice(index + 1).reduce((inner, other) => inner + pairRepeat(next.groupPairs, id, other), 0), 0)
        const highMiddleRepeat = candidate.reduce((sum, id, index) => sum + candidate.slice(index + 1).reduce((inner, other) => {
          const levels = [levelFor(id), levelFor(other)]
          return inner + (levels.includes('H') && levels.includes('M') ? pairRepeat(next.groupPairs, id, other) : 0)
        }, 0), 0)
        const lowMiddleRepeat = candidate.reduce((sum, id, index) => sum + candidate.slice(index + 1).reduce((inner, other) => {
          const levels = [levelFor(id), levelFor(other)]
          return inner + (levels.includes('L') && levels.includes('M') ? pairRepeat(next.groupPairs, id, other) : 0)
        }, 0), 0)
        const teamRepeat = pairRepeat(next.teamPairs, arranged[0], arranged[1]) + pairRepeat(next.teamPairs, arranged[2], arranged[3])
        const opponentRepeat = arranged.slice(0, 2).reduce((sum, left) => sum + arranged.slice(2, 4).reduce((inner, right) => inner + pairRepeat(next.opponentPairs, left, right), 0), 0)
        candidate.forEach(id => {
          next.counts[id] += 1
          next.lastPlayed[id] = step
        })
        next.consecutive += overlap
        next.maxConsecutive = Math.max(next.maxConsecutive, overlap)
        next.groupRepeatScore += groupRepeat
        next.highMiddleRepeatScore += highMiddleRepeat
        next.lowMiddleRepeatScore += lowMiddleRepeat
        next.teamRepeatScore += teamRepeat
        next.opponentRepeatScore += opponentRepeat
        recordRoundHistory(next, candidate, arranged)
        next.previous = candidate
        next.rounds.push({ p1: arranged[0], p2: arranged[1], p3: arranged[2], p4: arranged[3] })
        next.tieBreaker = random()
        expanded.push(next)
      })
    })
    expanded.sort((left, right) => compareNumbers(
      structuredStateCost(left, playerIds, highIds, middleIds, lowIds),
      structuredStateCost(right, playerIds, highIds, middleIds, lowIds)
    ))
    beam = expanded.slice(0, beamWidth)
  }

  const targetCoverage = middleIds.length
  const valid = beam.filter(state => {
    const spread = Math.max(...playerIds.map(id => state.counts[id])) - Math.min(...playerIds.map(id => state.counts[id]))
    const highCoverage = structuredCoverage(highIds, middleIds, state.groupPairs)
    const lowCoverage = structuredCoverage(lowIds, middleIds, state.groupPairs)
    return spread <= 1
      && highCoverage.every(partners => partners.size >= targetCoverage)
      && lowCoverage.every(partners => partners.size >= targetCoverage)
  })
  const selected = (valid.length ? valid : beam).sort((left, right) => compareNumbers(
    structuredStateCost(left, playerIds, highIds, middleIds, lowIds),
    structuredStateCost(right, playerIds, highIds, middleIds, lowIds)
  ))[0]
  return selected?.rounds || []
}
function balancedMiddlePairs(ids, count, random) {
  if (count <= 0) return []
  const order = shuffle(ids, random)
  const cycle = [
    [order[0], order[1]],
    [order[2], order[3]],
    [order[0], order[2]],
    [order[1], order[3]],
    [order[0], order[3]],
    [order[1], order[2]]
  ]
  const offset = Math.floor(random() * cycle.length)
  return Array.from({ length: count }, (_, index) => cycle[(offset + index) % cycle.length])
}

function repairTwoHighFourMiddleTwoLow(rounds, players, previousRounds, random) {
  const highIds = players.filter(player => player.level === 'H').map(player => player.id)
  const middleIds = players.filter(player => player.level === 'M').map(player => player.id)
  const lowIds = players.filter(player => player.level === 'L').map(player => player.id)
  if (highIds.length !== 2 || middleIds.length !== 4 || lowIds.length !== 2 || previousRounds.length) return null

  const highTurn = random() >= 0.5
  const highRoundCount = highTurn ? Math.ceil(rounds.length / 2) : Math.floor(rounds.length / 2)
  const mixedRoundCount = rounds.length - highRoundCount
  const highMiddlePairs = balancedMiddlePairs(middleIds, highRoundCount, random)
  const mixedMiddlePairs = balancedMiddlePairs(middleIds, mixedRoundCount, random)
  const lowOrder = shuffle(lowIds, random)
  let highIndex = 0
  let mixedIndex = 0

  rounds.forEach((round, index) => {
    const playHigh = highTurn ? index % 2 === 0 : index % 2 === 1
    if (playHigh) {
      const pair = highMiddlePairs[highIndex]
      ;[round.p1, round.p2, round.p3, round.p4] = [highIds[0], pair[0], highIds[1], pair[1]]
      highIndex += 1
    } else {
      const pair = mixedMiddlePairs[mixedIndex]
      ;[round.p1, round.p2, round.p3, round.p4] = [pair[0], lowOrder[0], pair[1], lowOrder[1]]
      mixedIndex += 1
    }
  })
  return rounds
}
function repairHighPartnerFreshness(rounds, players, previousRounds, random) {
  return repairTwoHighFourMiddleTwoLow(rounds, players, previousRounds, random) || rounds
}
function buildScheduleAttempt({ players, roundCount, random = Math.random, previousRounds = [] }) {
  const playerIds = players.map(player => player.id)
  if (playerIds.length < 4 || roundCount <= 0) return []
  const levelFor = id => players.find(player => player.id === id)?.level
  const totalHigh = players.filter(player => player.level === 'H').length
  const allGroups = combinations(playerIds, 4)
  const legalCandidates = allGroups.filter(ids => isLegalGroup(ids, players))
  const hasNormalHighCandidate = legalCandidates.some(ids => ids.some(id => levelFor(id) === 'H'))
  const fallbackCandidates = allGroups.filter(ids => isHighLowFallback(ids, players))
  const candidates = shuffle(hasNormalHighCandidate ? legalCandidates : legalCandidates.concat(fallbackCandidates), random)
  if (!candidates.length) return []

  const initial = {
    counts: Object.fromEntries(playerIds.map(id => [id, 0])),
    lastPlayed: Object.fromEntries(playerIds.map(id => [id, -1000])),
    previous: null,
    rounds: [],
    consecutive: 0,
    maxConsecutive: 0,
    groupPairs: {},
    teamPairs: {},
    opponentPairs: {},
    quartets: {},
    maxQuartetCount: 0,
    groupRepeatScore: 0,
    highMiddleRepeatScore: 0,
    teamRepeatScore: 0,
    opponentRepeatScore: 0,
    tieBreaker: random()
  }

  previousRounds.forEach((round, index) => {
    const ids = [round.p1, round.p2, round.p3, round.p4].filter(id => initial.counts[id] !== undefined)
    if (ids.length !== 4) return
    ids.forEach(id => {
      initial.counts[id] += 1
      initial.lastPlayed[id] = index
    })
    const arranged = [round.p1, round.p2, round.p3, round.p4]
    recordRoundHistory(initial, ids, arranged)
    initial.previous = ids
  })

  let beam = [initial]
  const beamWidth = 500
  for (let step = 0; step < roundCount; step += 1) {
    const roundIndex = previousRounds.length + step
    const expanded = []
    beam.forEach(state => {
      const legal = candidates.filter(candidate => isHighPairTransition(candidate, state.previous, levelFor, totalHigh))
      const pool = legal.length ? legal : candidates
      const minimumOverlap = state.previous
        ? Math.min(...pool.map(candidate => candidate.filter(id => state.previous.includes(id)).length))
        : 0
      const rotationPool = pool.filter(candidate => !state.previous || candidate.filter(id => state.previous.includes(id)).length === minimumOverlap)
      const candidatePool = rotationPool
      candidatePool.forEach(candidate => {
        const next = cloneState(state)
        const overlap = next.previous ? candidate.filter(id => next.previous.includes(id)).length : 0
        const arranged = arrangeTeams(candidate, levelFor, next, random)
        const groupRepeat = candidate.reduce((sum, id, index) => sum + candidate.slice(index + 1).reduce((inner, other) => inner + pairRepeat(next.groupPairs, id, other), 0), 0)
        const highMiddleRepeat = candidate.reduce((sum, id, index) => sum + candidate.slice(index + 1).reduce((inner, other) => {
          const levels = [levelFor(id), levelFor(other)]
          return inner + (levels.includes('H') && levels.includes('M') ? pairRepeat(next.groupPairs, id, other) : 0)
        }, 0), 0)
        const teamRepeat = pairRepeat(next.teamPairs, arranged[0], arranged[1]) + pairRepeat(next.teamPairs, arranged[2], arranged[3])
        const opponentRepeat = arranged.slice(0, 2).reduce((sum, left) => sum + arranged.slice(2, 4).reduce((inner, right) => inner + pairRepeat(next.opponentPairs, left, right), 0), 0)
        candidate.forEach(id => {
          next.counts[id] += 1
          next.lastPlayed[id] = roundIndex
        })
        next.consecutive += overlap
        next.maxConsecutive = Math.max(next.maxConsecutive, overlap)
        next.groupRepeatScore += groupRepeat
        next.highMiddleRepeatScore += highMiddleRepeat
        next.teamRepeatScore += teamRepeat
        next.opponentRepeatScore += opponentRepeat
        recordRoundHistory(next, candidate, arranged)
        next.previous = candidate
        next.rounds.push({ p1: arranged[0], p2: arranged[1], p3: arranged[2], p4: arranged[3] })
        next.tieBreaker = random()
        expanded.push(next)
      })
    })
    expanded.sort((left, right) => compareNumbers(stateCost(left, playerIds, levelFor), stateCost(right, playerIds, levelFor)))
    beam = expanded.slice(0, beamWidth)
  }

  beam.sort((left, right) => compareNumbers(stateCost(left, playerIds, levelFor), stateCost(right, playerIds, levelFor)))
  return repairHighPartnerFreshness(beam[0]?.rounds || [], players, previousRounds, random)
}

function scheduleSpread(rounds, previousRounds, playerIds) {
  const counts = Object.fromEntries(playerIds.map(id => [id, 0]))
  previousRounds.concat(rounds).forEach(round => {
    ;[round.p1, round.p2, round.p3, round.p4].forEach(id => {
      if (counts[id] !== undefined) counts[id] += 1
    })
  })
  const values = Object.values(counts)
  return values.length ? Math.max(...values) - Math.min(...values) : Infinity
}

export function buildSchedule({ players, roundCount, random = Math.random, previousRounds = [] }) {
  if (!previousRounds.length) {
    const structured = buildStructuredHighRotation(players, roundCount, random)
    if (structured?.length === roundCount) return structured
  }
  const playerIds = players.map(player => player.id)
  const eligibleIds = [...new Set(combinations(playerIds, 4).filter(ids => isLegalGroup(ids, players)).flat())]
  if (eligibleIds.length < playerIds.length) {
    return buildScheduleAttempt({ players, roundCount, random, previousRounds })
  }
  let best = []
  let bestSpread = Infinity
  const attempts = previousRounds.length ? 1 : 4
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rounds = buildScheduleAttempt({ players, roundCount, random, previousRounds })
    const spread = scheduleSpread(rounds, previousRounds, eligibleIds)
    if (spread < bestSpread) {
      best = rounds
      bestSpread = spread
    }
    if (spread <= 1) return rounds
  }
  return best
}