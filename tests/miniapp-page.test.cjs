const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

test('the new player picker displays the existing middle-level default', () => {
  const directory = path.resolve(__dirname, '../miniprogram/pages/index')
  let page
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    Page: definition => { page = definition },
    require: request => require(path.resolve(directory, request))
  })
  assert.equal(page.data.newPlayerLevel, 'M')
  assert.equal(page.data.newPlayerLevelIndex, 1)
  assert.equal(page.data.newPlayerLevelLabel, page.data.levels[1])
})

function loadPage(wx = {}) {
  const directory = path.resolve(__dirname, '../miniprogram/pages/index')
  let page
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    Page: definition => { page = definition }, wx,
    require: request => require(path.resolve(directory, request))
  })
  page.setData = patch => Object.assign(page.data, patch)
  return page
}

test('changing the new-player level synchronizes the stored value, picker index and label', () => {
  const page = loadPage()
  page.changeNewLevel({ detail: { value: '3' } })
  assert.equal(page.data.newPlayerLevel, 'L')
  assert.equal(page.data.newPlayerLevelIndex, 3)
  assert.equal(page.data.newPlayerLevelLabel, '低')
})

test('changing a roster level synchronizes both lists immediately and saves the chosen level', () => {
  const page = loadPage()
  page.applySnapshot({ players: [{ id: 1, name: '球友', level: 'M', status: 'active' }], rounds: [], ranking: [] })
  let automaticSave
  page.savePlayers = players => { automaticSave = players }
  page.changePlayer({ currentTarget: { dataset: { id: 1, field: 'level' } }, detail: { value: '0' } })
  assert.equal(page.data.players[0].level, 'H')
  assert.equal(automaticSave[0].level, 'H')
  for (const list of [page.data.players, page.data.adminPlayers]) {
    assert.equal(list[0].levelIndex, 0)
    assert.equal(list[0].levelLabel, '高')
  }
  let saved
  page.savePlayers = players => { saved = players }
  page.savePlayerEdits()
  assert.equal(saved[0].level, 'H')
})


function deferred() {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

// Keep the real page, cloud actions and scheduler; delay only local transport.
function cloudPage(levels = 'MMMMMMMM', withSchedule = false) {
  const { buildSchedule } = require('../cloudfunctions/match/scheduler.cjs')
  const { rng } = require('../scripts/audit-scheduler.cjs')
  const players = [...levels].map((level, i) => ({ id: i + 1, name: `P${i + 1}`, level, status: 'active' }))
  const rounds = withSchedule ? buildSchedule({ players, roundCount: 15, random: rng(3) }).map((r, i) => ({
    ...r, id: i + 1, seq: i + 1, status: i === 0 ? 'active' : 'pending', score1: null, score2: null
  })) : []
  const stored = { _id: 'local', creatorOpenId: 'creator', revision: 2, name: 'Local match', inviteCode: '123456', players, rounds }
  const matches = {
    doc: () => ({ get: async () => ({ data: structuredClone(stored) }) }),
    where: query => ({ update: async ({ data }) => {
      if (query.revision !== stored.revision) return { stats: { updated: 0 } }
      Object.assign(stored, structuredClone(data))
      return { stats: { updated: 1 } }
    } })
  }
  const cloud = { init() {}, database: () => ({ collection: () => matches }), getWXContext: () => ({ OPENID: 'creator' }) }
  const exports = {}, math = Object.create(Math)
  math.random = rng(9)
  const directory = path.resolve(__dirname, '../cloudfunctions/match')
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    exports, Date, Math: math,
    require: name => name === 'wx-server-sdk' ? cloud : require(path.resolve(directory, name))
  })
  const page = loadPage(), requests = [], saveGates = []
  page.call = async (action, payload) => {
    const request = structuredClone({ action, ...payload })
    requests.push(request)
    if (action === 'savePlayers' && saveGates.length) await saveGates.shift().promise
    return exports.main(request)
  }
  page.applySnapshot({ ...structuredClone(stored), id: 'local', ranking: [] })
  return { page, stored, requests, saveGates }
}

