// One scheduler for the web preview and the packaged WeChat cloud function.
const LEVEL_WEIGHT = { H: 3, M: 2, X: 1.5, L: 1 }

function combinations(items, size) {
  const result = []
  function visit(start, chosen) {
    if (chosen.length === size) { result.push([...chosen]); return }
    for (let i = start; i <= items.length - size + chosen.length; i++) {
      chosen.push(items[i]); visit(i + 1, chosen); chosen.pop()
    }
  }
  visit(0, [])
  return result
}

export function isLegalGroup(ids, players) {
  if (ids.length !== 4 || new Set(ids).size !== 4) return false
  const levels = ids.map(id => players.find(p => p.id === id)?.level)
  if (levels.some(level => LEVEL_WEIGHT[level] === undefined)) return false
  if (levels.includes('H') && (levels.includes('X') || levels.includes('L'))) return false
  if (levels.filter(l => l === 'H').length === 1 && levels.filter(l => l === 'M').length === 3) return false
  return !(levels.filter(l => l === 'M').length === 1 && levels.filter(l => l === 'L').length === 3)
}

// Compute achievable participation under the same rest/streak rules as search.
// A late joiner's historical deficit cannot be recovered in a short extension.
function participationBounds(rounds, streak, rest, lastRun, limit, restLimit, memo) {
  if (!rounds) return [0, 0]
  const key = [rounds, streak, rest, lastRun].join(',')
  if (memo.has(key)) return memo.get(key)
  let minimum = Infinity, maximum = -Infinity
  for (const playing of [false, true]) {
    const nextStreak = playing ? streak + 1 : 0
    const nextRest = playing ? 0 : rest + 1
    const nextRun = playing ? lastRun : streak || lastRun
    if (nextStreak > limit || nextRest > restLimit || (nextRest >= 3 && nextRun >= 2)) continue
    const [low, high] = participationBounds(rounds - 1, nextStreak, nextRest, nextRun, limit, restLimit, memo)
    minimum = Math.min(minimum, Number(playing) + low)
    maximum = Math.max(maximum, Number(playing) + high)
  }
  const result = [minimum, maximum]
  memo.set(key, result)
  return result
}

function quotaBounds(counts, rounds, participation) {
  const total = counts.reduce((sum, count) => sum + count, 0) + rounds * 4
  const minimum = counts.map((count, i) => count + participation[i][0])
  const maximum = counts.map((count, i) => count + participation[i][1])
  if (minimum.reduce((s,c) => s+c,0) > total || maximum.reduce((s,c) => s+c,0) < total) return null
  const atFloor = floor => counts.map((_, i) => Math.min(maximum[i], Math.max(minimum[i], floor)))
  let floor = Math.min(...counts)
  while (floor < Math.max(...maximum) && atFloor(floor + 1).reduce((s,c) => s+c,0) <= total) floor++
  const lower = atFloor(floor)
  const extra = total - lower.reduce((sum, count) => sum + count, 0)
  // Leave the extra slots flexible: assigning them to specific IDs can make
  // an otherwise feasible level rotation impossible (e.g. two highs together).
  const upper = atFloor(floor + Number(extra > 0))
  return { lower, upper }
}

function compare(left, right) {
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i]
  return 0
}

