const fs = require('node:fs')
const { performance } = require('node:perf_hooks')
const { buildSchedule } = require('../cloudfunctions/match/scheduler.cjs')
const { analyze, rng, ids } = require('./audit-scheduler.cjs')
const fixtures = require('../tests/fixtures/extension-history.cjs')
const report = { generatedAt:new Date().toISOString(), seedCount:Number(process.argv[2])||2, distributions:0,cases:0,failures:[],diversity:[],bySize:{},maxTimeMs:0 }
for(let n=6;n<=9;n++) {
  let cases=0
  for(let h=0;h<=n;h++) for(let m=0;m<=n-h;m++) for(let x=0;x<=n-h-m;x++) {
    const levels='H'.repeat(h)+'M'.repeat(m)+'X'.repeat(x)+'L'.repeat(n-h-m-x)
    const players=[...levels].map((level,i)=>({id:i+1,level}))
    report.distributions++
    for(let seed=1;seed<=report.seedCount;seed++) {
      let history
      try { history=buildSchedule({players,roundCount:15,random:rng(seed)}) }
      catch(error) { report.failures.push({levels,seed,phase:'initial',error:error.message});continue }
      for(let batch=1;batch<=2;batch++) {
        report.cases++;cases++
        const before=JSON.stringify(history),start=performance.now()
        try {
          const added=buildSchedule({players,previousRounds:history,roundCount:5,random:rng(seed+batch*31)})
          const elapsed=performance.now()-start
          report.maxTimeMs=Math.max(report.maxTimeMs,elapsed)
          const full=history.concat(added),metrics=analyze(players,full),errors=[]
          if(added.length!==5||JSON.stringify(history)!==before) errors.push('length/history')
          if(added.some(r=>new Set(ids(r)).size!==4)) errors.push('players')
          if(metrics.spread>1) errors.push('quotas')
          if(metrics.maxStreak>2) errors.push('streak')
          if(metrics.maxRest>(n<8?2:3)) errors.push('rest')
          if(metrics.maxRestAfterDouble>2) errors.push('rest after double')
          if(metrics.unbalancedSplits) errors.push('team balance')
          if(added.some((r,i)=>ids(r).filter(id=>ids(i?added[i-1]:history.at(-1)).includes(id)).length>2)) errors.push('overlap')
          if(elapsed>2000) errors.push('cloud execution budget')
          if(errors.length) report.failures.push({levels,seed,batch,errors,metrics,elapsed})
          history=full
        } catch(error) { report.failures.push({levels,seed,batch,error:error.message});break }
      }
    }
  }
  report.bySize[n]=cases
  console.log(JSON.stringify({size:n,cases,failures:report.failures.length,maxTimeMs:Math.round(report.maxTimeMs)}))
}
const key=team=>[...team].sort((a,b)=>a-b).join(',')
for(const {levels,history} of fixtures) {
  const players=[...levels].map((level,i)=>({id:i+1,level}))
  const previousRounds=history.map(([p1,p2,p3,p4])=>({p1,p2,p3,p4}))
  const plans=new Set(),groupPlans=new Set();let maxRepeats=0,minCoverage=99
  for(let seed=1;seed<=24;seed++) {
    const added=buildSchedule({players,previousRounds,roundCount:5,random:rng(seed)})
    plans.add(added.map(r=>[key([r.p1,r.p2]),key([r.p3,r.p4])].sort().join('|')).join(';'))
    groupPlans.add(added.map(r=>key(ids(r))).join(';'))
    const metrics=analyze(players,previousRounds.concat(added))
    maxRepeats=Math.max(maxRepeats,metrics.repeatedFixtures)
    minCoverage=Math.min(minCoverage,...metrics.partnerCoverage)
  }
  report.diversity.push({levels,seeds:24,realPlans:plans.size,groupPlans:groupPlans.size,maxRepeats,minCoverage})
}
fs.writeFileSync('docs/verification/scheduler-extension-audit.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({distributions:report.distributions,cases:report.cases,failures:report.failures.length,maxTimeMs:Math.round(report.maxTimeMs),diversity:report.diversity}))
if(report.failures.length) process.exitCode=1
