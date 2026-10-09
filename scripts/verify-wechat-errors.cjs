const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const project = path.resolve(__dirname, '..')
const output = path.join(project, 'docs/verification')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-error-check-'))
function tool(name, options = {}) {
  const args = [path.join(__dirname, 'wechat-cloud-tool.cjs'), name, '--project', project]
  for (const [key, value] of Object.entries(options)) {
    if (key === 'args') {
      const file = path.join(temporary, 'args.json')
      fs.writeFileSync(file, JSON.stringify(value)); args.push('--args-file', file)
    } else args.push('--' + key, String(value))
  }
  const text = execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 55000 })
  const response = JSON.parse(text.slice(text.indexOf('{')))
  assert.equal(response.ok, true, text)
  assert.notEqual(response.result?.success, false, text)
  return response.result
}
const evaluate = (fn, ...args) => tool('automation_evaluate', { 'fn-source': fn.toString(), args }).result.result
const data = () => tool('automation_page_action', { action: 'getData', wait: 1 }).data
let prepared = false
try {
  evaluate(function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    if (page._rosterSavePending || page.data.scheduleBusy) throw new Error('Wait for real edits to finish first')
    const initial = { ...page.data }
    delete initial.pollTimer; delete initial.__webviewId__
    page.__errorCheckBackup = { data: initial, call: page.call, drafts: page._scoreDraftFields, polling: !!page.data.pollTimer }
    page.stopPolling()
    page.__errorCheckCause = 'cloud.callFunction:fail Error: errCode: -504002 functions execute fail | errMsg: Error: 至少需要 4 名正常球员 at fail (/var/user/index.js:9:32) at exports.main (/var/user/index.js:83:29) at processTicksAndRejections (node:internal/process/task_queues:96:5) 更多错误信息请访问：https://docs.cloudbase.net/error-code/basic/FUNCTIONS_EXECUTE_FAIL (callId: 123456) (trace: system error, abort)'
    page.__errorCheckCalls = []
    page.call = async function(action, payload) {
      this.__errorCheckCalls.push({ action, ...payload })
      throw { errMsg: this.__errorCheckCause }
    }
    page.applySnapshot({ id: 'error-check-local-only', name: '友好提示验证', inviteCode: '123456', revision: 1, players: [], rounds: [], ranking: [] })
    page.setData({ screen: 'admin', isCreator: true, error: '', notice: '上次排赛成功' })
    return { prepared: true }
  })
  prepared = true
  tool('automation_element_action', { action: 'tap', selector: '.admin-panel .primary-button', 'wait-for-selector': '.admin-panel' })
  const insufficient = data()
  assert.equal(insufficient.error, '至少需要 4 名参赛球员，请先添加或恢复球员后再排赛')
  assert.equal(insufficient.notice, '')
  assert.equal(insufficient.scheduleBusy, false)
  const nativeText = tool('automation_element_action', { action: 'text', selector: '.error-message' })
  assert.equal(nativeText, insufficient.error)
  assert.doesNotMatch(nativeText, /errCode|var\/user|callId|https|stack|cloud\.callFunction/)
  tool('automation_viewport_action', { action: 'pageScrollTo', 'scroll-top': 0 })
  tool('simulator_screenshot', { path: path.join(output, 'wechat-friendly-error.jpg'), 'wait-for-selector': '.error-message' })
  evaluate(async function() {
    const page = getCurrentPages()[getCurrentPages().length - 1]
    page.__errorCheckCause = 'Unexpected private database exception at /var/user/index.js:42'
    await page.generateSchedule()
    return { tested: true }
  })
  const unknown = data()
  assert.equal(unknown.error, '操作未完成，请稍后重试')
  const report = { verifiedAt: new Date().toISOString(), cloudRequestsMocked: true, realCloudWrites: 0,
    insufficientPlayers: nativeText, unknownError: unknown.error, clearsOldNotice: true, controlsUnlocked: true,
    screenshot: 'wechat-friendly-error.jpg' }
  fs.writeFileSync(path.join(output, 'wechat-friendly-error-result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (prepared) evaluate(function() {
    const page = getCurrentPages()[getCurrentPages().length - 1], backup = page.__errorCheckBackup
    page.stopPolling(); page.call = backup.call; page._scoreDraftFields = backup.drafts
    page.setData({ ...backup.data, pollTimer: null })
    delete page.__errorCheckBackup; delete page.__errorCheckCause; delete page.__errorCheckCalls
    if (backup.polling && backup.data.match) page.startPolling()
    return { restored: true }
  })
  const argsFile = path.join(temporary, 'args.json')
  if (fs.existsSync(argsFile)) fs.unlinkSync(argsFile)
  fs.rmdirSync(temporary)
}
