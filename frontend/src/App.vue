<template>
  <main class="app-shell">
    <section v-if="!entered" class="entry-page">
      <div class="entry-glow"></div>
      <div class="brand-mark"><span class="feather"></span></div>
      <p class="eyebrow">ONE COURT · MANY RALLIES</p>
      <h1>羽球开场</h1>
      <p class="entry-copy">输入比赛邀请码，和球友一起把每一分记下来。</p>
      <div class="entry-mode-switch" role="tablist">
        <button type="button" class="entry-mode-button" :class="{ active: entryMode === 'join' }" @click="entryMode = 'join'">加入比赛</button>
        <button type="button" class="entry-mode-button create-match-entry" :class="{ active: entryMode === 'create' }" @click="entryMode = 'create'">创建比赛</button>
      </div>
      <template v-if="entryMode === 'join'">
        <form class="entry-form" @submit.prevent="enterMatch">
          <label for="invite">比赛邀请码</label>
          <input id="invite" v-model="inviteCode" inputmode="numeric" maxlength="6" placeholder="输入 6 位数字" />
          <p v-if="entryError" class="form-error">{{ entryError }}</p>
          <button class="primary-button full-button" type="submit">进入比赛 <span class="button-arrow">→</span></button>
        </form>
      </template>
      <template v-else>
        <form class="entry-form create-match-form" @submit.prevent="createMatch">
          <label for="create-match-name">比赛名称</label>
          <input id="create-match-name" v-model="createDraft.name" placeholder="例如：周六夜场" maxlength="24" />
          <label for="create-invite-code">设置邀请码</label>
          <input id="create-invite-code" v-model="createDraft.inviteCode" inputmode="numeric" maxlength="6" placeholder="输入 6 位数字" />
          <p class="entry-helper">创建后你将自动拥有管理权限，不需要额外密码。</p>
          <p v-if="entryError" class="form-error">{{ entryError }}</p>
          <button id="create-match-submit" class="primary-button full-button" type="submit">创建比赛并进入管理 <span class="button-arrow">→</span></button>
        </form>
      </template>      <div class="entry-note"><span class="tiny-dot"></span>演示邀请码：260920</div>
    </section>

    <template v-else>
      <header class="topbar">
        <div>
          <p class="eyebrow">SATURDAY NIGHT · COURT 01</p>
          <h2>{{ match.name }}</h2>
        </div>
        <button v-if="isCreator" class="icon-button" aria-label="打开管理" title="管理" @click="openAdmin">
          <span class="gear-icon">⚙</span>
        </button>
      </header>

      <div v-if="toast" class="toast" :class="{ success: toastType === 'success' }">{{ toast }}</div>

      <section v-if="screen === 'match'" class="content">
        <div class="status-line">
          <span class="live-pill"><span class="live-dot"></span>{{ currentRound ? '正在进行' : '等待开场' }}</span>
          <span class="muted">{{ completedCount }} / {{ rounds.length }} 局完成</span>
        </div>

        <div v-if="currentRound" class="court-card">
          <div class="court-lines"></div>
          <div class="round-heading">
            <span>第 {{ currentRound.seq }} 局</span>
            <span class="round-time">约 12 分钟</span>
          </div>
          <div class="scoreboard">
            <div class="team team-a">
              <div class="team-label"><span class="team-dot green"></span> A 队</div>
              <div class="team-names">{{ teamNames(currentRound, 1) }}</div>
              <input class="score-input" type="number" min="0" v-model.number="scoreDraft.score1" aria-label="A 队比分" />
            </div>
            <div class="versus">VS</div>
            <div class="team team-b">
              <div class="team-label"><span class="team-dot orange"></span> B 队</div>
              <div class="team-names">{{ teamNames(currentRound, 2) }}</div>
              <input class="score-input orange-score" type="number" min="0" v-model.number="scoreDraft.score2" aria-label="B 队比分" />
            </div>
          </div>
          <p class="score-hint">比分没有上限，结束时提交即可</p>
          <button class="primary-button full-button" @click="submitScore">提交本局比分 <span class="button-arrow">→</span></button>
        </div>

        <div v-else class="empty-card">
          <span class="empty-icon">✓</span>
          <h3>今天的球局打完了</h3>
          <p>所有小局都已记录，去排行榜看看结果吧。</p>
        </div>

        <div v-if="nextRound" class="next-card">
          <div class="next-title"><span>下一局</span><span class="rest-label">轮流上场中</span></div>
          <div class="next-players"><span>{{ teamNames(nextRound, 1) }}</span><b>VS</b><span>{{ teamNames(nextRound, 2) }}</span></div>
          <div class="rest-strip"><span class="rest-dot"></span>其余球员休息，下一局继续轮换</div>
        </div>

        <div class="quick-stats">
          <div><strong>{{ playerCount }}</strong><span>参赛球员</span></div>
          <div><strong>{{ rounds.length }}</strong><span>计划小局</span></div>
          <div><strong>3<span class="unit">h+</span></strong><span>预计时长</span></div>
        </div>
      </section>

      <section v-else-if="screen === 'schedule'" class="content">
        <div class="page-heading">
          <div><p class="eyebrow">COURT ROTATION</p><h3>完整赛程</h3></div>
          <span class="count-chip">{{ rounds.length }} 局</span>
        </div>
        <div class="filter-tabs">
          <button v-for="item in scheduleFilters" :key="item.value" :class="{ active: scheduleFilter === item.value }" @click="scheduleFilter = item.value">{{ item.label }}</button>
        </div>
        <div class="schedule-list">
          <article v-for="round in filteredRounds" :key="round.id" class="schedule-row" :class="{ active: round.status === 'active', completed: round.status === 'completed' }" @click="round.status === 'completed' && openScoreEdit(round)">
            <div class="round-index"><span>{{ String(round.seq).padStart(2, '0') }}</span><i v-if="round.status === 'active'"></i></div>
            <div class="matchup">
              <div><span>{{ teamNames(round, 1) }}</span><b>{{ round.score1 === null ? '—' : round.score1 }}</b></div>
              <div><span>{{ teamNames(round, 2) }}</span><b>{{ round.score2 === null ? '—' : round.score2 }}</b></div>
            </div>
            <div class="row-status">{{ round.status === 'active' ? '进行中' : round.status === 'completed' ? '已完成 · 可修改' : '待开始' }}</div>
          </article>
        </div>
        <p class="section-note">点击已完成的小局，可以修改任意非负比分。</p>
      </section>

      <section v-else-if="screen === 'ranking'" class="content">
        <div class="page-heading">
          <div><p class="eyebrow">NET SCOREBOARD</p><h3>实时排名</h3></div>
          <span class="count-chip">按净胜分</span>
        </div>
        <div class="ranking-hero">
          <div class="hero-number">{{ ranking[0] ? signed(ranking[0].net) : '0' }}</div>
          <div><span>当前最高净胜分</span><strong>{{ ranking[0] ? ranking[0].name : '等待首局结束' }}</strong></div>
          <span class="spark">↗</span>
        </div>
        <div class="ranking-list">
          <article v-for="(player, index) in ranking" :key="player.id" class="ranking-row" :class="{ leader: index === 0 }">
            <div class="rank-number">{{ String(index + 1).padStart(2, '0') }}</div>
            <div class="avatar" :style="{ background: avatarColor(index) }">{{ player.name.slice(0, 1) }}</div>
            <div class="rank-name"><strong>{{ player.name }}</strong><span>{{ player.wins }} 胜 · {{ player.games }} 局</span></div>
            <strong class="net-score" :class="{ negative: player.net < 0 }">{{ signed(player.net) }}</strong>
          </article>
        </div>
        <p class="section-note">净胜分 = 你所在一方得分 − 对方得分，比分修改后自动重算。</p>
      </section>

      <section v-else class="content admin-page">
        <button class="admin-return" @click="returnToMatch"><span aria-hidden="true">←</span> 返回普通球员页面</button>
        <div v-if="!adminUnlocked" class="admin-lock">
          <div class="lock-mark">⌑</div><p class="eyebrow">ADMIN ACCESS</p><h3>管理员入口</h3>
          <p>管理球员、水平与未开始的赛程。</p>
          <input v-model="adminPassword" type="password" placeholder="输入管理员密码" @keyup.enter="unlockAdmin" />
          <p v-if="adminError" class="form-error">{{ adminError }}</p>
          <button class="primary-button full-button" @click="unlockAdmin">验证进入</button>
          <p class="demo-hint">演示密码：8888</p>
        </div>
        <template v-else>
          <div class="page-heading"><div><p class="eyebrow">CONTROL ROOM</p><h3>比赛管理</h3></div><span class="admin-badge">已验证</span></div>
          <div class="admin-summary"><div><strong>{{ playerCount }}</strong><span>球员</span></div><div><strong>{{ rounds.length }}</strong><span>赛程局数</span></div><div><strong>{{ scheduleLocked ? '已锁定' : '未生成' }}</strong><span>等级状态</span></div></div>
          <div class="admin-panel">
            <div class="panel-heading"><h4>参赛名单</h4><span>水平仅管理员可见</span></div>
            <div v-for="player in players" :key="player.id" class="player-row"><div class="avatar small" :style="{ background: avatarColor(player.id) }">{{ player.name.slice(0, 1) }}</div><strong>{{ player.name }}</strong><span class="level-badge" :class="'level-' + player.level">{{ levelName(player.level) }}</span><select class="player-status-select" :value="player.status || 'active'" @change="setPlayerStatus(player.id, $event.target.value)" aria-label="Player status"><option value="active">正常</option><option value="paused">暂停</option><option value="withdrawn">退出</option></select><button class="remove-button" @click="removePlayer(player.id)" aria-label="删除球员">×</button></div>
            <div class="add-player"><input v-model="newPlayerName" placeholder="添加球员姓名" @keyup.enter="addPlayer" /><select v-model="newPlayerLevel"><option value="H">高</option><option value="M">中</option><option value="X">次中</option><option value="L">低</option></select><button class="small-button" @click="addPlayer">添加</button></div>
          </div>
          <div class="admin-panel">
            <div class="panel-heading"><h4>赛程控制</h4><span>默认 180 分钟</span></div>
            <p class="rule-copy"><span class="rule-check">✓</span>严格等级组合 · 两高绑定轮换 · 局数尽量均衡</p>
            <button class="primary-button full-button" @click="generateSchedule">重新生成未开始赛程 <span class="button-arrow">→</span></button>
            <div class="extension-actions">
              <span>当前赛程结束后可继续加赛</span>
              <button class="extension-button" @click="extendSchedule(5)">继续加赛 5 局</button>
              <button class="extension-button" @click="extendSchedule(10)">继续加赛 10 局</button>
            </div>
          </div>
          <button class="text-button" @click="returnToMatch">退出管理员模式并返回比赛</button>
        </template>
      </section>

      <nav v-if="screen !== 'admin'" class="bottom-nav">
        <button v-for="item in navItems" :key="item.value" :class="{ active: screen === item.value }" @click="screen = item.value"><span class="nav-icon">{{ item.icon }}</span><span>{{ item.label }}</span></button>
        <button v-if="isCreator" @click="openAdmin"><span class="nav-icon">⚙</span><span>管理</span></button>
      </nav>
    </template>

    <div v-if="editingRound" class="modal-backdrop" @click.self="editingRound = null">
      <div class="edit-modal"><div class="modal-top"><div><p class="eyebrow">EDIT SCORE</p><h3>修改第 {{ editingRound.seq }} 局</h3></div><button class="close-button" @click="editingRound = null">×</button></div><p class="modal-matchup">{{ teamNames(editingRound, 1) }} <b>对</b> {{ teamNames(editingRound, 2) }}</p><div class="edit-score-grid"><input v-model.number="editDraft.score1" type="number" min="0" /><span>:</span><input v-model.number="editDraft.score2" type="number" min="0" /></div><button class="primary-button full-button" @click="saveScoreEdit">保存新比分</button></div>
    </div>
  </main>
