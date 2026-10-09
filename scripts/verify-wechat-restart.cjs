const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { buildSchedule } = require('../cloudfunctions/match/scheduler.cjs')
const { publicSnapshot } = require('../cloudfunctions/match/logic.js')
const { rng } = require('./audit-scheduler.cjs')
const project = path.resolve(__dirname, '..')
const output = path.join(project, 'docs/verification')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-restart-check-'))
function tool(name, options = {}) {
  const args = [path.join(__dirname, 'wechat-cloud-tool.cjs'), name, '--project', project]
  for (const [key, value] of Object.entries(options)) {
    if (['args', 'detail', 'result'].includes(key)) {
      const file = path.join(temporary, key + '.json')
      fs.writeFileSync(file, JSON.stringify(value))
      args.push('--' + key + '-file', file)
    } else args.push('--' + key, String(value))
  }
  const text = execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 55000 })
  const response = JSON.parse(text.slice(text.indexOf('{')))
  assert.equal(response.ok, true, text)
  assert.notEqual(response.result?.success, false, text)
  return response.result
}
const evaluate = (fn, ...args) => tool('automation_evaluate', { 'fn-source': fn.toString(), args }).result.result
const data = (wait = 0) => tool('automation_page_action', { action: 'getData', wait }).data

async function fixtures() {
  const players = [...'HHMMMXLL'].map((level, i) => ({ id: i + 1, name: '测试球友' + (i + 1), level, status: 'active' }))
  const rounds = buildSchedule({ players, roundCount: 15, random: rng(3) }).map((round, i) => ({
    ...round, id: i + 1, seq: i + 1, status: i < 3 ? 'completed' : i === 3 ? 'active' : 'pending',
    score1: i < 3 ? 21 : null, score2: i < 3 ? 18 : null
  }))
  const stored = { _id: 'restart-check-local-only', creatorOpenId: 'creator', revision: 2,
    name: '重新开始比赛验证', inviteCode: '123456', players, rounds }
  const initial = publicSnapshot(stored, true)
  const matches = {
    doc: () => ({ get: async () => ({ data: structuredClone(stored) }) }),
    where: query => ({ update: async ({ data: patch }) => {
      if (query.revision !== stored.revision) return { stats: { updated: 0 } }
      Object.assign(stored, structuredClone(patch)); return { stats: { updated: 1 } }
    } })
  }
  const cloud = { init() {}, database: () => ({ collection: () => matches }), getWXContext: () => ({ OPENID: 'creator' }) }
  const exports = {}, math = Object.create(Math); math.random = rng(9)
  const directory = path.join(project, 'cloudfunctions/match')
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    exports, Date, Math: math,
    require: name => name === 'wx-server-sdk' ? cloud : require(path.resolve(directory, name))
  })
  const restarted = await exports.main({ action: 'restartMatch', matchId: stored._id, revision: 2 })
  return { initial, restarted }
}