test('generation waits for a delayed level save and uses the saved roster and revision', async t => {
  const { page, stored, requests, saveGates } = cloudPage('HHMMMMML')
  const gate = deferred()
  saveGates.push(gate)
  t.after(async () => { gate.resolve(); await flush() })
  const save = page.changePlayer({ currentTarget: { dataset: { id: 7, field: 'level' } }, detail: { value: '3' } })
  const generation = page.generateSchedule()
  await flush()
  assert.equal(stored.rounds.length, 0, 'generation must not run while the chosen level is unsaved')
  assert.equal(requests.some(r => r.action === 'generateSchedule'), false)
  assert.equal(typeof save?.then, 'function', 'the picker handler must return its save promise')
  gate.resolve()
  await save
  await generation
  assert.equal(stored.players[6].level, 'L')
  assert.equal(stored.rounds.length, 15)
  assert.equal(requests.find(r => r.action === 'generateSchedule').revision, 3)
  const { isLegalGroup } = require('../cloudfunctions/match/scheduler.cjs')
  assert.ok(stored.rounds.every(r => isLegalGroup([r.p1, r.p2, r.p3, r.p4], stored.players)))
})

test('extension waits for successive saves added during its wait and uses each new revision', async t => {
  const { page, stored, requests, saveGates } = cloudPage('MMMMMMMM', true)
  const firstGate = deferred(), secondGate = deferred()
  saveGates.push(firstGate, secondGate)
  t.after(async () => { firstGate.resolve(); secondGate.resolve(); await flush() })
  const originalRounds = JSON.stringify(stored.rounds)
  page.changePlayer({ currentTarget: { dataset: { id: 1, field: 'name' } }, detail: { value: 'First edit' } })
  const first = page.savePlayerEdits()
  const extension = page.extendSchedule()
  page.changePlayer({ currentTarget: { dataset: { id: 2, field: 'name' } }, detail: { value: 'Second edit' } })
  const second = page.savePlayerEdits()
  await flush()
  assert.equal(requests.filter(r => r.action === 'savePlayers').length, 1, 'roster saves must be serialized')
  assert.equal(stored.rounds.length, 15)
  firstGate.resolve()
  await first
  await flush()
  assert.equal(page.data.players[1].name, 'Second edit', 'an earlier save response must preserve newer edits')
  assert.equal(requests.filter(r => r.action === 'savePlayers')[1].revision, 3)
  assert.equal(requests.some(r => r.action === 'extendSchedule'), false)
  secondGate.resolve()
  await second
  await extension
  assert.equal(stored.players[0].name, 'First edit')
  assert.equal(stored.players[1].name, 'Second edit')
  assert.equal(requests.find(r => r.action === 'extendSchedule').revision, 4)
  assert.equal(stored.revision, 5)
  assert.equal(JSON.stringify(stored.rounds.slice(0, 15)), originalRounds)
  assert.equal(page.data.roundCount, 20)
  assert.equal(page.data.filteredRoundCount, 20)
  assert.equal(page.data.playerCount, 8)
})

for (const action of ['generateSchedule', 'extendSchedule']) {
  test(`${action} aborts when a pending roster save fails and can recover after a successful retry`, async t => {
    const { page, stored, requests, saveGates } = cloudPage()
    const gate = deferred()
    saveGates.push(gate)
    t.after(async () => { gate.resolve(); await flush() })
    const before = JSON.stringify(stored)
    const save = page.savePlayers()
    const rejection = save && assert.rejects(save, /save unavailable/)
    const schedule = page[action]()
    await flush()
    gate.reject(new Error('save unavailable'))
    await rejection
    assert.equal(await schedule, false)
    assert.equal(JSON.stringify(stored), before)
    assert.equal(requests.some(r => r.action === action), false)
    assert.equal(page.data.error, '操作未完成，请稍后重试')
    assert.equal(await page[action](), false, 'the failed save must block scheduling until a retry succeeds')
    await page.savePlayers()
    await page[action]()
    assert.equal(stored.rounds.length, action === 'generateSchedule' ? 15 : 5)
  })
}

test('polling skips saving rosters and discards a pre-save response arriving during saving', async t => {
  const { page, saveGates } = cloudPage()
  const poll = deferred(), saveGate = deferred(), originalCall = page.call
  let polls = 0
  const oldSnapshot = structuredClone(page.data.match)
  page.call = (action, payload) => {
    if (action === 'getMatch') { polls++; return poll.promise }
    return originalCall(action, payload)
  }
  saveGates.push(saveGate)
  t.after(async () => { poll.resolve({ match: oldSnapshot }); saveGate.resolve(); await flush() })
  const refresh = page.refresh()
  const save = page.changePlayer({ currentTarget: { dataset: { id: 1, field: 'level' } }, detail: { value: '0' } })
  await page.refresh()
  assert.equal(polls, 1, 'polling must not fetch another snapshot during saving')
  poll.resolve({ match: oldSnapshot })
  await refresh
  await flush()
  assert.equal(page.data.players[0].level, 'H')
  saveGate.resolve()
  await save
})