</template>

<script>
import { buildSchedule as buildGeneratedSchedule } from './scheduler.js'

const seedPlayers = [
  { id: 1, name: '阿杰', level: 'H', status: 'active' }, { id: 2, name: '小满', level: 'H', status: 'active' },
  { id: 3, name: '柚子', level: 'M', status: 'active' }, { id: 4, name: '大鹏', level: 'M', status: 'active' },
  { id: 5, name: '小鹿', level: 'M', status: 'active' }, { id: 6, name: 'Kiki', level: 'M', status: 'active' },
  { id: 7, name: '阿南', level: 'L', status: 'active' }, { id: 8, name: '橙子', level: 'L', status: 'active' }
]
const pairs = [[1,3,2,4],[5,7,6,8],[1,4,2,3],[5,8,6,7],[1,5,2,6],[3,7,4,8],[1,7,2,8],[3,5,4,6],[1,3,5,7],[2,4,6,8],[1,6,2,5],[3,8,4,7],[1,4,5,8],[2,3,6,7],[1,8,2,7]]
const seedRounds = pairs.map((p, i) => ({ id: i + 1, seq: i + 1, p1: p[0], p2: p[1], p3: p[2], p4: p[3], score1: i < 2 ? [15, 12][i] : null, score2: i < 2 ? [9, 15][i] : null, status: i < 2 ? 'completed' : i === 2 ? 'active' : 'pending' }))

