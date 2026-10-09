const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const root = resolve(__dirname, '..')
const config = require('../miniprogram/config.js')
const source = readFileSync(resolve(root, 'miniprogram/app.js'), 'utf8')

test('cloud initialization selects the supplied environment before page requests', () => {
  let app
  const calls = []
  vm.runInNewContext(source, {
    App: definition => { app = definition },
    require: () => config,
    wx: { cloud: { init: options => calls.push(options) } }
  })
  app.onLaunch()
  assert.equal(config.envId, 'YOUR_CLOUD_ENV_ID')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].env, config.envId)
  assert.equal(calls[0].traceUser, true)
  assert.equal(app.globalData.cloudReady, true)
})

test('unsupported clients do not crash during application launch', () => {
  let app
  vm.runInNewContext(source, {
    App: definition => { app = definition },
    require: () => config,
    wx: {}
  })
  assert.doesNotThrow(() => app.onLaunch())
  assert.equal(app.globalData.cloudReady, false)
})

test('cloud functions use the deployed environment rather than an unrelated default', () => {
  const source = readFileSync(resolve(root, 'cloudfunctions/match/index.js'), 'utf8')
  assert.match(source, /cloud\.init\(\{ env: cloud\.DYNAMIC_CURRENT_ENV \}\)/)
})

test('native navigation colors agree with the existing light interface', () => {
  const app = JSON.parse(readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8'))
  assert.equal(app.window.navigationBarBackgroundColor, '#f5f8f4')
  assert.equal(app.window.navigationBarTextStyle, 'black')
  assert.equal(app.window.backgroundColor, '#f5f8f4')
})