test('a pre-save poll arriving after the save finishes cannot roll back the roster or revision', async () => {
  const { page } = cloudPage()
  const poll = deferred(), originalCall = page.call
  const oldSnapshot = structuredClone(page.data.match)
  page.call = (action, payload) => action === 'getMatch' ? poll.promise : originalCall(action, payload)
  const refresh = page.refresh()
  await page.changePlayer({ currentTarget: { dataset: { id: 1, field: 'level' } }, detail: { value: '0' } })
  await flush()
  poll.resolve({ match: oldSnapshot })
  await refresh
  await flush()
  assert.equal(page.data.players[0].level, 'H')
  assert.equal(page.data.match.revision, 3)
})


test('a save response preserves a newer name draft that has not been queued for saving', async t => {
  const { page, stored, saveGates } = cloudPage()
  const gate = deferred()
  saveGates.push(gate)
  t.after(async () => { gate.resolve(); await flush() })
  const save = page.savePlayers()
  await flush()
  page.changePlayer({ currentTarget: { dataset: { id: 1, field: 'name' } }, detail: { value: 'New draft' } })
  gate.resolve()
  await save
  assert.equal(stored.players[0].name, 'P1', 'the captured save payload must remain immutable')
  assert.equal(page.data.players[0].name, 'New draft')
  assert.equal(page.data.adminPlayers[0].name, 'New draft')
  assert.equal(page.data.match.revision, 3)
  await page.savePlayerEdits()
  assert.equal(stored.players[0].name, 'New draft')
})

test('a failed save stops the queued saves and extension without writing a stale roster', async t => {
  const { page, stored, requests, saveGates } = cloudPage('MMMMMMMM', true)
  const gate = deferred()
  saveGates.push(gate)
  t.after(async () => { gate.resolve(); await flush() })
  const before = JSON.stringify(stored)
  const first = page.savePlayers()
  const firstRejection = first && assert.rejects(first, /save unavailable/)
  page.changePlayer({ currentTarget: { dataset: { id: 2, field: 'name' } }, detail: { value: 'Queued draft' } })
  const second = page.savePlayerEdits()
  const secondRejection = second && assert.rejects(second, /save unavailable/)
  const extension = page.extendSchedule()
  await flush()
  gate.reject(new Error('save unavailable'))
  await firstRejection
  await secondRejection
  assert.equal(await extension, false)
  assert.equal(requests.filter(r => r.action === 'savePlayers').length, 1)
  assert.equal(requests.some(r => r.action === 'extendSchedule'), false)
  assert.equal(JSON.stringify(stored), before)
  assert.equal(page.data.players[1].name, 'Queued draft')
})

test('polling updates the match while preserving both unsaved score inputs', async () => {
  const { page, stored } = cloudPage('MMMMMMMM', true)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '21' } })
  page.onInput({ currentTarget: { dataset: { field: 'score2' } }, detail: { value: '18' } })
  stored.name = 'Updated match name'
  stored.revision++
  await page.refresh()
  await page.refresh()
  assert.equal(page.data.score1, '21')
  assert.equal(page.data.score2, '18')
  assert.equal(page.data.match.name, 'Updated match name', 'live match updates must continue during score entry')
  assert.equal(page.data.match.revision, 3)
  assert.equal(stored.rounds[0].score1, null, 'typing must not save a score')
})

test('a poll started before typing cannot erase scores typed before its response arrives', async () => {
  const { page } = cloudPage('MMMMMMMM', true)
  const poll = deferred()
  const snapshot = structuredClone(page.data.match)
  page.call = () => poll.promise
  const refresh = page.refresh()
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '17' } })
  page.onInput({ currentTarget: { dataset: { field: 'score2' } }, detail: { value: '0' } })
  poll.resolve({ match: snapshot })
  await refresh
  assert.equal(page.data.score1, '17')
  assert.equal(page.data.score2, '0')
})

test('clearing a score remains an empty draft even when the same round has a saved numeric value', async () => {
  const { page, stored } = cloudPage('MMMMMMMM', true)
  stored.rounds[0].score1 = 7
  page.applySnapshot({ ...structuredClone(stored), id: 'local', ranking: [] })
  assert.equal(page.data.score1, '7')
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '' } })
  await page.refresh()
  assert.equal(page.data.score1, '', 'an intentional clear must survive polling')
})

