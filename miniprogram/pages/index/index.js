const config = require('../../config')
const LEVELS = ['H', 'M', 'X', 'L']
const { decorateMatch, decoratePlayers, filterRounds } = require('./view-model')
const { friendlyErrorMessage } = require('./error-message')
Page({
  data: { scheduleBusy:false, scheduleAction:'', levels:['高','中','次中','低'], screen:'entry', entryMode:'join', inviteCode:'', createName:'羽毛球友谊赛', createInvite:'', error:'', notice:'', match:null, isCreator:false, currentRound:null, nextRound:null, players:[], adminPlayers:[], rounds:[], filteredRounds:[], playerCount:0, roundCount:0, filteredRoundCount:0, scheduleFilter:'all', rankingRows:[], rankingLeader:null, completedCount:0, ranking:[], score1:'', score2:'', editingRound:null, editScore1:'', editScore2:'', newPlayerName:'', newPlayerLevel:'M', newPlayerLevelIndex:1, newPlayerLevelLabel:'中', pollTimer:null },
  onLoad(options) { if (options && options.inviteCode) this.setData({ inviteCode:String(options.inviteCode) }) },
  onShow() { if (this.data.match) { this.refresh(); this.startPolling() } },
  onHide() { this.stopPolling() },
  onUnload() { this.stopPolling() },
  call(action, payload = {}) {
    if (!wx.cloud || !config.envId || config.envId.includes('请填写')) return Promise.reject(new Error('请先在 miniprogram/config.js 填写云开发环境 ID'))
    return wx.cloud.callFunction({ name:'match', data:{ action, ...payload } }).then(response => { const result = response.result || {}; if (!result.ok) throw new Error(result.error || '操作失败'); return result })
  },
  onInput(e) {
    const field = e.currentTarget.dataset.field
    if ((field === 'score1' || field === 'score2') && this.data.currentRound) {
      this._scoreDraftFields = { ...this._scoreDraftFields, [field]:true }
    }
    this.setData({ [field]:e.detail.value, error:'' })
  },
  chooseEntry(e) { this.setData({ entryMode:e.currentTarget.dataset.mode, error:'' }) },
  enterMatch() { this.call('joinMatch', { inviteCode:String(this.data.inviteCode).trim() }).then(result => this.acceptSnapshot(result)).catch(error => this.showError(error)) },
  createMatch() { this.call('createMatch', { name:this.data.createName, inviteCode:String(this.data.createInvite).trim() }).then(result => this.acceptSnapshot(result, true)).catch(error => this.showError(error)) },
  acceptSnapshot(result, forceAdmin = false) { this.applySnapshot(result.match); this.setData({ isCreator:forceAdmin || result.isCreator, screen:forceAdmin || result.isCreator ? 'admin' : 'match', error:'', notice:forceAdmin ? '比赛已创建，你可以添加球员' : '已进入比赛' }); this.startPolling() },
  applySnapshot(snapshot) {
    if (this.data.match && this.data.match.id === snapshot.id &&
      (snapshot.revision || 0) < (this.data.match.revision || 0)) return false
    const closedEditor = this.data.editingRound && (!this.data.match || this.data.match.id !== snapshot.id ||
      !(snapshot.rounds || []).some(round => round.id === this.data.editingRound.id))
    const view = decorateMatch(snapshot)
    const filteredRounds = filterRounds(view.rounds, this.data.scheduleFilter)
    const sameRound = this.data.match && this.data.match.id === snapshot.id &&
      this.data.currentRound && view.currentRound && this.data.currentRound.id === view.currentRound.id
    if (!sameRound) this._scoreDraftFields = {}
    const scores = {}
    for (const field of ['score1', 'score2']) {
      // Polling still updates the match, but leaves edited native inputs untouched.
      if (!this._scoreDraftFields[field]) {
        const value = view.currentRound && view.currentRound[field]
        scores[field] = value === null || value === undefined ? '' : String(value)
      }
    }
    this.setData({
      match: snapshot,
      ...view,
      ranking: snapshot.ranking || [],
      filteredRounds,
      filteredRoundCount: filteredRounds.length,
      ...scores,
      ...(closedEditor ? { editingRound:null, editScore1:'', editScore2:'' } : {})
    })
    return true
  },
  chooseFilter(e) {
    const scheduleFilter = e.currentTarget.dataset.filter
    const filteredRounds = filterRounds(this.data.rounds, scheduleFilter)
    this.setData({ scheduleFilter, filteredRounds, filteredRoundCount: filteredRounds.length })
  },
  refresh() {
    if (!this.data.match || this._rosterSavePending) return Promise.resolve()
    const matchId = this.data.match.id
    const saveVersion = this._rosterSaveVersion || 0
    return this.call('getMatch', { matchId }).then(result => {
      if (this._rosterSavePending || saveVersion !== (this._rosterSaveVersion || 0) || this.data.match.id !== matchId) return
      if (result.match.revision < this.data.match.revision) return
      this.applySnapshot(result.match)
    }).catch(() => {})
  },
  startPolling() { this.stopPolling(); this.data.pollTimer = setInterval(() => this.refresh(), 5000) },
  stopPolling() { if (this.data.pollTimer) { clearInterval(this.data.pollTimer); this.data.pollTimer = null } },
  switchScreen(e) { this.setData({ screen:e.currentTarget.dataset.screen }); if (e.currentTarget.dataset.screen === 'admin') this.refresh() },
  submitScore() { if (this.data.currentRound) return this.saveScore(this.data.currentRound.id, this.data.score1, this.data.score2) },
  saveScore(roundId, score1, score2) {
    if ([score1, score2].some(value => value === null || value === undefined || String(value).trim() === '')) {
      return this.showError(new Error('请填写双方比分（0 分也请填写 0）'))
    }
    const a=Number(score1), b=Number(score2)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a<0 || b<0) return this.showError(new Error('比分必须是非负整数'))
    return this.call('saveScore', { matchId:this.data.match.id, roundId, score1:a, score2:b }).then(result => {
      if (this.applySnapshot(result.match) === false) return
      this.setData({ editingRound:null, notice:'比分已保存，排名已更新' })
    }).catch(error => this.showError(error))
  },
  openEdit(e) { const round=this.data.rounds.find(item => String(item.id)===String(e.currentTarget.dataset.id)); if (round && round.status==='completed') this.setData({ editingRound:round, editScore1:String(round.score1), editScore2:String(round.score2) }) },
  closeEdit() { this.setData({ editingRound:null }) },
  noop() {},
  saveEdit() { return this.saveScore(this.data.editingRound.id, this.data.editScore1, this.data.editScore2) },
  addPlayer() { const name=String(this.data.newPlayerName).trim(); if (!name) return; const players=this.data.players.slice(); if (players.some(player => player.name===name && player.status!=='withdrawn')) return this.showError(new Error('球员姓名不能重复')); const withdrawn=players.find(player => player.name===name && player.status==='withdrawn'); if (withdrawn) { withdrawn.status='active'; withdrawn.level=this.data.newPlayerLevel } else players.push({ id:Date.now()+players.length, name, level:this.data.newPlayerLevel, status:'active' }); this._rosterEditVersion = (this._rosterEditVersion || 0) + 1; this.setData({ players, newPlayerName:'' }); return this.savePlayers(players) },
  changeNewLevel(e) { const index=Number(e.detail.value); if (!Number.isInteger(index) || !LEVELS[index]) return; this.setData({ newPlayerLevel:LEVELS[index], newPlayerLevelIndex:index, newPlayerLevelLabel:this.data.levels[index] }) },
  changePlayer(e) { const players=this.data.players.map(player => ({ ...player })); const player=players.find(item => String(item.id)===String(e.currentTarget.dataset.id)); if (!player) return; if (e.currentTarget.dataset.field==='level') player.level=LEVELS[Number(e.detail.value)] || player.level; else player.name=e.detail.value; this._rosterEditVersion = (this._rosterEditVersion || 0) + 1; const decorated=decoratePlayers(players); this.setData({ players:decorated, adminPlayers:decorated.filter(item => item.status!=='withdrawn') }); if (e.currentTarget.dataset.field==='level') return this.savePlayers(decorated) },
  savePlayerEdits() { return this.savePlayers(this.data.players) },
  removePlayer(e) { const players=this.data.players.slice(); const player=players.find(item => String(item.id)===String(e.currentTarget.dataset.id)); if (!player) return; const scheduled=this.data.rounds.some(round => [round.p1,round.p2,round.p3,round.p4].includes(player.id)); if (scheduled) player.status=player.status==='withdrawn'?'active':'withdrawn'; else players.splice(players.indexOf(player),1); this._rosterEditVersion = (this._rosterEditVersion || 0) + 1; this.setData({ players }); return this.savePlayers(players) },
  savePlayers(players=this.data.players) {
    const roster = players.map(player => ({ ...player }))
    const matchId = this.data.match.id
    const editVersion = this._rosterEditVersion || 0
    const previous = this._rosterSavePending ? this._rosterSavePromise : Promise.resolve()
    const saveVersion = this._rosterSaveVersion = (this._rosterSaveVersion || 0) + 1
    this._rosterSavePending = (this._rosterSavePending || 0) + 1
    const save = previous.then(() => this.call('savePlayers', {
      matchId, revision:this.data.match.revision, players:roster
    })).then(result => {
      // Earlier saves advance the revision without replacing newer local edits.
      const hasNewerEdits = saveVersion !== this._rosterSaveVersion || editVersion !== (this._rosterEditVersion || 0)
      this.applySnapshot(hasNewerEdits ? { ...result.match, players:this.data.players } : result.match)
      this.setData({ notice:'名单已保存', error:'' })
      return result
    }).catch(error => {
      this.showError(error)
      throw error
    }).finally(() => { this._rosterSavePending-- })
    this._rosterSavePromise = save
    // Event handlers may ignore the promise; callers still receive its rejection.
    save.catch(() => {})
    return save
  },
  async waitForRosterSaves() {
    let save
    do {
      save = this._rosterSavePromise
      await save
    } while (save !== this._rosterSavePromise)
  },
  saveDefaultRoster() { this.call('saveDefaultRoster', { matchId:this.data.match.id, players:this.data.players }).then(result => { this.applySnapshot(result.match); this.setData({ notice:'默认名单已保存，下次创建比赛会自动带入' }) }).catch(error => this.showError(error)) },
  async generateSchedule() {
    if (this.data.scheduleBusy) return false
    this.setData({ scheduleBusy:true, scheduleAction:'generateSchedule' })
    try {
      do { await this.waitForRosterSaves() } while (this._rosterSavePending)
      const result = await this.call('generateSchedule', { matchId:this.data.match.id, revision:this.data.match.revision, roundCount:15 })
      this.applySnapshot(result.match)
      this.setData({ notice:'赛程已生成，已均衡局数并按休息、搭档轮换和实力匹配排场' })
      return result
    } catch (error) {
      this.showError(error)
      return false
    } finally {
      this.setData({ scheduleBusy:false, scheduleAction:'' })
    }
  },
  async extendSchedule() {
    if (this.data.scheduleBusy) return false
    this.setData({ scheduleBusy:true, scheduleAction:'extendSchedule' })
    try {
      do { await this.waitForRosterSaves() } while (this._rosterSavePending)
      const result = await this.call('extendSchedule', { matchId:this.data.match.id, revision:this.data.match.revision, count:5 })
      this.applySnapshot(result.match)
      this.setData({ notice:'已追加 5 局，历史比分和排名保留' })
      return result
    } catch (error) {
      this.showError(error)
      return false
    } finally {
      this.setData({ scheduleBusy:false, scheduleAction:'' })
    }
  },
  confirmRestart() {
    return new Promise((resolve, reject) => wx.showModal({
      title:'重新开始比赛？',
      content:'保留原邀请码、球员名单和当前参赛状态，重新安排 15 局。现有赛程、全部比分和排名将被清空，无法恢复。',
      confirmText:'重新开始', confirmColor:'#c24b40',
      success:result => resolve(!!result.confirm), fail:reject
    }))
  },
  async restartMatch() {
    if (this.data.scheduleBusy || !this.data.isCreator || !this.data.match) return false
    this.setData({ scheduleBusy:true, scheduleAction:'restartMatch', error:'' })
    try {
      if (!await this.confirmRestart()) return false
      do { await this.waitForRosterSaves() } while (this._rosterSavePending)
      const result = await this.call('restartMatch', { matchId:this.data.match.id, revision:this.data.match.revision })
      if (this.applySnapshot(result.match) === false) return false
      this.chooseFilter({ currentTarget:{ dataset:{ filter:'all' } } })
      this.setData({ editingRound:null, editScore1:'', editScore2:'', notice:'比赛已重新开始：原邀请码和名单保留，15 局新赛程已生成，比分与排名已清零' })
      return result
    } catch (error) {
      this.showError(error)
      return false
    } finally {
      this.setData({ scheduleBusy:false, scheduleAction:'' })
    }
  },
  levelName(level) { return ({ H:'高', M:'中', X:'次中', L:'低' })[level] || '' },
  showError(error) {
    console.error('比赛操作失败', error)
    this.setData({ error:friendlyErrorMessage(error), notice:'' })
  }
})