export default {
  data() {
    return {
      entered: false, inviteCode: '', entryError: '', entryMode: 'join', currentUserId: '', createDraft: { name: '', inviteCode: '' }, screen: 'match', match: { id: 'demo-match', name: '周六夜场 · 友谊赛', inviteCode: '260920', creatorId: 'wx-demo-creator' },
      players: [], rounds: [], scoreDraft: { score1: 0, score2: 0 }, toast: '', toastType: 'success',
      scheduleFilter: 'all', editingRound: null, editDraft: { score1: 0, score2: 0 },
      adminUnlocked: false, adminPassword: '', adminError: '', newPlayerName: '', newPlayerLevel: 'M', scheduleLocked: true,
      navItems: [{ value: 'match', label: '比赛', icon: '●' }, { value: 'schedule', label: '赛程', icon: '▤' }, { value: 'ranking', label: '排名', icon: '↗' }],
      scheduleFilters: [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'pending', label: '待开始' }, { value: 'completed', label: '已完成' }]
    }
  },
  computed: {
    playerCount() { return this.players.length },
    isCreator() { return Boolean(this.currentUserId && this.match.creatorId && this.currentUserId === this.match.creatorId) },
    activePlayerCount() { return this.players.filter(p => (p.status || 'active') === 'active').length },
    completedCount() { return this.rounds.filter(r => r.status === 'completed').length },
    currentRound() { return this.rounds.find(r => r.status === 'active') || null },
    nextRound() { const active = this.rounds.findIndex(r => r.status === 'active'); return active >= 0 ? this.rounds[active + 1] || null : null },
    filteredRounds() { return this.scheduleFilter === 'all' ? this.rounds : this.rounds.filter(r => r.status === this.scheduleFilter) },
    ranking() {
      const output = this.players.map(p => ({ id: p.id, name: p.name, net: 0, wins: 0, games: 0 }))
      const byId = Object.fromEntries(output.map(p => [p.id, p]))
      this.rounds.filter(r => r.status === 'completed' && r.score1 !== null).forEach(r => {
        const diff = Number(r.score1) - Number(r.score2)
        const a = [byId[r.p1], byId[r.p2]], b = [byId[r.p3], byId[r.p4]]
        a.forEach(p => { if (p) { p.net += diff; p.games += 1; if (diff > 0) p.wins += 1 } })
        b.forEach(p => { if (p) { p.net -= diff; p.games += 1; if (diff < 0) p.wins += 1 } })
      })
      return output.sort((a, b) => b.net - a.net || a.games - b.games || a.name.localeCompare(b.name, 'zh'))
    }
  },
  watch: {
    rounds: { deep: true, handler() { this.persist() } },
    players: { deep: true, handler() { this.persist() } }
  },
  mounted() {
    const freshStart = new URLSearchParams(window.location.search).has('fresh')
    if (freshStart) {
      localStorage.removeItem('badminton-demo')
      localStorage.removeItem('badminton-demo-user-id')
      window.history.replaceState({}, '', window.location.pathname)
    }
    this.currentUserId = localStorage.getItem('badminton-demo-user-id') || 'wx-demo-creator'
    const saved = localStorage.getItem('badminton-demo')
    if (freshStart) {
      this.entered = false
      this.players = []
      this.rounds = []
      this.screen = 'match'
    } else if (saved) {
      try {
        const data = JSON.parse(saved)
        this.match = { ...this.match, ...(data.match || {}) }
        this.players = (data.players || []).map(player => ({ status: 'active', ...player }))
        this.rounds = data.rounds || []
      } catch {
        this.resetDemo()
      }
    } else {
      this.resetDemo()
    }
  },  methods: {
    resetDemo() { this.match = { id: 'demo-match', name: '周六夜场 · 友谊赛', inviteCode: '260920', creatorId: 'wx-demo-creator' }; this.players = structuredClone(seedPlayers); this.rounds = structuredClone(seedRounds) },
    persist() { localStorage.setItem('badminton-demo', JSON.stringify({ match: this.match, players: this.players, rounds: this.rounds })) },
    enterMatch() {
      if (this.inviteCode !== this.match.inviteCode) { this.entryError = '邀请码不正确，请重新输入'; return }
      this.entered = true
      this.entryError = ''
      this.syncDraft()
    },
    createMatch() {
      const name = this.createDraft.name.trim()
      const inviteCode = this.createDraft.inviteCode.trim()
      if (!name) { this.entryError = '请先填写比赛名称'; return }
      if (!/^\d{6}$/.test(inviteCode)) { this.entryError = '邀请码必须是 6 位数字'; return }
      this.match = { id: 'match-' + Date.now(), name, inviteCode, creatorId: this.currentUserId }
      this.players = []
      this.rounds = []
      this.entered = true
      this.entryError = ''
      this.screen = 'admin'
      this.adminUnlocked = true
      this.scheduleLocked = false
      this.persist()
    },
    syncDraft() { if (this.currentRound) { this.scoreDraft = { score1: this.currentRound.score1 ?? 0, score2: this.currentRound.score2 ?? 0 } } },
    submitScore() { const a = Number(this.scoreDraft.score1), b = Number(this.scoreDraft.score2); if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) { this.showToast('请输入非负整数比分', 'error'); return } const round = this.currentRound; if (!round) return; round.score1 = a; round.score2 = b; round.status = 'completed'; const next = this.rounds.find(r => r.status === 'pending'); if (next) next.status = 'active'; this.showToast('比分已记录，下一局自动开始'); this.syncDraft() },
    openScoreEdit(round) { this.editingRound = round; this.editDraft = { score1: round.score1, score2: round.score2 } },
    saveScoreEdit() { const a = Number(this.editDraft.score1), b = Number(this.editDraft.score2); if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) { this.showToast('比分必须是非负整数', 'error'); return } this.editingRound.score1 = a; this.editingRound.score2 = b; this.editingRound = null; this.showToast('历史比分已更新，排名已重算') },
    teamNames(round, team) { const ids = team === 1 ? [round.p1, round.p2] : [round.p3, round.p4]; return ids.map(id => this.players.find(p => p.id === id)?.name || '待定').join(' / ') },
    signed(value) { return value > 0 ? '+' + value : String(value) },
    showToast(message, type = 'success') { this.toast = message; this.toastType = type; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { this.toast = '' }, 2600) },
    openAdmin() { if (!this.isCreator) return; this.screen = 'admin'; this.adminUnlocked = true; this.adminError = '' },
    returnToMatch() { this.screen = 'match'; this.adminUnlocked = false; this.adminPassword = '' },
    unlockAdmin() { if (this.adminPassword !== '8888') { this.adminError = '密码不正确'; return } this.adminUnlocked = true; this.adminError = ''; this.showToast('管理员模式已开启') },
    levelName(level) { return { H: '高', M: '中', X: '次中', L: '低' }[level] },
    avatarColor(index) { return ['#238B68', '#F29F58', '#4E83D7', '#8B72D9', '#D47596'][Number(index) % 5] },
    addPlayer() {
      const name = this.newPlayerName.trim()
      if (!name) return
      this.players.push({ id: Math.max(...this.players.map(p => p.id), 0) + 1, name, level: this.newPlayerLevel, status: 'active' })
      this.newPlayerName = ''
      this.showToast('球员已添加，请重新生成未开始赛程')
    },
    setPlayerStatus(id, status) {
      const player = this.players.find(item => item.id === id)
      if (!player) return
      player.status = status
      const labels = { active: '已恢复参赛', paused: '已暂停后续排赛', withdrawn: '已退出后续排赛' }
      this.showToast(player.name + '：' + labels[status])
    },
    removePlayer(id) {
      const player = this.players.find(item => item.id === id)
      if (!player) return
      const appearsInSchedule = this.rounds.some(round => [round.p1, round.p2, round.p3, round.p4].includes(id))
      if (appearsInSchedule) {
        this.setPlayerStatus(id, 'withdrawn')
        return
      }
      this.players = this.players.filter(item => item.id !== id)
      this.showToast("球员已移出比赛")
    },
    activeIds() {
      return this.players.filter(player => (player.status || 'active') === 'active').map(player => player.id)
    },
    generateSchedule(showMessage = true) {
      if (!this.rounds.length) {
        this.rounds = Array.from({ length: 15 }, (_, index) => ({
          id: index + 1,
          seq: index + 1,
          p1: 0, p2: 0, p3: 0, p4: 0,
          score1: null, score2: null, status: 'pending'
        }))
      }
      const pending = this.rounds.filter(round => round.status === 'pending')
      if (!pending.length) {
        if (showMessage) this.showToast('没有待开始赛程可调整', 'error')
        return false
      }
      const activePlayers = this.players.filter(player => (player.status || 'active') === 'active')
      if (activePlayers.length < 4) {
        if (showMessage) this.showToast('至少需要 4 名正常球员才能排赛', 'error')
        return false
      }
      const previousRounds = this.rounds.filter(round => round.status === 'completed' || round.status === 'active')
      const generated = buildGeneratedSchedule({
        players: activePlayers,
        roundCount: pending.length,
        previousRounds,
        random: Math.random
      })
      if (generated.length !== pending.length) {
        if (showMessage) this.showToast('当前等级和人员组合无法生成合法赛程', 'error')
        return false
      }
      pending.forEach((round, index) => {
        Object.assign(round, generated[index], { score1: null, score2: null })
      })
      if (!this.currentRound && pending[0]) pending[0].status = 'active'
      if (showMessage) this.showToast('赛程已按局数、休息时间和随机轮换重新生成')
      return true
    },    extendSchedule(count) {
      if (this.activeIds().length < 4) {
        this.showToast('至少需要 4 名正常球员才能加赛', 'error')
        return
      }
      const nextSeq = Math.max(0, ...this.rounds.map(round => round.seq)) + 1
      const newRounds = Array.from({ length: count }, (_, index) => ({
        id: Math.max(0, ...this.rounds.map(round => round.id)) + index + 1,
        seq: nextSeq + index,
        p1: 0, p2: 0, p3: 0, p4: 0,
        score1: null, score2: null, status: 'pending'
      }))
      this.rounds.push(...newRounds)
      this.generateSchedule(false)
      if (!this.currentRound && newRounds[0]) newRounds[0].status = 'active'
      this.showToast('已追加 ' + count + ' 局，历史比分和排名保持不变')
    }
  }
}
</script>
