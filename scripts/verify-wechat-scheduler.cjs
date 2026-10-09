const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { buildSchedule } = require('../cloudfunctions/match/scheduler.cjs')
const { analyze, rng } = require('./audit-scheduler.cjs')
const project = path.resolve(__dirname, '..')
const devtools = process.argv[2]
if (!devtools) throw new Error('Pass the WeChat DevTools installation directory')
const executable = path.join(devtools, '微信开发者工具.exe')
const entry = path.join(devtools, 'resources/app.asar.unpacked/js/common/cli/skill-index.js')
const bootstrap = "const entry = process.argv[1]; process.argv = [process.execPath, entry, '--electron', ...process.argv.slice(2)]; require(entry)"
const directory = path.join(project, 'docs/verification')
fs.mkdirSync(directory, { recursive:true })
function tool(name, options={}) {
  const args = ['-e', bootstrap, entry, '-c', 'Codex', name, '--project', project]
  for (const [key,value] of Object.entries(options)) {
    if(key==='args') {
      const argsFile=path.join(directory,'wechat-tool-args.json')
      fs.writeFileSync(argsFile,JSON.stringify(value))
      args.push('--args-file',argsFile)
    } else args.push(`--${key}`, typeof value==='object'?JSON.stringify(value):String(value))
  }
  const text = execFileSync(executable,args,{encoding:'utf8',timeout:45000,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',cwd:project}})
  const result=JSON.parse(text.slice(text.indexOf('{')))
  assert.equal(result.ok,true,text); assert.notEqual(result.result?.success,false,text)
  return result.result
}
const pageCall=(method,...args)=>evaluate(function(method,args) { const pages=getCurrentPages(); return pages[pages.length-1][method](...args) },method,args)
const evaluate=(fn,...args)=>tool('automation_evaluate',{'fn-source':fn.toString(),args}).result.result
const data=()=>tool('automation_page_action',{action:'getData'}).data
const initial=data()
const levels=['H','H','M','M','M','X','L','L']
const players=levels.map((level,i)=>({id:i+1,name:`P${i+1}`,level,status:'active'}))
const rounds=buildSchedule({players,roundCount:15,random:rng(17)}).map((round,i)=>({...round,id:i+1,seq:i+1,status:i===0?'active':'pending',score1:null,score2:null}))
const snapshot={id:'local-scheduler-verification',name:'排赛算法验证',revision:0,players,rounds,ranking:[]}
try {
  pageCall('stopPolling')
  tool('simulator_refresh')
  tool('automation_page_action',{action:'getData',wait:1})
  evaluate(function(snapshot) {
    const page=getCurrentPages()[getCurrentPages().length-1]
    page.stopPolling()
    page.__schedulerOriginalCall=page.call
    page.__schedulerFixture=snapshot
    page.__schedulerActions=[]
    page.call=function(action,payload) {
      this.__schedulerActions.push(action)
      if(['savePlayers','generateSchedule','extendSchedule'].includes(action)) {
        if(payload.revision!==this.__schedulerFixture.revision) return Promise.reject(new Error('stale verification revision'))
        this.__schedulerFixture={...this.__schedulerFixture,revision:this.__schedulerFixture.revision+1}
      }
      if(action==='savePlayers') this.__schedulerFixture.players=payload.players
      return Promise.resolve({ok:true,match:this.__schedulerFixture})
    }
    page.applySnapshot(snapshot)
    page.setData({screen:'admin',isCreator:true,error:'',notice:''})
    return {players:page.data.players.length}
  },snapshot)
  pageCall('changeNewLevel',{detail:{value:'3'}})
  let state=data()
  assert.equal(state.newPlayerLevel,'L'); assert.equal(state.newPlayerLevelIndex,3); assert.equal(state.newPlayerLevelLabel,'低')
  assert.match(tool('automation_element_action',{action:'text',selector:'.new-level'}),/低/)
  pageCall('changePlayer',{currentTarget:{dataset:{id:players[0].id,field:'level'}},detail:{value:'2'}})
  state=data()
  assert.equal(state.players[0].level,'X');assert.equal(state.adminPlayers[0].levelLabel,'次中');assert.equal(state.adminPlayers[0].levelIndex,2)
  assert.match(tool('automation_element_action',{action:'text',selector:'.player-level'}),/次中/)
  tool('simulator_screenshot',{path:path.join(directory,'wechat-level-picker.jpg'),'wait-for-selector':'.player-level'})
  const actions=evaluate(function(){return getCurrentPages()[getCurrentPages().length-1].__schedulerActions})
  assert.ok(JSON.stringify(actions).includes('savePlayers'),'level changes must persist automatically')
  evaluate(async function() {
    const page=getCurrentPages()[getCurrentPages().length-1]
    const originalMock=page.call, calls=[]
    let releaseSave
    page.call=function(action,payload) {
      calls.push({action,revision:payload.revision})
      if(action==='savePlayers') return new Promise((resolve,reject)=>{
        releaseSave=()=>originalMock.call(this,action,payload).then(resolve,reject)
      })
      return originalMock.call(this,action,payload)
    }
    try {
      const saving=page.changePlayer({currentTarget:{dataset:{id:8,field:'level'}},detail:{value:'2'}})
      const generating=page.generateSchedule()
      await new Promise(resolve=>setTimeout(resolve,0))
      const waited=calls.filter(c=>c.action==='generateSchedule').length===0
      if(!releaseSave) throw new Error('save handler did not start')
      releaseSave(); await saving; await generating
      page.__schedulerSaveOrdering={waited,calls,level:page.data.players.find(p=>p.id===8).level,revision:page.data.match.revision,error:page.data.error}
    } finally { page.call=originalMock }
  })
  tool('automation_page_action',{action:'getData',wait:1})
  const saveOrdering=evaluate(function(){return getCurrentPages()[getCurrentPages().length-1].__schedulerSaveOrdering})
  assert.equal(saveOrdering.waited,true)
  assert.deepEqual(saveOrdering.calls.map(c=>c.action),['savePlayers','generateSchedule'])
  assert.equal(saveOrdering.calls[1].revision,saveOrdering.calls[0].revision+1)
  assert.equal(saveOrdering.level,'X');assert.equal(saveOrdering.error,'')
  evaluate(function(snapshot){getCurrentPages()[getCurrentPages().length-1].__schedulerFixture=snapshot},snapshot)
  pageCall('applySnapshot',snapshot)
  pageCall('setData',{screen:'match'})
  tool('automation_element_action',{action:'tap',selector:'.nav-item[data-screen="schedule"]'})
  state=data();assert.equal(state.screen,'schedule');assert.equal(state.rounds.length,15)
  assert.match(tool('automation_element_action',{action:'text',selector:'.count-chip'}),/15/, 'rendered schedule count must match the populated rows')
  assert.equal(state.filteredRoundCount,15)
  const metrics=analyze(players,state.rounds)
  assert.ok(metrics.spread<=1);assert.ok(metrics.maxStreak<=2);assert.equal(metrics.openingOverlap,0)
  assert.equal(metrics.fallbackRounds,0)
  assert.ok(metrics.highMiddleCoverage.every(partners=>partners.length===3))
  tool('simulator_screenshot',{path:path.join(directory,'wechat-scheduler.jpg'),'wait-for-selector':'.schedule-row'})
  tool('automation_element_action',{action:'tap',selector:'.filter-tab[data-filter="completed"]'})
  assert.equal(data().filteredRoundCount,0)
  tool('automation_element_action',{action:'tap',selector:'.filter-tab[data-filter="all"]'})
  assert.equal(data().filteredRoundCount,15)
  fs.writeFileSync(path.join(directory,'wechat-scheduler-result.json'),JSON.stringify({verifiedAt:new Date().toISOString(),levelPicker:true,levelAutoSave:true,levelSaveBeforeGeneration:saveOrdering,scheduleCountAndFilter:true,scheduleRows:state.rounds.length,metrics,cloudCallsMocked:true},null,2)+'\n')
  console.log(JSON.stringify({levelPicker:'PASS',levelAutoSave:'PASS',levelSaveBeforeGeneration:'PASS',scheduleRows:15,metrics,output:directory}))
} finally {
  evaluate(function(initial) {
    const page=getCurrentPages()[getCurrentPages().length-1]
    page.stopPolling()
    if(page.__schedulerOriginalCall) page.call=page.__schedulerOriginalCall
    delete page.__schedulerOriginalCall;delete page.__schedulerFixture;delete page.__schedulerActions;delete page.__schedulerSaveOrdering
    delete initial.pollTimer;delete initial.__webviewId__
    page.setData({...initial,pollTimer:null})
    if(initial.match) page.startPolling()
    return {restored:true}
  },initial)
  const argsFile=path.join(directory,'wechat-tool-args.json')
  if(fs.existsSync(argsFile)) fs.unlinkSync(argsFile)
}
