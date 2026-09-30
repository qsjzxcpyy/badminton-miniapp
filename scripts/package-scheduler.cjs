const fs = require('node:fs')
const source = fs.readFileSync('frontend/src/scheduler.js', 'utf8').replaceAll('export function ', 'function ')
fs.writeFileSync('cloudfunctions/match/scheduler.cjs', `${source}\nmodule.exports = { buildSchedule, isLegalGroup }\n`)
console.log('scheduler packaged')