test('score drafts reset when another device advances to a different active round', async () => {
  const { page, stored } = cloudPage('MMMMMMMM', true)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '21' } })
  page.onInput({ currentTarget: { dataset: { field: 'score2' } }, detail: { value: '18' } })
  stored.rounds[0] = { ...stored.rounds[0], status: 'completed', score1: 15, score2: 12 }
  stored.rounds[1].status = 'active'
  stored.revision++
  await page.refresh()
  assert.equal(page.data.currentRound.id, 2)
  assert.equal(page.data.score1, '')
  assert.equal(page.data.score2, '')
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '9' } })
  await page.refresh()
  assert.equal(page.data.score1, '9', 'the next round must have its own draft')
})

test('score drafts do not leak between matches that reuse the same round ID', () => {
  const { page } = cloudPage('MMMMMMMM', true)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '21' } })
  page.applySnapshot({ ...structuredClone(page.data.match), id: 'another-match' })
  assert.equal(page.data.score1, '')
  assert.equal(page.data.score2, '')
})

test('score drafts clear when there is no longer an active round', () => {
  const { page } = cloudPage('MMMMMMMM', true)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '21' } })
  page.applySnapshot({ ...structuredClone(page.data.match), rounds: [] })
  assert.equal(page.data.currentRound, null)
  assert.equal(page.data.score1, '')
})

test('an empty score cannot silently become a submitted zero', async () => {
  const { page, stored, requests } = cloudPage('MMMMMMMM', true)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '21' } })
  await page.submitScore()
  await flush()
  assert.equal(requests.some(r => r.action === 'saveScore'), false)
  assert.equal(stored.rounds[0].status, 'active')
  assert.equal(page.data.score1, '21')
  assert.match(page.data.error, /请填写双方比分/)
})

test('an explicit zero is accepted and successful submission resets the next round inputs', async () => {
  const { page, stored } = cloudPage('MMMMMMMM', true)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '21' } })
  page.onInput({ currentTarget: { dataset: { field: 'score2' } }, detail: { value: '0' } })
  await page.refresh()
  await page.submitScore()
  await flush()
  assert.equal(stored.rounds[0].score1, 21)
  assert.equal(stored.rounds[0].score2, 0)
  assert.equal(stored.rounds[0].status, 'completed')
  assert.equal(page.data.currentRound.id, 2)
  assert.equal(page.data.score1, '')
  assert.equal(page.data.score2, '')
})

test('a failed score submission keeps the draft through later polling for retry', async () => {
  const { page } = cloudPage('MMMMMMMM', true)
  const originalCall = page.call
  page.call = (action, payload) => action === 'saveScore' ? Promise.reject(new Error('score unavailable')) : originalCall(action, payload)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '21' } })
  page.onInput({ currentTarget: { dataset: { field: 'score2' } }, detail: { value: '18' } })
  await page.submitScore()
  await flush()
  await page.refresh()
  assert.equal(page.data.score1, '21')
  assert.equal(page.data.score2, '18')
  assert.equal(page.data.error, '操作未完成，请稍后重试')
  page.call = originalCall
  await page.submitScore()
  await flush()
  assert.equal(page.data.currentRound.id, 2)
})

test('editing a completed score stays intact while the current match is polled', async () => {
  const { page, stored } = cloudPage('MMMMMMMM', true)
  stored.rounds[0] = { ...stored.rounds[0], status: 'completed', score1: 21, score2: 18 }
  stored.rounds[1].status = 'active'
  await page.refresh()
  page.openEdit({ currentTarget: { dataset: { id: 1 } } })
  page.onInput({ currentTarget: { dataset: { field: 'editScore1' } }, detail: { value: '22' } })
  page.onInput({ currentTarget: { dataset: { field: 'editScore2' } }, detail: { value: '20' } })
  await page.refresh()
  assert.equal(page.data.editingRound.id, 1)
  assert.equal(page.data.editScore1, '22')
  assert.equal(page.data.editScore2, '20')
})


function restartPage(confirm = true) {
  const fixture = cloudPage('HHMMMXLL', true)
  fixture.page.confirmRestart = async () => confirm
  fixture.page.setData({ isCreator: true, screen: 'admin' })
  return fixture
}

