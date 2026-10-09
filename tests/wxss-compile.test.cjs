const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const test = require('node:test')

const root = resolve(__dirname, '..', 'miniprogram')
for (const file of ['app.wxss', 'pages/index/index.wxss']) {
  test(`${file} starts with WXSS source instead of a UTF-8 BOM`, () => {
    const source = readFileSync(join(root, file))
    assert.notDeepEqual([...source.subarray(0, 3)], [0xef, 0xbb, 0xbf],
      `The WeChat WXSS compiler rejects a UTF-8 BOM at ${file}:1:1`)
  })
}
