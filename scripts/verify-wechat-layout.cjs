const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { decorateMatch } = require('../miniprogram/pages/index/view-model.js')

const project = path.resolve(__dirname, '..')
const devtools = process.argv[2]
if (!devtools) throw new Error('Usage: node scripts/verify-wechat-layout.cjs <WeChat DevTools installation directory>')
const executable = path.join(devtools, '微信开发者工具.exe')
const entry = path.join(devtools, 'resources/app.asar.unpacked/js/common/cli/skill-index.js')
const bootstrap = "const entry = process.argv[1]; process.argv = [process.execPath, entry, '--electron', ...process.argv.slice(2)]; require(entry)"
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-wechat-layout-'))

function tool(name, options = {}) {
  const args = ['-e', bootstrap, entry, '-c', 'Codex', name, '--project', project]
  for (const [key, value] of Object.entries(options)) {
    args.push(`--${key}`, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
  const text = execFileSync(executable, args, {
    encoding: 'utf8', timeout: 45000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', cwd: project }
  })
  const response = JSON.parse(text.slice(text.indexOf('{')))
  assert.equal(response.ok, true, `${name}: ${text}`)
  assert.notEqual(response.result?.success, false, `${name}: ${text}`)
  return response.result
}

function setData(patch) {
  return tool('automation_page_action', { action: 'setData', patch: JSON.stringify(patch) })
}

function size(selector) {
  return tool('automation_element_action', { action: 'size', selector })
}

function capture(name, selector) {
  const result = tool('simulator_screenshot', {
    path: path.join(output, `${name}.jpg`), 'wait-for-selector': selector, wait: 1
  })
  assert.ok(fs.existsSync(result.path))
  console.log(`PASS ${name}: ${result.path}`)
}

function style(selector, name) {
  return tool('automation_element_action', { action: 'style', selector, name })
}

const initial = tool('automation_page_action', { action: 'getData' }).data
assert.equal(initial.screen, 'entry', 'Start from the entry page so no real match polling is interrupted')
assert.equal(initial.match, null, 'Layout verification only uses local fixture data, never a real cloud match')

try {
  setData({ screen: 'entry', entryMode: 'join', error: '', notice: '' })
  const input = size('.form-input')
  const button = size('.full-button')
  assert.ok(Math.abs(input.width - button.width) < 2, `join button ${button.width}px must match input ${input.width}px`)
  assert.equal(style('.entry-title', 'color'), 'rgb(23, 53, 44)')
  capture('entry-join', '.entry-title')

  tool('automation_element_action', { action: 'tap', selector: '.entry-mode-button[data-mode="create"]' })
  assert.equal(tool('automation_page_action', { action: 'getData', 'data-path': 'entryMode' }).data, 'create')
  capture('entry-create', '.form-helper')

  const players = ['齐诗郡', '陆娆', '陈谭玲', '庞旖旎', '李明', '王小羽', '长名字测试球友', '周小川']
    .map((name, index) => ({ id: index + 1, name, level: ['H', 'M', 'X', 'L'][index % 4], status: 'active' }))
  const snapshot = {
    id: 'layout-fixture-only', name: '羽毛球友谊赛', players,
    rounds: [
      { id: 1, seq: 1, p1: 1, p2: 2, p3: 3, p4: 4, score1: 21, score2: 17, status: 'completed' },
      { id: 2, seq: 2, p1: 7, p2: 2, p3: 3, p4: 8, score1: null, score2: null, status: 'active' },
      { id: 3, seq: 3, p1: 5, p2: 6, p3: 1, p4: 4, score1: null, score2: null, status: 'pending' }
    ],
    ranking: players.map((player, index) => ({ id: player.id, name: player.name, games: 1, wins: index < 4 ? 1 : 0, net: 12 - index * 4 }))
  }
  const view = decorateMatch(snapshot)
  setData({ ...view, match: snapshot, filteredRounds: view.rounds, screen: 'match', isCreator: true, score1: '', score2: '' })
  assert.equal(size('.icon-button').width, 40)
  assert.equal(size('.score-input').width, 82)
  assert.ok(size('.team-names').height >= 40)
  assert.ok(size('.full-button').width > 250)
  assert.ok(size('.bottom-nav').width > 300)
  capture('match', '.court-card')

  tool('automation_element_action', { action: 'tap', selector: '.nav-item[data-screen="schedule"]' })
  assert.equal(tool('automation_page_action', { action: 'getData', 'data-path': 'screen' }).data, 'schedule')
  assert.ok(size('.filter-tab').width < 100)
  capture('schedule', '.schedule-row')
  tool('automation_element_action', { action: 'tap', selector: '.filter-tab[data-filter="completed"]' })
  const filtered = tool('automation_page_action', { action: 'getData', 'data-path': 'filteredRounds' }).data
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].status, 'completed')

  setData({ screen: 'ranking' })
  capture('ranking', '.ranking-hero')

  setData({ screen: 'admin' })
  assert.ok(size('.player-name-input').width > 100)
  assert.equal(size('.small-button').width, 48)
  assert.match(tool('automation_element_action', { action: 'text', selector: '.new-level' }), /中/)
  capture('admin', '.admin-panel')
  tool('automation_viewport_action', { action: 'pageScrollTo', 'scroll-top': 10000 })
  capture('admin-controls', '.add-player')
  tool('automation_viewport_action', { action: 'pageScrollTo', 'scroll-top': 0 })

  setData({ screen: 'schedule', editingRound: view.rounds[0], editScore1: '21', editScore2: '17' })
  capture('score-modal', '.edit-modal')
  assert.ok(size('.edit-modal').width > 300)
} finally {
  setData(initial)
}
console.log(`Verified native WeChat layouts with local fixture data. Screenshots: ${output}`)
