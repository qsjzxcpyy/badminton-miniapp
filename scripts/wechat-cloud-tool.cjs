const { spawnSync } = require('node:child_process')
const path = require('node:path')
const devtools = 'D:/微信开发者工具/微信web开发者工具'
const entry = path.join(devtools, 'resources/app.asar.unpacked/js/common/cli/skill-index.js')
const bootstrap = "const entry = process.argv[1]; process.argv = [process.execPath, entry, '--electron', ...process.argv.slice(2)]; require(entry)"
const child = spawnSync(path.join(devtools, '微信开发者工具.exe'), ['-e', bootstrap, entry, '-c', 'Codex', ...process.argv.slice(2)], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 55000
})
if (child.stdout) process.stdout.write(child.stdout)
if (child.stderr) process.stderr.write(child.stderr)
if (child.error) { console.error(child.error.message); process.exitCode = 1 }
else process.exitCode = child.status ?? 1