export function buildSchedule({ players, roundCount, random = Math.random, previousRounds = [] }) {
  players = players.filter(p => p.status !== 'withdrawn')
  const n = players.length
  if (n < 4 || !Number.isInteger(roundCount) || roundCount <= 0) return []
  if (new Set(players.map(p => p.id)).size !== n || players.some(p => LEVEL_WEIGHT[p.level] === undefined)) {
    throw new Error('球员 ID 必须唯一，等级必须为高、中、次中或低')
  }
  const indexFor = new Map(players.map((p, i) => [p.id, i]))
  const indices = players.map((_, i) => i)
  const limit = n >= 6 ? 2 : n === 5 ? 4 : Infinity
  const restLimit = n >= 8 ? 3 : 2
  const matrixSize = n * n
  const pairIndex = (a, b) => Math.min(a, b) * n + Math.max(a, b)
  const groups = combinations(indices, 4).map((ids, index) => {
    const splits = [[ids[0],ids[1],ids[2],ids[3]], [ids[0],ids[2],ids[1],ids[3]], [ids[0],ids[3],ids[1],ids[2]]]
    const balance = split => Math.abs(LEVEL_WEIGHT[players[split[0]].level] + LEVEL_WEIGHT[players[split[1]].level]
      - LEVEL_WEIGHT[players[split[2]].level] - LEVEL_WEIGHT[players[split[3]].level])
    const gap = Math.min(...splits.map(balance))
    return { ids, index, set: new Set(ids), legal: isLegalGroup(ids.map(i => players[i].id), players), gap,
      splits: splits.filter(split => balance(split) === gap),
      pairs: combinations(ids, 2).map(([a,b]) => pairIndex(a,b)) }
  })
  const groupForKey = new Map(groups.map(g => [g.ids.join(','), g.index]))
  const initial = {
    counts: Array(n).fill(0), streaks: Array(n).fill(0), rests: Array(n).fill(0), lastRuns: Array(n).fill(0), doubles: Array(n).fill(0),
    partners: Array(matrixSize).fill(0), opponents: Array(matrixSize).fill(0), coPlayers: Array(matrixSize).fill(0),
    quartets: Array(groups.length).fill(0), fixtures: new Map(), previous: new Set(), rounds: []
  }
  const fixtureKey = split => [split.slice(0,2).sort((a,b) => a-b).join(','), split.slice(2).sort((a,b) => a-b).join(',')].sort().join('|')
  function record(state, split, group, delta) {
    if (group) { state.quartets[group.index] += delta; for (const pair of group.pairs) state.coPlayers[pair] += delta }
    for (const [a,b] of [[split[0],split[1]], [split[2],split[3]]]) {
      if (a !== undefined && b !== undefined) state.partners[pairIndex(a,b)] += delta
    }
    for (const a of split.slice(0,2)) for (const b of split.slice(2)) {
      if (a !== undefined && b !== undefined) state.opponents[pairIndex(a,b)] += delta
    }
    const key = fixtureKey(split.filter(i => i !== undefined))
    state.fixtures.set(key, (state.fixtures.get(key) || 0) + delta)
  }
  for (const round of previousRounds) {
    const split = [round.p1,round.p2,round.p3,round.p4].map(id => indexFor.get(id))
    const selected = new Set(split.filter(i => i !== undefined))
    for (const i of indices) {
      if (selected.has(i)) { initial.counts[i]++; if (initial.streaks[i]) initial.doubles[i]++; initial.streaks[i]++; initial.rests[i] = 0 }
      else { if (initial.streaks[i]) initial.lastRuns[i] = initial.streaks[i]; initial.streaks[i] = 0; initial.rests[i]++ }
    }
    const group = groups[groupForKey.get([...selected].sort((a,b) => a-b).join(','))]
    record(initial, split, group, 1)
    initial.previous = selected
  }
  // Players absent from every historical round have just joined; their waiting
  // clock starts now, while their zero game count still receives catch-up priority.
  for (const i of indices) if (!initial.counts[i]) initial.rests[i] = 0
  const participationMemo = new Map()
  const participation = indices.map(i => participationBounds(roundCount, initial.streaks[i], initial.rests[i],
    initial.lastRuns[i], limit, restLimit, participationMemo))
  const quotas = quotaBounds(initial.counts, roundCount, participation)
  if (!quotas) throw new Error('当前历史赛程无法同时满足局数与休息约束，请增加场次或重新生成未打赛程')
  const { lower, upper } = quotas
  const initialTotal = initial.counts.reduce((sum, count) => sum + count, 0)
  const preferred = groups.filter(g => g.legal)

  // Necessary subset capacity bounds reject impossible strict-level quotas
  // before search, rather than silently starving players of a rare level.
  function capacityBounds(pool) {
    const bounds = []
    // Exhaustive subset pruning is only needed for the supported small rosters.
    if (n > 12) return bounds
    for (let mask = 1; mask < 2 ** n; mask++) {
      const subset = indices.filter(i => mask & (2 ** i))
      const max = Math.max(0, ...pool.map(g => g.ids.filter(i => mask & (2 ** i)).length))
      const demand = subset.reduce((sum, i) => sum + Math.max(0, lower[i] - initial.counts[i]), 0)
      if (demand > max * roundCount) return null
      if (max < Math.min(4, subset.length) && demand >= max * roundCount * 0.8) bounds.push({ subset, max })
    }
    return bounds
  }

  function teamChoice(group, state) {
    let chosen, best = Infinity
    for (const split of group.splits) {
      const partnerCounts = [state.partners[pairIndex(split[0],split[1])], state.partners[pairIndex(split[2],split[3])]]
      let highMiddle = 0
      for (const [a,b] of [[split[0],split[1]], [split[2],split[3]]]) {
        if ([players[a].level, players[b].level].sort().join('') === 'HM') highMiddle += state.partners[pairIndex(a,b)] === 0 ? -8 : state.partners[pairIndex(a,b)]
      }
      const opponents = split.slice(0,2).reduce((sum,a) => sum + split.slice(2).reduce((s,b) => s + state.opponents[pairIndex(a,b)], 0), 0)
      const cost = partnerCounts.reduce((sum, count) => sum + count * 4, 0) + highMiddle + opponents * 0.25
        + (state.fixtures.get(fixtureKey(split)) || 0) * 8 + random() * 0.2
      if (cost < best) { best = cost; chosen = split }
    }
    return { split: chosen, cost: best }
  }

  function attempt(pool, bounds, nodeLimit, prioritizeRest, balanceDoubles = false) {
    const state = {
      ...initial,
      counts: [...initial.counts], streaks: [...initial.streaks], rests: [...initial.rests], lastRuns: [...initial.lastRuns], doubles: [...initial.doubles],
      partners: [...initial.partners], opponents: [...initial.opponents], coPlayers: [...initial.coPlayers],
      quartets: [...initial.quartets], fixtures: new Map(initial.fixtures), rounds: []
    }
    let nodes = 0
    function visit(step) {
      if (step === roundCount) return state.counts.every((count,i) => count >= lower[i] && count <= upper[i])
      if (++nodes > nodeLimit) return false
      const remaining = roundCount - step - 1
      const scored = []
      for (const group of pool) {
        let overlap = 0, valid = true, pace = 0, restCost = 0, doubleCost = 0, capacity = 0, demand = 0
        for (const i of indices) {
          const playing = group.set.has(i)
          const count = state.counts[i] + Number(playing)
          const streak = playing ? state.streaks[i] + 1 : 0
          const rest = playing ? 0 : state.rests[i] + 1
          if (playing && state.previous.has(i)) overlap++
          const maxFuture = limit === Infinity ? remaining : remaining - Math.floor((remaining + streak) / (limit + 1))
          const lastRun = state.streaks[i] || state.lastRuns[i]
          const doubles = state.doubles[i] + Number(playing && state.streaks[i] > 0)
          // Seven players require at least one overlap per transition. Search
          // for a narrow shared double quota before accepting a looser solution.
          const doubleFloor = Math.floor((roundCount - 1) / n)
          const doubleCeiling = Math.ceil((roundCount - 1) / n) + 1
          if (balanceDoubles && (doubles > doubleCeiling || doubles + Math.ceil(remaining / 2) < doubleFloor)) { valid = false; break }
          if (count > upper[i] || streak > limit || rest > restLimit || (rest >= 3 && lastRun >= 2) || count + maxFuture < lower[i]) { valid = false; break }
          capacity += Math.min(upper[i] - count, maxFuture)
          demand += Math.max(0, lower[i] - count)
          pace += (count - (initialTotal + (step + 1) * 4) / n) ** 2
          restCost += rest * rest
          if (playing && state.streaks[i]) doubleCost += state.doubles[i] * 2 + 1
        }
        if (!valid || capacity < remaining * 4 || demand > remaining * 4) continue
        if (n >= 6 && overlap > 2) continue
        if (n >= 8 && step === 1 && !previousRounds.length && overlap !== 0) continue
        if (bounds.some(({subset,max}) => subset.reduce((sum,i) => sum + Math.max(0, lower[i] - state.counts[i] - Number(group.set.has(i))), 0) > max * remaining)) continue
        const team = teamChoice(group, state)
        const cost = pace * 5 + restCost * 2 + doubleCost * 1.5 + overlap * 2
          + state.quartets[group.index] * 12 + group.pairs.reduce((sum,pair) => sum + state.coPlayers[pair], 0) * 0.25
          + team.cost + (group.legal ? 0 : 12) + group.gap * 3 + random() * 0.5
        scored.push({ group, split: team.split, cost, restCost })
      }
      scored.sort((a,b) => (prioritizeRest ? a.restCost - b.restCost : 0) || a.cost - b.cost)
      for (const { group, split } of scored) {
        const streaks = [...state.streaks], rests = [...state.rests], lastRuns = [...state.lastRuns], previous = state.previous
        for (const i of indices) {
          if (group.set.has(i)) { state.counts[i]++; if (state.streaks[i]) state.doubles[i]++; state.streaks[i]++; state.rests[i] = 0 }
          else { if (state.streaks[i]) state.lastRuns[i] = state.streaks[i]; state.streaks[i] = 0; state.rests[i]++ }
        }
        record(state, split, group, 1)
        state.previous = group.set
        state.rounds.push(split)
        if (visit(step + 1)) return state
        state.rounds.pop()
        record(state, split, group, -1)
        for (const i of group.ids) { state.counts[i]--; if (streaks[i]) state.doubles[i]-- }
        state.streaks = streaks; state.rests = rests; state.lastRuns = lastRuns; state.previous = previous
        if (nodes > nodeLimit) break
      }
      return false
    }
    return visit(0)
  }

  function quality(state) {
    const all = previousRounds.map(r => [r.p1,r.p2,r.p3,r.p4].map(id => indexFor.get(id))).concat(state.rounds)
    let maxRest = 0, maxStreak = 0, fallback = 0, imbalance = 0
    const rests = Array(n).fill(0), streaks = Array(n).fill(0)
    for (const split of all) {
      for (const i of indices) { const playing = split.includes(i); rests[i] = playing ? 0 : rests[i] + 1; streaks[i] = playing ? streaks[i] + 1 : 0; maxRest = Math.max(maxRest, rests[i]); maxStreak = Math.max(maxStreak, streaks[i]) }
    }
    for (const split of state.rounds) {
      if (!isLegalGroup(split.map(i => players[i].id), players)) fallback++
      imbalance += Math.abs(split.slice(0,2).reduce((s,i) => s + LEVEL_WEIGHT[players[i].level],0) - split.slice(2).reduce((s,i) => s + LEVEL_WEIGHT[players[i].level],0))
    }
    let missingHM = 0, missingPartners = 0
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (!state.partners[pairIndex(a,b)]) {
        missingPartners++
        if ([players[a].level, players[b].level].sort().join('') === 'HM') missingHM++
      }
    }
    const repeatedFixtures = [...state.fixtures.values()].reduce((sum,count) => sum + count * Math.max(0,count - 1), 0)
    // Within the hard rest/streak limits, coverage must precede minimizing
    // doubles. Otherwise the search simply chooses two alternating quartets.
    return [fallback, missingHM, Math.max(...state.quartets), repeatedFixtures,
      Math.max(...state.doubles) - Math.min(...state.doubles), maxRest, missingPartners,
      state.doubles.reduce((s,c) => s + c,0), imbalance, state.partners.reduce((s,c) => s + c*c,0)]
  }

  let best, bestCost
  // Search strict-level rotations first. Only relax levels; quotas, opening
  // rest and streak constraints remain hard, including when extending history.
  for (const pool of [preferred, groups]) {
    if (!pool.length) continue
    const bounds = capacityBounds(pool)
    if (!bounds) continue
    const modes = n === 7 && !previousRounds.length ? [true, false] : [false]
    for (const balanceDoubles of modes) {
      for (let i = 0; i < 8; i++) {
        const state = attempt(pool, bounds, 2500, !balanceDoubles && i >= 4, balanceDoubles)
        if (!state) continue
        const cost = quality(state)
        if (!best || compare(cost,bestCost) < 0) { best = state; bestCost = cost }
      }
      if (best) break
    }
    if (best) break
  }
  if (!best) throw new Error('当前历史赛程无法同时满足局数与休息约束，请增加场次或重新生成未打赛程')
  return best.rounds.map(split => ({ p1: players[split[0]].id, p2: players[split[1]].id, p3: players[split[2]].id, p4: players[split[3]].id }))
}
