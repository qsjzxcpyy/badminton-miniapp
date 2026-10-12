const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { decorateMatch, filterRounds } = require('../miniprogram/pages/index/view-model')
const project = path.resolve(__dirname, '..')
const output = path.join(project, 'docs/verification/ui-redesign')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-ui-check-'))
fs.mkdirSync(output, { recursive: true })
function tool(name, options = {}) {
  const args = [path.join(__dirname, 'wechat-cloud-tool.cjs'), name, '--project', project]
  for (const [key, value] of Object.entries(options)) {
    if (['args','detail','result'].includes(key)) {
      const file = path.join(temporary, 'args.json')
      fs.writeFileSync(file, JSON.stringify(value))
      args.push('--' + key + '-file', file)
    } else args.push('--' + key, String(value))
  }
  let text
  for (let attempt = 0; attempt < 3; attempt++) {
    try { text = execFileSync(process.execPath, args, { encoding:'utf8', timeout:55000 }); break }
    catch (error) {
      const failure = String(error.stdout || error.message)
      // Repeat only reads/idempotent projections after a transport failure.
      const repeatable = ['simulator_screenshot', 'automation_viewport_action'].includes(name) ||
        name === 'automation_page_action' && ['getData', 'setData'].includes(options.action) ||
        name === 'automation_element_action' && ['style', 'size', 'text', 'value'].includes(options.action)
      if (repeatable && attempt < 2 && failure.includes('APPID_ERROR') && /TLS|network socket disconnected/.test(failure)) continue
      console.error(failure); throw error
    }
  }
  const response = JSON.parse(text.slice(text.indexOf('{')))
  assert.equal(response.ok, true, text)
  assert.notEqual(response.result?.success, false, text)
  return response.result
}
const evaluate = (fn, ...args) => tool('automation_evaluate', { 'fn-source': fn.toString(), args }).result.result
const data = (key, wait = 0) => tool('automation_page_action', { action: 'getData', wait, ...(key ? { 'data-path': key } : {}) }).data
const element = (selector, action, options = {}) => tool('automation_element_action', { selector, action, ...options })
const tap = selector => element(selector, 'trigger', { type:'tap' })
const count = selector => tool('automation_page_action', {action:'querySelectorAll', selector}).elements.length
const style = (selector, name) => element(selector, 'style', { name })
const size = selector => element(selector, 'size')
// Use the native JSON bridge for array projections: automation_evaluate's
// proxy arrays do not preserve .length in the WXML renderer.
const setData = patch => tool('automation_page_action', { action:'setData', patch:JSON.stringify(patch) })
const renderFixture = fixture => {
  evaluate(function(text) {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    page.applySnapshot(JSON.parse(text))
    return true
  }, JSON.stringify(fixture))
  const current = data()
  const view = decorateMatch(fixture)
  const filteredRounds = filterRounds(view.rounds, current.scheduleFilter, current.selectedPlayerId)
  setData({ match:fixture, ...view, ranking:fixture.ranking || [], filteredRounds, filteredRoundCount:filteredRounds.length })
  data(undefined, 1) // Await native rendering before selecting a projected player.
}
const scroll = top => tool('automation_viewport_action', { action: 'pageScrollTo', 'scroll-top': top })
const capture = (name, selector) => {
  scroll(0)
  const result = tool('simulator_screenshot', { path: path.join(output, name + '.jpg'), 'wait-for-selector': selector, wait: 1 })
  assert.ok(fs.existsSync(result.path))
  console.log('PASS screenshot: ' + name)
}
const players = ['齐诗郡','陆娆','陈谭玲','庞旖旎','李明','王小羽','长名字测试球友','周小川']
  .map((name,i) => ({ id:i+1, name, level:['H','M','X','L'][i%4], status:'active' }))
const fixture = { id:'layout-fixture-only', name:'周末羽球局', inviteCode:'246810', revision:1, players,
  rounds:[
    { id:1, seq:1, p1:1, p2:2, p3:3, p4:4, score1:21, score2:17, status:'completed' },
    { id:2, seq:2, p1:7, p2:2, p3:3, p4:8, score1:null, score2:null, status:'active' },
    { id:3, seq:3, p1:5, p2:6, p3:2, p4:4, score1:null, score2:null, status:'pending' },
    { id:4, seq:4, p1:1, p2:3, p3:6, p4:8, score1:null, score2:null, status:'pending' }
  ], ranking:players.map((p,i) => ({ id:p.id, name:p.name, games:i<4?1:0, wins:i<2?1:0, net:i<2?4:i<4?-4:0 })).sort((a,b) => b.net-a.net) }

let originalData
let nativeMocked = false
let prepared = false
const precedingReport = process.argv.includes('--finish') && fs.existsSync(path.join(output,'result.json'))
  ? JSON.parse(fs.readFileSync(path.join(output,'result.json'),'utf8')) : {}