test('restart confirmation describes the destructive reset and resolves cancellation', async () => {
  let modal
  const page = loadPage({ showModal: options => { modal = options; options.success({ confirm: false }) } })
  assert.equal(await page.confirmRestart(), false)
  assert.match(modal.content, /比分/)
  assert.match(modal.content, /排名/)
  assert.match(modal.content, /邀请码/)
  assert.match(modal.content, /15/)
})

test('cancelled restart sends no mutation and leaves the old match and draft intact', async () => {
  const { page, stored, requests } = restartPage(false)
  const before = JSON.stringify(stored)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '19' } })
  await page.restartMatch()
  assert.equal(requests.length, 0)
  assert.equal(JSON.stringify(stored), before)
  assert.equal(page.data.score1, '19')
  assert.equal(page.data.scheduleBusy, false)
})

test('restart keeps the invite and roster but clears score drafts, edited history and ranking', async () => {
  const { page, stored, requests } = restartPage()
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '19' } })
  page.setData({ editingRound: page.data.currentRound, editScore1: '18', editScore2: '21', scheduleFilter: 'completed' })
  await page.restartMatch()
  assert.equal(requests.filter(r => r.action === 'restartMatch').length, 1)
  assert.equal(page.data.match.inviteCode, '123456')
  assert.equal(page.data.roundCount, 15)
  assert.equal(page.data.currentRound.seq, 1)
  assert.equal(page.data.currentRound.id, 16)
  assert.equal(page.data.completedCount, 0)
  assert.equal(page.data.score1, '')
  assert.equal(page.data.score2, '')
  assert.equal(page.data.editingRound, null)
  assert.equal(page.data.editScore1, '')
  assert.equal(page.data.scheduleFilter, 'all')
  assert.equal(page.data.filteredRoundCount, 15)
  assert.ok(page.data.ranking.every(r => r.games === 0))
  assert.equal(stored.revision, 3)
  assert.equal(page.data.scheduleBusy, false)
})

test('restart waits for a roster save and suppresses duplicate restart, generation and extension', async () => {
  const { page, requests, saveGates, stored } = restartPage()
  const gate = deferred()
  saveGates.push(gate)
  const save = page.changePlayer({ currentTarget: { dataset: { id: 7, field: 'level' } }, detail: { value: '3' } })
  const restart = page.restartMatch()
  await flush()
  await page.restartMatch(); await page.generateSchedule(); await page.extendSchedule()
  assert.equal(requests.length, 1)
  gate.resolve(); await save; await restart
  assert.equal(requests.length, 2)
  assert.equal(requests[1].action, 'restartMatch')
  assert.equal(requests[1].revision, 3)
  assert.equal(stored.players[6].level, 'L')
})

test('failed restart retains the old score draft and unlocks the controls', async () => {
  const { page } = restartPage()
  const before = JSON.stringify(page.data.match)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '19' } })
  page.call = async () => { throw new Error('restart unavailable') }
  assert.equal(await page.restartMatch(), false)
  assert.equal(JSON.stringify(page.data.match), before)
  assert.equal(page.data.score1, '19')
  assert.equal(page.data.scheduleBusy, false)
  assert.equal(page.data.error, '操作未完成，请稍后重试')
})

test('non-creators cannot invoke restart from the page', async () => {
  const { page, requests } = restartPage()
  page.setData({ isCreator: false })
  await page.restartMatch()
  assert.equal(requests.length, 0)
})

test('polling a restart clears another player score draft and stale history editor', async () => {
  const { page } = restartPage()
  const old = structuredClone(page.data.match)
  page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '19' } })
  page.setData({ editingRound: page.data.currentRound, editScore1: '21', editScore2: '18' })
  const restarted = { ...old, revision: old.revision + 1, rounds: old.rounds.map(r => ({ ...r, id: r.id + 15 })) }
  page.call = async () => ({ match: restarted })
  await page.refresh()
  assert.equal(page.data.score1, '')
  assert.equal(page.data.editingRound, null)
  assert.equal(page.data.editScore1, '')
  page.applySnapshot(old)
  assert.equal(page.data.match.revision, restarted.revision)
  assert.equal(page.data.currentRound.id, 16)
})

test('a delayed old score response cannot replace the restarted schedule', async () => {
  const { page } = restartPage()
  const scoreGate = deferred(), originalCall = page.call
  const oldResponse = await originalCall('saveScore', { matchId: 'local', roundId: 1, score1: 21, score2: 18 })
  page.call = (action, payload) => action === 'saveScore' ? scoreGate.promise : originalCall(action, payload)
  const score = page.saveScore(1, '21', '18')
  page.applySnapshot(oldResponse.match)
  await page.restartMatch()
  const newId = page.data.currentRound.id
  scoreGate.resolve(oldResponse)
  await score
  assert.equal(page.data.currentRound.id, newId)
  assert.equal(page.data.completedCount, 0)
  assert.equal(page.data.match.revision, 4)
})