let prepared = false, mockedModal = false
async function main() {
  const fixture = await fixtures()
  try {
    evaluate(function(fixture) {
      const page = getCurrentPages()[getCurrentPages().length - 1]
      if (page._rosterSavePending || page.data.scheduleBusy) throw new Error('Wait for real edits to finish first')
      const initial = { ...page.data }
      delete initial.pollTimer; delete initial.__webviewId__
      page.__restartCheckBackup = { data: initial, call: page.call, drafts: page._scoreDraftFields, polling: !!page.data.pollTimer }
      page.stopPolling()
      page.__restartCheckFixture = fixture
      page.__restartCheckCalls = []
      page.call = async function(action, payload) {
        this.__restartCheckCalls.push({ action, ...payload })
        if (action !== 'restartMatch') throw new Error('Unexpected cloud write in local verification: ' + action)
        if (payload.matchId !== fixture.initial.id || payload.revision !== fixture.initial.revision) throw new Error('Unexpected restart payload')
        return fixture.restarted
      }
      page.applySnapshot(fixture.initial)
      page.setData({ isCreator: true, screen: 'admin', error: '', notice: '' })
      page.onInput({ currentTarget: { dataset: { field: 'score1' } }, detail: { value: '19' } })
      return { prepared: true }
    }, fixture)
    prepared = true
    tool('automation_viewport_action', { action: 'pageScrollTo', 'scroll-top': 9999 })
    const text = tool('automation_element_action', { action: 'text', selector: '.restart-panel' })
    assert.match(text, /重新开始比赛/)
    assert.match(text, /邀请码/)
    tool('simulator_screenshot', { path: path.join(output, 'wechat-restart-admin.jpg'), 'wait-for-selector': '.restart-button' })
    tool('automation_wx_api', { action: 'mock', method: 'showModal', result: { confirm: false, cancel: true } })
    mockedModal = true
    tool('automation_element_action', { action: 'tap', selector: '.restart-button' })
    const cancelled = data(1)
    assert.equal(cancelled.currentRound.id, 4)
    assert.equal(cancelled.completedCount, 3)
    assert.equal(cancelled.score1, '19')
    assert.equal(cancelled.scheduleBusy, false)
    assert.equal(evaluate(function() { return getCurrentPages()[getCurrentPages().length - 1].__restartCheckCalls.length }), 0)
    tool('automation_wx_api', { action: 'mock', method: 'showModal', result: { confirm: true, cancel: false } })
    tool('automation_element_action', { action: 'tap', selector: '.restart-button' })
    const restarted = data(1)
    assert.equal(restarted.match.id, fixture.initial.id)
    assert.equal(restarted.match.inviteCode, '123456')
    assert.equal(restarted.currentRound.id, 16)
    assert.equal(restarted.currentRound.seq, 1)
    assert.equal(restarted.roundCount, 15)
    assert.equal(restarted.completedCount, 0)
    assert.equal(restarted.score1, '')
    assert.equal(restarted.score2, '')
    assert.equal(restarted.scheduleBusy, false)
    assert.ok(restarted.ranking.every(p => p.games === 0 && p.net === 0))
    tool('automation_element_action', { action: 'tap', selector: '.admin-return' })
    const matchView = data(1)
    assert.equal(matchView.screen, 'match')
    const nativeA = tool('automation_element_action', { action: 'value', selector: '.score-input[data-field="score1"]' })
    const nativeB = tool('automation_element_action', { action: 'value', selector: '.score-input[data-field="score2"]' })
    assert.equal(nativeA, ''); assert.equal(nativeB, '')
    tool('automation_viewport_action', { action: 'pageScrollTo', 'scroll-top': 0 })
    tool('simulator_screenshot', { path: path.join(output, 'wechat-restart-fresh-match.jpg'), 'wait-for-selector': '.scoreboard' })
    const report = { checkedAt: new Date().toISOString(), mode: 'real page and cloud action; in-memory database and mocked cloud transport/modal choices',
      realCloudWrites: 0, oldCompleted: 3, cancelledUnchanged: true, inviteRetained: true, rosterRetained: true,
      freshRounds: 15, firstSequence: 1, firstInternalId: 16, clearedScores: true, clearedRanking: true,
      nativeInputs: [nativeA, nativeB], screenshots: ['wechat-restart-admin.jpg', 'wechat-restart-fresh-match.jpg'] }
    fs.writeFileSync(path.join(output, 'wechat-restart-result.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report, null, 2))
  } finally {
    if (mockedModal) tool('automation_wx_api', { action: 'restore', method: 'showModal' })
    if (prepared) evaluate(function() {
      const page = getCurrentPages()[getCurrentPages().length - 1], backup = page.__restartCheckBackup
      page.stopPolling()
      page.call = backup.call
      page._scoreDraftFields = backup.drafts
      page.setData(backup.data)
      delete page.__restartCheckBackup; delete page.__restartCheckFixture; delete page.__restartCheckCalls
      if (backup.polling) page.startPolling()
      return { restored: true }
    })
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
