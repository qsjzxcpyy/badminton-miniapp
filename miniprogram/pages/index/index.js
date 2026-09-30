const config = require('../../config')
const LEVELS = ['H', 'M', 'X', 'L']
Page({
  data: { levels:['高','中','次中','低'], screen:'entry', entryMode:'join', inviteCode:'', createName:'羽毛球友谊赛', createInvite:'', error:'', notice:'', match:null, isCreator:false, currentRound:null, nextRound:null, players:[], adminPlayers:[], rounds:[], ranking:[], score1:'', score2:'', editingRound:null, editScore1:'', editScore2:'', newPlayerName:'', newPlayerLevel:'M', pollTimer:null },
  onLoad(options) { if (options && options.inviteCode) this.setData({ inviteCode:String(options.inviteCode) }) },
  onShow() { if (this.data.match) { this.refresh(); this.startPolling() } },
  onHide() { this.stopPolling() },
  onUnload() { this.stopPolling() },
  call(action, payload = {}) {
    if (!wx.cloud || !config.envId || config.envId.includes('请填写')) return Promise.reject(new Error('请先在 miniprogram/config.js 填写云开发环境 ID'))
    return wx.cloud.callFunction({ name:'match', data:{ action, ...payload } }).then(response => { const result = response.result || {}; if (!result.ok) throw new Error(result.error || '操作失败'); return result })
  },
  onInput(e) { this.setData({ [e.currentTarget.dataset.field]:e.detail.value, error:'' }) },
  chooseEntry(e) { this.setData({ entryMode:e.currentTarget.dataset.mode, error:'' }) },
  enterMatch() { this.call('joinMatch', { inviteCode:String(this.data.inviteCode).trim() }).then(result => this.acceptSnapshot(result)).catch(error => this.showError(error)) },
  createMatch() { this.call('createMatch', { name:this.data.createName, inviteCode:String(this.data.createInvite).trim() }).then(result => this.acceptSnapshot(result, true)).catch(error => this.showError(error)) },
  acceptSnapshot(result, forceAdmin = false) { this.applySnapshot(result.match); this.setData({ isCreator:forceAdmin || result.isCreator, screen:forceAdmin || result.isCreator ? 'admin' : 'match', error:'', notice:forceAdmin ? '比赛已创建，你可以添加球员' : '已进入比赛' }); this.startPolling() },
  applySnapshot(snapshot) {
    const players = (snapshot.players || []).map(player => ({ ...player, levelIndex:LEVELS.indexOf(player.level) }))
    const name = id => (players.find(player => player.id === id) || {}).name || '待定'
    const rounds = (snapshot.rounds || []).map(round => ({ ...round, team1:[name(round.p1), name(round.p2)].join(' / '), team2:[name(round.p3), name(round.p4)].join(' / ') }))
    const currentRound = rounds.find(round => round.status === 'active') || null
    const currentIndex = currentRound ? rounds.findIndex(round => round.id === currentRound.id) : -1
    this.setData({ match:snapshot, players, adminPlayers:players.filter(player => player.status !== 'withdrawn'), rounds, ranking:snapshot.ranking || [], currentRound, nextRound:currentIndex >= 0 ? rounds[currentIndex + 1] || null : null, score1:currentRound && currentRound.score1 !== null ? String(currentRound.score1) : '', score2:currentRound && currentRound.score2 !== null ? String(currentRound.score2) : '' })
  },
  refresh() { if (this.data.match) this.call('getMatch', { matchId:this.data.match.id }).then(result => this.applySnapshot(result.match)).catch(() => {}) },
  startPolling() { this.stopPolling(); this.data.pollTimer = setInterval(() => this.refresh(), 5000) },
  stopPolling() { if (this.data.pollTimer) { clearInterval(this.data.pollTimer); this.data.pollTimer = null } },
  switchScreen(e) { this.setData({ screen:e.currentTarget.dataset.screen }); if (e.currentTarget.dataset.screen === 'admin') this.refresh() },
  submitScore() { if (this.data.currentRound) this.saveScore(this.data.currentRound.id, this.data.score1, this.data.score2) },
  saveScore(roundId, score1, score2) { const a=Number(score1); const b=Number(score2); if (!Number.isInteger(a) || !Number.isInteger(b) || a<0 || b<0) return this.showError(new Error('比分必须是非负整数')); this.call('saveScore', { matchId:this.data.match.id, roundId, score1:a, score2:b }).then(result => { this.applySnapshot(result.match); this.setData({ editingRound:null, notice:'比分已保存，排名已更新' }) }).catch(error => this.showError(error)) },
  openEdit(e) { const round=this.data.rounds.find(item => String(item.id)===String(e.currentTarget.dataset.id)); if (round && round.status==='completed') this.setData({ editingRound:round, editScore1:String(round.score1), editScore2:String(round.score2) }) },
  closeEdit() { this.setData({ editingRound:null }) },
  noop() {},
  saveEdit() { this.saveScore(this.data.editingRound.id, this.data.editScore1, this.data.editScore2) },
  addPlayer() { const name=String(this.data.newPlayerName).trim(); if (!name) return; const players=this.data.players.slice(); if (players.some(player => player.name===name && player.status!=='withdrawn')) return this.showError(new Error('球员姓名不能重复')); const withdrawn=players.find(player => player.name===name && player.status==='withdrawn'); if (withdrawn) { withdrawn.status='active'; withdrawn.level=this.data.newPlayerLevel } else players.push({ id:Date.now()+players.length, name, level:this.data.newPlayerLevel, status:'active' }); this.setData({ players, newPlayerName:'' }); this.savePlayers(players) },
  changeNewLevel(e) { this.setData({ newPlayerLevel:LEVELS[Number(e.detail.value)] || 'M' }) },
  changePlayer(e) { const players=this.data.players.slice(); const player=players.find(item => String(item.id)===String(e.currentTarget.dataset.id)); if (!player) return; if (e.currentTarget.dataset.field==='level') player.level=LEVELS[Number(e.detail.value)] || player.level; else player.name=e.detail.value; this.setData({ players }) },
  savePlayerEdits() { this.savePlayers(this.data.players) },
  removePlayer(e) { const players=this.data.players.slice(); const player=players.find(item => String(item.id)===String(e.currentTarget.dataset.id)); if (!player) return; const scheduled=this.data.rounds.some(round => [round.p1,round.p2,round.p3,round.p4].includes(player.id)); if (scheduled) player.status=player.status==='withdrawn'?'active':'withdrawn'; else players.splice(players.indexOf(player),1); this.setData({ players }); this.savePlayers(players) },
  savePlayers(players=this.data.players) { this.call('savePlayers', { matchId:this.data.match.id, revision:this.data.match.revision, players }).then(result => { this.applySnapshot(result.match); this.setData({ notice:'名单已保存' }) }).catch(error => this.showError(error)) },
  saveDefaultRoster() { this.call('saveDefaultRoster', { matchId:this.data.match.id, players:this.data.players }).then(result => { this.applySnapshot(result.match); this.setData({ notice:'默认名单已保存，下次创建比赛会自动带入' }) }).catch(error => this.showError(error)) },
  generateSchedule() { this.call('generateSchedule', { matchId:this.data.match.id, revision:this.data.match.revision, roundCount:15 }).then(result => { this.applySnapshot(result.match); this.setData({ notice:'赛程已生成，已按局数、休息和随机性排场' }) }).catch(error => this.showError(error)) },
  extendSchedule() { this.call('extendSchedule', { matchId:this.data.match.id, revision:this.data.match.revision, count:5 }).then(result => { this.applySnapshot(result.match); this.setData({ notice:'已追加 5 局，历史比分和排名保留' }) }).catch(error => this.showError(error)) },
  levelName(level) { return ({ H:'高', M:'中', X:'次中', L:'低' })[level] || '' },
  showError(error) { this.setData({ error:error.message || '操作失败' }) }
})








