const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', 'miniprogram')
const markup = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
const styles = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
const pageStyles = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8')
const allStyles = `${styles}\n${pageStyles}`

function declarations(selector) {
  const rules = [...allStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  return rules.filter(rule => rule[1].split(',').some(candidate => candidate.trim() === selector))
    .map(rule => rule[2]).join(';')
}

test('entry uses a native block hero and the approved light palette', () => {
  assert.match(markup, /class="entry-title"/)
  assert.match(markup, /class="brand-mark"/)
  assert.doesNotMatch(markup, /<\/?(?:h[1-6]|br|p|div)(?:\s|\/?>)/i)
  assert.match(styles, /#f5f8f4/i)
  assert.match(styles, /#238b68/i)
  assert.doesNotMatch(styles, /#071b2e/i)
})

test('each main view exposes the same core information as the web reference', () => {
  for (const name of ['court-card', 'next-card', 'quick-stats', 'schedule-row', 'ranking-hero', 'ranking-row', 'admin-panel', 'bottom-nav']) {
    assert.match(markup, new RegExp(`class="[^"]*${name}`), `missing ${name}`)
  }
  assert.match(markup, /\{\{currentRound\.team1\}\}/)
  assert.match(markup, /\{\{currentRound\.team2\}\}/)
})

test('every static WXML class has a matching WXSS rule', () => {
  const classes = new Set([...markup.matchAll(/class="([^"]+)"/g)]
    .flatMap(match => match[1].replace(/\{\{.*?\}\}/g, '').split(/\s+/))
    .filter(name => name && !name.endsWith('-')))
  for (const name of classes) {
    assert.ok(allStyles.includes(`.${name}`), `missing styles for ${name}`)
  }
  for (let index = 0; index < 5; index += 1) {
    assert.ok(allStyles.includes(`.avatar-${index}`))
  }
})

test('mini program retains the desktop reference palette', () => {
  const desktop = fs.readFileSync(path.join(root, '../frontend/src/styles.css'), 'utf8')
  for (const name of ['ink', 'muted', 'line', 'paper', 'green', 'green-dark', 'orange', 'blue']) {
    const color = desktop.match(new RegExp(`--${name}:\\s*(#[0-9a-f]+)`, 'i'))[1]
    assert.ok(allStyles.includes(color), `missing reference color ${name}: ${color}`)
  }
  assert.doesNotMatch(allStyles, /#071b2e/i)
  const component = fs.readFileSync(path.join(root, '../frontend/src/App.vue'), 'utf8')
  const avatarColors = component.match(/avatarColor\(index\)\s*\{ return \[([^\]]+)\]/)[1]
  for (const [index, color] of [...avatarColors.matchAll(/#[0-9a-f]{6}/gi)].entries()) {
    assert.match(declarations(`.avatar-${index}`), new RegExp(color[0], 'i'))
  }
})

test('native controls and inline text receive explicit layout resets', () => {
  assert.match(declarations('button'), /margin:\s*0/)
  assert.match(declarations('button'), /line-height:\s*1\.4/)
  assert.match(declarations('button::after'), /border:\s*0/)
  for (const selector of ['.entry-copy', '.team-names', '.score-hint', '.stat-value', '.player-name', '.modal-matchup']) {
    assert.match(declarations(selector), /display:\s*(?:block|flex)/, selector)
  }
  assert.match(declarations('.team'), /min-width:\s*0/)
  assert.match(declarations('.player-name-input'), /min-width:\s*0/)
})

test('navigation and modal account for the phone safe area', () => {
  for (const selector of ['.content', '.bottom-nav', '.edit-modal']) {
    assert.match(declarations(selector), /env\(safe-area-inset-bottom\)/, selector)
  }
  assert.match(declarations('.bottom-nav'), /display:\s*flex/)
  assert.match(declarations('.bottom-nav .nav-item'), /flex:\s*1/)
  assert.match(declarations('.edit-modal'), /overflow-y:\s*auto/)
})

test('button widths override WeChat v2 default selector specificity', () => {
  assert.match(declarations('.primary-button.full-button'), /width:\s*100%/)
  assert.match(declarations('.topbar .icon-button'), /width:\s*40px/)
  for (const selector of ['.filter-tabs .filter-tab', '.player-row .remove-button', '.modal-top .close-button']) {
    assert.match(declarations(selector), /width:\s*auto/, selector)
  }
})
