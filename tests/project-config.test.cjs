const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const test = require('node:test')

const project = resolve(__dirname, '..')
const config = JSON.parse(readFileSync(join(project, 'project.config.json'), 'utf8'))

test('developer tools resolves app.json and all declared pages under the mini program root', () => {
  assert.ok(config.miniprogramRoot, 'miniprogramRoot is required when app.json is not at project root')
  const root = resolve(project, config.miniprogramRoot)
  assert.ok(existsSync(join(root, 'app.json')), `missing ${join(root, 'app.json')}`)
  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'))
  for (const page of app.pages) {
    for (const extension of ['js', 'wxml', 'wxss', 'json']) {
      assert.ok(existsSync(join(root, `${page}.${extension}`)), `missing ${page}.${extension}`)
    }
  }
})

test('developer tools resolves the cloud function source', () => {
  assert.ok(config.cloudfunctionRoot, 'cloudfunctionRoot is required when cloud functions are outside mini program root')
  assert.ok(existsSync(resolve(project, config.cloudfunctionRoot, 'match', 'index.js')))
})
