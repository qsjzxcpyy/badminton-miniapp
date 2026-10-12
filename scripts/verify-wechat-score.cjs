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
    if (['args', 'detail', 'result'].includes(key)) {
      const file = path.join(temporary, 'args.json')
      fs.writeFileSync(file, JSON.stringify(value))
      args.push('--' + key + '-file', file)
    } else args.push('--' + key, String(value))
  }
  const text = execFileSync(process.execPath, args, { encoding:'utf8', timeout:55000 })
  const response = JSON.parse(text.slice(text.indexOf('{')))
  assert.equal(response.ok, true, text)
  assert.notEqual(response.result?.success, false, text)
  return response.result
}
const data = (wait = 0) => tool('automation_page_action', { action:'getData', wait }).data
const setData = patch => tool('automation_page_action', { action:'setData', patch:JSON.stringify(patch) })
const input = (field, value) => tool('automation_element_action', {
  selector:'.score-input[data-field="' + field + '"]', 'wait-for-selector':'.scoreboard',
  // Empty native input needs an explicit input event in DevTools.
  ...(value === '' ? { action:'trigger', type:'input', detail:{value:''} } : { action:'input', value })
})
const tap = selector => tool('automation_element_action', { selector, action:'trigger', type:'tap' })
const fixture = { id:'score-check-local-only', name:'比分输入回归', revision:1,
  players:[1,2,3,4].map(id => ({ id, name:'测试球友' + id, level:'M', status:'active' })), ranking:[],
  rounds:[1,2].map(id => ({ id, seq:id, p1:1, p2:2, p3:3, p4:4,
    status:id === 1 ? 'active' : 'pending', score1:null, score2:null })) }
const mockMatch = match => tool('automation_wx_api', {
  action:'mock', method:'cloud.callFunction', result:{result:{ok:true,match,isCreator:false}}
})
let originalData
let nativeMocked = false
let prepared = false
try {
  originalData = data()
  // This verifier enters through the real native join button so lifecycle,
  // score drafts and the poll timer all run in the same UI context.
  assert.equal(originalData.match, null, 'Run score verification from the entry screen after compiling')
  delete originalData.pollTimer; delete originalData.__webviewId__
  mockMatch(fixture)
  nativeMocked = true
  prepared = true
  setData({ screen:'entry', entryMode:'join', inviteCode:'246810', error:'', notice:'' })
  tap('.entry-form-card .primary-button')
  assert.equal(data(1).currentRound.id, 1)
  input('score1', '21'); input('score2', '18')
  // A server-owned field must revert after the actual five-second native poll;
  // this proves refresh happened while both input drafts remained intact.
  const beforePoll = data()
  setData({ match:{ ...beforePoll.match, name:'等待原生轮询' } })
  const afterPoll = data(6)
  assert.equal(afterPoll.match.name, fixture.name, 'native five-second poll must refresh the snapshot')
  assert.equal(afterPoll.score1, '21'); assert.equal(afterPoll.score2, '18')
  const actualA = tool('automation_element_action', { action:'value', selector:'.score-input[data-field="score1"]' })
  const actualB = tool('automation_element_action', { action:'value', selector:'.score-input[data-field="score2"]' })
  assert.equal(String(actualA), '21'); assert.equal(String(actualB), '18')
  tool('simulator_screenshot', { path:path.join(output,'wechat-score-draft.jpg'), 'wait-for-selector':'.scoreboard' })
  input('score2', '')
  const cleared = data()
  assert.equal(cleared.score1, '21'); assert.equal(cleared.score2, '')
  data(6)
  tap('.submit-score')
  const blank = data(1)
  assert.equal(blank.score1, '21'); assert.equal(blank.score2, '')
  assert.match(blank.error, /请填写双方比分/)
  input('score2', '18')
  tool('automation_wx_api', { action:'mock', method:'cloud.callFunction', result:{result:{ok:false,error:'测试网络失败'}} })
  tap('.submit-score')
  const failed = data(6)
  assert.equal(failed.score1, '21'); assert.equal(failed.score2, '18')
  assert.equal(failed.error, '网络连接不稳定，请检查网络后重试')
  const saved = JSON.parse(JSON.stringify(fixture))
  saved.revision = 2
  Object.assign(saved.rounds[0], { status:'completed', score1:21, score2:18 })
  saved.rounds[1].status = 'active'
  mockMatch(saved)
  tap('.submit-score')
  const next = data(1)
  assert.equal(next.currentRound.id, 2); assert.equal(next.score1, ''); assert.equal(next.score2, '')
  input('score1', '21'); input('score2', '0')
  const zeroDraft = data(6)
  assert.deepEqual([zeroDraft.score1, zeroDraft.score2], ['21','0'])
  const completed = JSON.parse(JSON.stringify(saved))
  completed.revision = 3
  Object.assign(completed.rounds[1], { status:'completed', score1:21, score2:0 })
  mockMatch(completed)
  tap('.submit-score')
  const finished = data(1)
  assert.equal(finished.match.rounds[1].score1, 21)
  assert.equal(finished.match.rounds[1].score2, 0)
  assert.equal(finished.currentRound, null)
  const report = { verifiedAt:new Date().toISOString(), cloudCallsMocked:true, realCloudWrites:false,
    nativePollingObserved:true, typedScoresAfterPolling:[afterPoll.score1,afterPoll.score2],
    nativeInputValuesAfterPolling:[actualA,actualB], emptyInputEventTriggered:true, blankRejected:true,
    failurePreservesDraft:true, nextRoundClearsDraft:true, explicitZeroAccepted:true }
  fs.writeFileSync(path.join(output,'wechat-score-result.json'), JSON.stringify(report,null,2) + '\n')
  console.log(JSON.stringify(report,null,2))
} finally {
  try {
    if (prepared) {
      // Unload stops the native timer and clears private draft flags.
      tool('automation_navigate', { action:'reLaunch', url:'/pages/index/index' })
      setData(originalData)
    }
  } finally {
    if (nativeMocked) tool('automation_wx_api', { action:'restore', method:'cloud.callFunction' })
    const argsFile = path.join(temporary,'args.json')
    if (fs.existsSync(argsFile)) fs.unlinkSync(argsFile)
    fs.rmdirSync(temporary)
  }
}