delete precedingReport.benchPlayerCount
const report = { ...precedingReport, verifiedAt: new Date().toISOString(), cloudCallsMocked: true, realCloudWrites: false, fixtureProjectionBridge: "native setData with production decorateMatch" }
try {
  tool('automation_wx_api', { action:'mock', method:'cloud.callFunction', result:{result:{ok:true,match:fixture}} })
  nativeMocked = true
  originalData = data()
  delete originalData.pollTimer; delete originalData.__webviewId__
  evaluate(function(fixtureJson) {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    if (page._rosterSavePending || page.data.scoreSaving || page.data.scheduleBusy) throw new Error('Wait for pending edits before local UI verification')
    const initial = { ...page.data }
    delete initial.pollTimer; delete initial.__webviewId__
    page.__layoutBackup = { data: initial, call: page.call, drafts: page._scoreDraftFields, polling: !!page.data.pollTimer }
    page.stopPolling()
    page.__layoutFixture = JSON.parse(fixtureJson)
    page.__layoutCalls = []
    page.call = async function(action,payload) {
      this.__layoutCalls.push({ action, ...payload })
      if (action === 'saveScore') {
        const round = this.__layoutFixture.rounds.find(r => String(r.id) === String(payload.roundId))
        Object.assign(round, { score1:payload.score1, score2:payload.score2, status:'completed' })
        this.__layoutFixture.revision++
      } else if (action !== 'getMatch') throw new Error('Blocked real cloud action: '+action)
      return { ok:true, match:JSON.parse(JSON.stringify(this.__layoutFixture)) }
    }
    page.setData({ screen:'entry', entryMode:'join', error:'', notice:'', editingRound:null })
    return true
  }, JSON.stringify(fixture))
  prepared = true
  if (process.argv.includes('--finish')) {
    setData({ screen:'schedule', isCreator:true, error:'', notice:'', score1:'', score2:'', selectedPlayerId:'', scheduleFilter:'all' })
    renderFixture(fixture)
    report.precedingSections = 'verified in preceding run; see entry/match/schedule screenshots'
  } else {
  report.pageWidth = size('.app-shell').width
  const inputWidth = size('.form-input').width
  const joinWidth = size('.full-button').width
  assert.ok(Math.abs(inputWidth - joinWidth) < 2, 'join CTA must align with input')
  capture('01-entry-join', '.entry-title')
  tap('.entry-mode-button[data-mode="create"]')
  assert.equal(data('entryMode'), 'create')
  capture('02-entry-create', '.form-helper')
  evaluate(function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    page.setData({ screen:'match', isCreator:true, error:'', notice:'', score1:'', score2:'', selectedPlayerId:'', scheduleFilter:'all' })
    return true
  })
  renderFixture(fixture)
  setData({ score1:'', score2:'' })
  report.nameFontSize = parseFloat(style('.court-player-name:not(.long-name)', 'font-size'))
  report.submitFontSize = parseFloat(style('.submit-score', 'font-size'))
  assert.ok(report.nameFontSize > report.submitFontSize && report.nameFontSize <= 16, 'current names should be clear without oversized text')
  report.nextNameFontSize = parseFloat(style('.next-player-name', 'font-size'))
  assert.ok(report.nextNameFontSize >= 13 && report.nextNameFontSize <= 14, 'next names should be compact and readable')
  report.scoreStepSize = size('.score-step')
  assert.ok(report.scoreStepSize.width >= 32 && report.scoreStepSize.height >= 36)
  assert.ok(size('.bottom-nav').width > 300)
  capture('03-match', '.court-card')
  report.benchRemoved = count('.bench-card') === 0
  assert.equal(report.benchRemoved, true)
  assert.equal(count('.nav-item[data-screen="admin"]'), 1)
  report.creatorManagementEntry = true
  scroll(0)
  tool('simulator_screenshot', { path:path.join(output,'03b-next-and-summary.jpg'), 'wait-for-selector':'.quick-stats', wait:1 })
  scroll(0)
  assert.equal(data('score1'), '')
  tap('.score-step[data-field="score1"][data-delta="1"]')
  assert.equal(data('score1'), '1')
  evaluate(async function() {
    await getCurrentPages()[getCurrentPages().length - 1].refresh()
    return true
  })
  assert.equal(data('score1'), '1', 'refresh must preserve incremented draft')
  renderFixture(fixture)
  assert.equal(data('screen'), 'match')
  assert.equal(data('currentRound').id, 2)
  assert.equal(count('.court-player'), 4)
  tap('.court-player[data-id="7"]')
  assert.equal(data('screen'), 'schedule')
  assert.equal(String(data('selectedPlayerId')), '7')
  assert.equal(data('filteredRoundCount'), 1)
  capture('04-player-schedule', '.schedule-row')
  tap('.player-filter-chip[data-id=""]')
  assert.equal(data('filteredRoundCount'), 4)
  report.scheduleRowSize = size('.schedule-row')
  assert.ok(report.scheduleRowSize.height >= 44 && report.scheduleRowSize.height <= 76, 'schedule should use compact rows')
  capture('05-schedule', '.schedule-row')

  }
  tap('.filter-tab[data-filter="completed"]')
  assert.equal(data('filteredRoundCount'), 1)
  tap('.schedule-row[data-id="1"]')
  assert.equal(data('editingRound').id, 1)
  capture('06-edit-score', '.edit-modal')
  // Drive native input/save handlers. Evaluator Page.data snapshots can lag
  // behind native UI events, so do not call saveEdit through that proxy.
  element('.edit-score-input[data-field="editScore1"]', 'trigger', { type:'input', detail:{value:''} })
  tap('.edit-modal .full-button')
  assert.ok(data('error'), 'blank edit must expose validation')
  capture('07-edit-validation', '.edit-modal .form-error')
  const savedFixture = JSON.parse(JSON.stringify(fixture))
  savedFixture.rounds[0].score1 = 22
  savedFixture.revision++
  tool('automation_wx_api', { action:'mock', method:'cloud.callFunction', result:{result:{ok:true,match:savedFixture}} })
  element('.edit-score-input[data-field="editScore1"]', 'input', { value:'22' })
  tap('.edit-modal .full-button')
  const afterEditSave = data(undefined, 1)
  assert.equal(afterEditSave.editingRound, null)
  assert.equal(data('match').rounds[0].score1, 22)
  fixture.ranking.forEach(p => { if (p.id <= 4) p.net = p.id <= 2 ? 5 : -5 })
  fixture.rounds[0].score1 = 22
  fixture.revision++
  renderFixture(fixture)
  tap('.nav-item[data-screen="ranking"]')
  assert.equal(data('screen'), 'ranking')
  capture('08-ranking', '.ranking-hero')
  tap('.ranking-row[data-id="1"]')
  assert.equal(data('screen'), 'schedule')
  assert.equal(String(data('selectedPlayerId')), '1')
  tap('.nav-item[data-screen="admin"]')
  assert.equal(data('screen'), 'admin')
  assert.equal(count('.nav-item[data-screen="admin"].active'), 1)
  renderFixture(fixture)
  capture('09-admin', '.admin-panel')
  report.adminRemoveSize = size('.remove-button')
  assert.ok(report.adminRemoveSize.height >= 40)
  scroll(10000)
  tool('simulator_screenshot', { path:path.join(output,'10-admin-actions.jpg'), 'wait-for-selector':'.restart-panel', wait:1 })
  tap('.nav-item[data-screen="match"]')
  assert.equal(data('screen'), 'match')
  setData({isCreator:false})
  assert.equal(count('.nav-item[data-screen="admin"]'), 0)
  assert.equal(count('.icon-button'), 0)
  report.participantManagementHidden = true
  capture('10b-participant-match', '.court-card')
  setData({isCreator:true})
  renderFixture({ ...fixture, revision:3, rounds:[], ranking:[] })
  setData({ screen:'match', error:'', notice:'' })
  assert.equal(data('isFinished'), false)
  capture('11-waiting', '.empty-card')
  renderFixture({ ...fixture, revision:4, rounds:fixture.rounds.map(r => ({ ...r, status:'completed', score1:21, score2:17 })) })
  assert.equal(data('isFinished'), true)
  capture('12-finished', '.empty-card')
  report.nativeInteractions = ['entry mode','score increment','draft survives refresh','name to personal schedule','clear player filter','completed status filter','score edit validation','mocked score edit save','ranking to personal schedule','creator management tab','return from management tab','participant management hidden']
  report.emptyAndFinishedDistinguished = true
  fs.writeFileSync(path.join(output,'result.json'), JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
} finally {
  try {
  if (prepared) evaluate(function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    page.stopPolling()
    const backup = page.__layoutBackup
    if (!backup) return { restored:false, reason:'page was reloaded' }
    page.call = backup.call
    page._scoreDraftFields = backup.drafts
    page.setData({ ...backup.data, pollTimer:null, layoutFixtureData:null })
    for (const key of ['__layoutBackup','__layoutFixture','__layoutCalls']) delete page[key]
    if (backup.polling && backup.data.match) page.startPolling()
    return { restored:true }
  })
  if (prepared && originalData) setData({ ...originalData, layoutFixtureData:null, __layoutFixtureData:null })
  } finally {
    if (nativeMocked) tool('automation_wx_api', { action:'restore', method:'cloud.callFunction' })
  }
  const argsFile=path.join(temporary,'args.json')
  if (fs.existsSync(argsFile)) fs.unlinkSync(argsFile)
  fs.rmdirSync(temporary)
}
