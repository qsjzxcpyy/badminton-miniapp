const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const project = path.resolve(__dirname, '..')
const output = path.join(project, 'docs/verification')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-score-check-'))
function tool(name, options = {}) {
  const args = [path.join(__dirname, 'wechat-cloud-tool.cjs'), name, '--project', project]
  for (const [key, value] of Object.entries(options)) {
    if (key === 'args' || key === 'detail') {
      const file = path.join(temporary, 'args.json')
      fs.writeFileSync(file, JSON.stringify(value))
      args.push('--' + key + '-file', file)
    } else args.push('--' + key, String(value))
  }
  const text = execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 55000 })
  const r = JSON.parse(text.slice(text.indexOf('{')))
  assert.equal(r.ok, true, text)
  assert.notEqual(r.result?.success, false, text)
  return r.result
}
const evaluate = (fn, ...args) => tool('automation_evaluate', { 'fn-source': fn.toString(), args }).result.result
const data = (wait = 0) => tool('automation_page_action', { action: 'getData', wait }).data
const input = (field, value) => tool('automation_element_action', {
  selector: '.score-input[data-field="' + field + '"]', 'wait-for-selector': '.scoreboard',
  // The DevTools input action does not emit an input event for an empty value.
  ...(value === '' ? { action: 'trigger', type: 'input', detail: { value: '' } } : { action: 'input', value })
})
let prepared = false
try {
  evaluate(function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    if (page._rosterSavePending) throw new Error('Wait for real roster saves to finish before score verification')
    const initial = { ...page.data }
    delete initial.pollTimer; delete initial.__webviewId__
    page.__scoreCheckBackup = { data: initial, call: page.call, drafts: page._scoreDraftFields, polling: !!page.data.pollTimer }
    page.stopPolling()
    const players = [1,2,3,4].map(id => ({ id, name: '测试球友' + id, level: 'M', status: 'active' }))
    page.__scoreCheckFixture = { id: 'score-check-local-only', name: '比分输入回归', revision: 1, players, ranking: [],
      rounds: [1,2].map(id => ({ id, seq: id, p1: 1, p2: 2, p3: 3, p4: 4,
        status: id === 1 ? 'active' : 'pending', score1: null, score2: null })) }
    page.__scoreCheckCalls = []
    page.call = async function(action, payload) {
      const fixture = this.__scoreCheckFixture
      this.__scoreCheckCalls.push({ action, ...payload })
      if (action === 'getMatch') return { ok: true, match: JSON.parse(JSON.stringify(fixture)) }
      if (action !== 'saveScore') throw new Error('Unexpected action in local verification: ' + action)
      if (this.__scoreCheckFail) throw new Error('测试网络失败')
      const round = fixture.rounds.find(r => r.id === payload.roundId)
      Object.assign(round, { score1: payload.score1, score2: payload.score2, status: 'completed' })
      const next = fixture.rounds.find(r => r.status === 'pending')
      if (next) next.status = 'active'
      fixture.revision++
      return { ok: true, match: JSON.parse(JSON.stringify(fixture)) }
    }
    page.applySnapshot(page.__scoreCheckFixture)
    page.setData({ screen: 'match', error: '', notice: '', isCreator: true })
    page.startPolling()
    return { prepared: true }
  })
  prepared = true
  input('score1', '21'); input('score2', '18')
  const afterPoll = data(6)
  assert.equal(afterPoll.score1, '21'); assert.equal(afterPoll.score2, '18')
  const polls = evaluate(function() { return getCurrentPages()[getCurrentPages().length - 1].__scoreCheckCalls.filter(r => r.action === 'getMatch').length })
  assert.ok(polls >= 1, 'the real five-second poll must have run')
  const actualA = tool('automation_element_action', { action: 'value', selector: '.score-input[data-field="score1"]' })
  const actualB = tool('automation_element_action', { action: 'value', selector: '.score-input[data-field="score2"]' })
  assert.equal(String(actualA), '21'); assert.equal(String(actualB), '18')
  tool('simulator_screenshot', { path: path.join(output, 'wechat-score-draft.jpg'), 'wait-for-selector': '.scoreboard' })
  input('score2', '')
  const cleared = evaluate(function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    return { score1: page.data.score1, score2: page.data.score2, draftFields: page._scoreDraftFields, currentRound: page.data.currentRound.id }
  })
  assert.equal(cleared.score1, '21'); assert.equal(cleared.score2, '')
  evaluate(async function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    await page.refresh(); await page.submitScore()
    return { refreshed: true }
  })
  const blank = data()
  assert.equal(blank.score1, '21'); assert.equal(blank.score2, '')
  assert.match(blank.error, /请填写双方比分/)
  assert.equal(evaluate(function() { return getCurrentPages()[getCurrentPages().length - 1].__scoreCheckCalls.filter(r => r.action === 'saveScore').length }), 0)
  input('score2', '18')
  evaluate(async function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    page.__scoreCheckFail = true
    await page.submitScore(); await page.refresh()
    return { testedFailure: true }
  })
  const failed = data()
  assert.equal(failed.score1, '21'); assert.equal(failed.score2, '18')
  assert.equal(failed.error, '网络连接不稳定，请检查网络后重试')
  evaluate(async function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    page.__scoreCheckFail = false
    await page.submitScore()
    return { retried: true }
  })
  const next = data()
  assert.equal(next.currentRound.id, 2); assert.equal(next.score1, ''); assert.equal(next.score2, '')
  input('score1', '21'); input('score2', '0')
  const zero = evaluate(async function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    await page.refresh()
    const draft = [page.data.score1, page.data.score2]
    await page.submitScore()
    return { draft, saved: page.__scoreCheckFixture.rounds[1], currentRound: page.data.currentRound }
  })
  assert.deepEqual(zero.draft, ['21', '0'])
  assert.equal(zero.saved.score1, 21); assert.equal(zero.saved.score2, 0)
  assert.equal(zero.currentRound, null)
  const report = { verifiedAt: new Date().toISOString(), cloudCallsMocked: true, realCloudWrites: false,
    automaticPolls: polls, typedScoresAfterPolling: [afterPoll.score1, afterPoll.score2],
    nativeInputValuesAfterPolling: [actualA, actualB],
    emptyInputEventTriggered: true, blankRejected: true, failurePreservesDraft: true, nextRoundClearsDraft: true, explicitZeroAccepted: true }
  fs.writeFileSync(path.join(output, 'wechat-score-result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (prepared) evaluate(function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    page.stopPolling()
    const backup = page.__scoreCheckBackup
    page.call = backup.call
    page._scoreDraftFields = backup.drafts
    page.setData({ ...backup.data, pollTimer: null })
    for (const key of ['__scoreCheckBackup', '__scoreCheckFixture', '__scoreCheckCalls', '__scoreCheckFail']) delete page[key]
    if (backup.polling && backup.data.match) page.startPolling()
    return { restored: true }
  })
  const argsFile = path.join(temporary, 'args.json')
  if (fs.existsSync(argsFile)) fs.unlinkSync(argsFile)
  fs.rmdirSync(temporary)
}