test('restart stops after a roster save failure and leaves the old schedule intact', async () => {
  const { page, requests, saveGates, stored } = restartPage()
  const gate = deferred()
  saveGates.push(gate)
  const before = JSON.stringify(stored)
  const save = page.savePlayers()
  const rejection = assert.rejects(save, /roster unavailable/)
  const restart = page.restartMatch()
  await flush()
  gate.reject(new Error('roster unavailable'))
  await rejection
  assert.equal(await restart, false)
  assert.equal(JSON.stringify(stored), before)
  assert.equal(requests.some(r => r.action === 'restartMatch'), false)
  assert.equal(page.data.scheduleBusy, false)
})


const wrappedCloudError = reason => `cloud.callFunction:fail Error: errCode: -504002 functions execute fail | errMsg: Error: ${reason} at fail (/var/user/index.js:9:32) at exports.main (/var/user/index.js:83:29) at processTicksAndRejections (node:internal/process/task_queues:96:5) 更多错误信息请访问：https://docs.cloudbase.net/error-code/basic/FUNCTIONS_EXECUTE_FAIL (callId: 123456) (trace: 16:20:52 system error, abort)`

for (const error of [new Error(wrappedCloudError('至少需要 4 名正常球员')), { errMsg: wrappedCloudError('至少需要 4 名正常球员') }]) {
  test('wrapped insufficient-player errors show only an actionable message', () => {
    const page = loadPage()
    page.setData({ notice: '赛程已生成' })
    page.showError(error)
    assert.equal(page.data.error, '至少需要 4 名参赛球员，请先添加或恢复球员后再排赛')
    assert.equal(page.data.notice, '')
  })
}

for (const [reason, expected] of [
  ['数据已被其他人更新，请刷新后重试', '比赛数据已更新，请刷新后重试'],
  ['仅创建者可以管理比赛', '只有比赛创建者可以进行此操作'],
  ['未找到该比赛', '未找到比赛，请检查邀请码是否正确'],
  ['未找到该小局', '这局比赛已变更，请刷新赛程后重试'],
  ['当前历史赛程无法同时满足局数与休息约束，请增加场次或重新生成未打赛程', '暂时无法兼顾局数与休息，请增加场次或重排待开始赛程'],
  ['没有待生成的赛程', '没有待开始的比赛，可选择继续加赛或重新开始比赛']
]) {
  test(`cloud business failure is translated: ${reason}`, () => {
    const page = loadPage()
    page.showError(new Error(wrappedCloudError(reason)))
    assert.equal(page.data.error, expected)
  })
}

for (const error of [undefined, {}, new Error('db query failure at /var/user/index.js:42'), { errMsg: wrappedCloudError('Unexpected private database exception') }]) {
  test('unknown failures never expose internal details or crash error handling', () => {
    const page = loadPage()
    page.showError(error)
    assert.equal(page.data.error, '操作未完成，请稍后重试')
  })
}

for (const [error, expected] of [
  [{ errMsg: 'cloud.callFunction:fail network connection failed' }, '网络连接不稳定，请检查网络后重试'],
  [{ errMsg: 'cloud.callFunction:fail timeout' }, '请求超时，请稍后重试'],
  [new Error('请填写双方比分（0 分也请填写 0）'), '请填写双方比分（0 分也请填写 0）'],
  [new Error('球员姓名不能重复'), '球员姓名不能重复']
]) {
  test(`network and local validation messages remain understandable: ${expected}`, () => {
    const page = loadPage()
    page.showError(error)
    assert.equal(page.data.error, expected)
  })
}

test('a real SDK rejection during generation reaches the friendly page error and unlocks controls', async () => {
  const page = loadPage({ cloud: { callFunction: () => Promise.reject({ errMsg: wrappedCloudError('至少需要 4 名正常球员') }) } })
  page.applySnapshot({ id: 'local', revision: 1, players: [], rounds: [], ranking: [] })
  assert.equal(await page.generateSchedule(), false)
  assert.equal(page.data.error, '至少需要 4 名参赛球员，请先添加或恢复球员后再排赛')
  assert.equal(page.data.scheduleBusy, false)
})
