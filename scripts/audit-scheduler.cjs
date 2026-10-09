const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { buildSchedule, isLegalGroup } = require('../cloudfunctions/match/scheduler.cjs')
const ids = r => [r.p1,r.p2,r.p3,r.p4]
function rng(seed) { return () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296 } }
function analyze(players, rounds) {
  const counts = [], doubles = [], partners = {}, opponents = {}, quartets = {}, fixtures = {}
  let maxStreak = 0, maxRest = 0, maxRestAfterDouble = 0, openingOverlap = 0, unbalancedSplits = 0
  const weights = { H:3, M:2, X:1.5, L:1 }, weight = id => weights[players.find(p => p.id === id).level]
  const key = a => [...a].sort((a,b) => a-b).join(',')
  for (const p of players) {
    let count = 0, streak = 0, rest = 0, consecutive = 0, lastRun = 0
    for (const r of rounds) {
      if (ids(r).includes(p.id)) { count++; if (streak) consecutive++; streak++; rest=0 }
      else { if (streak) lastRun=streak; rest++; streak=0; if(lastRun>=2) maxRestAfterDouble=Math.max(maxRestAfterDouble,rest) }
      maxStreak=Math.max(maxStreak,streak); maxRest=Math.max(maxRest,rest)
    }
    counts.push(count); doubles.push(consecutive)
  }
  for (const r of rounds) {
    const a = ids(r), quartet = key(a), fixture = [key(a.slice(0,2)),key(a.slice(2))].sort().join('|')
    quartets[quartet]=(quartets[quartet]||0)+1; fixtures[fixture]=(fixtures[fixture]||0)+1
    for(const pair of [a.slice(0,2),a.slice(2)]) partners[key(pair)]=(partners[key(pair)]||0)+1
    for(const x of a.slice(0,2)) for(const y of a.slice(2)) opponents[key([x,y])]=(opponents[key([x,y])]||0)+1
    const gaps = [[a[0],a[1],a[2],a[3]],[a[0],a[2],a[1],a[3]],[a[0],a[3],a[1],a[2]]].map(s => Math.abs(weight(s[0])+weight(s[1])-weight(s[2])-weight(s[3])))
    if(gaps[0]!==Math.min(...gaps)) unbalancedSplits++
  }
  if(rounds.length>1) openingOverlap=ids(rounds[0]).filter(id=>ids(rounds[1]).includes(id)).length
  return { counts, spread:Math.max(...counts)-Math.min(...counts), doubles, doubleSpread:Math.max(...doubles)-Math.min(...doubles), maxStreak,maxRest,maxRestAfterDouble,openingOverlap,
    fallbackRounds:rounds.filter(r=>!isLegalGroup(ids(r),players)).length, unbalancedSplits,
    distinctQuartets:Object.keys(quartets).length, maxQuartetRepeat:Math.max(...Object.values(quartets)),
    repeatedFixtures:Object.values(fixtures).reduce((s,c)=>s+Math.max(0,c-1),0),
    partnerCoverage:players.map(p=>players.filter(other=>other.id!==p.id&&partners[key([p.id,other.id])]).length),
    opponentCoverage:players.map(p=>players.filter(other=>other.id!==p.id&&opponents[key([p.id,other.id])]).length),
    highMiddleCoverage:players.filter(p=>p.level==='H').map(p=>players.filter(m=>m.level==='M'&&partners[key([p.id,m.id])]).map(m=>m.id)) }
}
if (require.main === module) {
  const seedCount = Number(process.argv[2]) || 4
  const output = process.argv[3] || 'docs/verification/scheduler-audit.json'
  const report = { generatedAt: new Date().toISOString(), seedCount, distributions:0, cases:0, failures:[], samples:[], maxTimeMs:0, worst:{maxRest:0,maxStreak:0,maxDoubleSpread:0,maxRepeatedFixtures:0}, bySize:{}, worstBySize:{} }
  for(let n=6;n<=9;n++) {
    let sizeCases=0
    report.worstBySize[n]={maxRest:0,maxDoubleSpread:0,maxRepeatedFixtures:0}
    for(let h=0;h<=n;h++) for(let m=0;m<=n-h;m++) for(let x=0;x<=n-h-m;x++) {
      const levels='H'.repeat(h)+'M'.repeat(m)+'X'.repeat(x)+'L'.repeat(n-h-m-x)
      const players=[...levels].map((level,i)=>({id:i+1,level}))
      report.distributions++
      for(let seed=1;seed<=seedCount;seed++) {
        const start=performance.now()
        try {
          const rounds=buildSchedule({players,roundCount:15,random:rng(seed)})
          const metrics=analyze(players,rounds)
          const errors=[]
          if(rounds.length!==15||rounds.some(r=>new Set(ids(r)).size!==4)) errors.push('invalid rounds')
          if(metrics.spread>1) errors.push('quotas')
          if(metrics.maxStreak>2) errors.push('streak')
          if(metrics.maxRest>(n<8?2:3)) errors.push('rest')
          if(metrics.maxRestAfterDouble>2) errors.push('rest after double')
          if(rounds.some((r,i)=>i>0&&ids(r).filter(id=>ids(rounds[i-1]).includes(id)).length>2)) errors.push('overlap')
          if(n>=8&&metrics.openingOverlap) errors.push('opening')
          if(metrics.unbalancedSplits) errors.push('team balance')
          if(errors.length) report.failures.push({levels,seed,errors,metrics})
          report.worst.maxRest=Math.max(report.worst.maxRest,metrics.maxRest)
          report.worst.maxStreak=Math.max(report.worst.maxStreak,metrics.maxStreak)
          report.worst.maxDoubleSpread=Math.max(report.worst.maxDoubleSpread,metrics.doubleSpread)
          report.worst.maxRepeatedFixtures=Math.max(report.worst.maxRepeatedFixtures,metrics.repeatedFixtures)
          report.worstBySize[n].maxRest=Math.max(report.worstBySize[n].maxRest,metrics.maxRest)
          report.worstBySize[n].maxDoubleSpread=Math.max(report.worstBySize[n].maxDoubleSpread,metrics.doubleSpread)
          report.worstBySize[n].maxRepeatedFixtures=Math.max(report.worstBySize[n].maxRepeatedFixtures,metrics.repeatedFixtures)
          if(['MMMMMM','MMMMMMM','MMMMMMMM','MMMMMMMMM','HHMMMXLL','HHMMMXLLL'].includes(levels)) report.samples.push({levels,seed,metrics})
        } catch(error) { report.failures.push({levels,seed,error:error.message}) }
        report.maxTimeMs=Math.max(report.maxTimeMs,performance.now()-start)
        report.cases++; sizeCases++
      }
    }
    report.bySize[n]=sizeCases
    console.log(JSON.stringify({size:n,cases:sizeCases,failures:report.failures.length,maxTimeMs:Math.round(report.maxTimeMs)}))
  }
  fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({distributions:report.distributions,cases:report.cases,failures:report.failures.length,worst:report.worst,report:output}))
  if(report.failures.length) process.exitCode=1
}
module.exports={ analyze,rng,ids }
