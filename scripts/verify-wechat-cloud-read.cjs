const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const project = path.resolve(__dirname, '..')
const matchId = process.argv[2]
if (!matchId) throw new Error('Pass an existing match ID for the read-only check')
const fn = async function(matchId) {
  const response = await wx.cloud.callFunction({ name: 'match', data: { action: 'getMatch', matchId } })
  const r = response.result || {}
  return { ok: r.ok === true, requestId: response.requestID, revision: r.match && r.match.revision,
    playerCount: r.match && r.match.players.length, roundCount: r.match && r.match.rounds.length, error: r.error || null }
}
const argsFile = path.join(project, 'docs/verification/wechat-cloud-read-args.json')
fs.writeFileSync(argsFile, JSON.stringify([matchId]))
const text = execFileSync(process.execPath, [path.join(__dirname, 'wechat-cloud-tool.cjs'), 'automation_evaluate',
  '--project', project, '--fn-source', fn.toString(), '--args-file', argsFile], { encoding: 'utf8', timeout: 55000 })
const result = JSON.parse(text.slice(text.indexOf('{')))
assert.equal(result.ok, true, text)
assert.equal(result.result.success, true, text)
const read = result.result.result.result
assert.equal(read.ok, true, text)
fs.writeFileSync(path.join(project, 'docs/verification/wechat-cloud-read-result.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), action: 'getMatch', function: 'match', env: 'cloud1-d0gwahv5k7b959610', ...read }, null, 2) + '\n')
console.log(JSON.stringify(read, null, 2))
