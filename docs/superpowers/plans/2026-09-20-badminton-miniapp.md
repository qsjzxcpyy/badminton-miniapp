# 羽毛球双打小程序 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 微信小程序 + FastAPI 后端的羽毛球双打比赛管理系统：管理员建赛/管人/管等级，球员认领、记分、看实时净胜分排名，排班算法满足等级规则与局数均衡。

**Architecture:** 后端 FastAPI + SQLite（SQLAlchemy ORM），核心排班/排名为纯函数模块 scheduler.py（TDD 重点）；前端 uni-app (Vue2) 编译微信小程序，REST API 通信；部署目标微信云托管（Docker）。

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy 2 / pytest / httpx；uni-app Vue2 / 微信小程序。

**执行环境备注：** 本会话 shell 工具异常，所有命令通过 node child_process 执行；Python 使用工作区根 .venv（3.12.14）。npm 依赖安装若遇网络限制需申请升级权限。

---

## 文件结构映射

```
badminton-miniapp/
├── docs/superpowers/
│   ├── specs/2026-09-20-badminton-doubles-miniapp-design.md   # 设计文档（已提交）
│   └── plans/2026-09-20-badminton-miniapp.md                  # 本计划
├── backend/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI 入口 + 路由注册
│   │   ├── database.py        # SQLAlchemy engine/session
│   │   ├── models.py          # 4 张表 ORM
│   │   ├── schemas.py         # pydantic 请求/响应模型
│   │   ├── scheduler.py       # 排班算法（纯函数，TDD 核心）
│   │   ├── ranking.py         # 排名计算（纯函数）
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── matches.py     # 全部 API
│   └── tests/
│       ├── conftest.py
│       ├── test_scheduler_rules.py
│       ├── test_scheduler_schedule.py
│       ├── test_ranking.py
│       └── test_api.py
└── frontend/                  # uni-app Vue2（Task 9 起创建）
    ├── package.json
    ├── manifest.json
    ├── pages.json
    ├── main.js
    ├── App.vue
    ├── utils/api.js           # wx.request 封装 + 后端地址配置
    ├── utils/store.js         # 全局状态
    ├── components/
    │   ├── CourtCard.vue      # 球场线风格卡片
    │   └── ScoreBoard.vue     # 记分牌（大数字）
    └── pages/
        ├── entry/entry.vue      # ① 进入页（口令）
        ├── claim/claim.vue      # ② 认领页
        ├── home/home.vue        # ③ 比赛主页
        ├── schedule/schedule.vue# ④ 赛程页
        ├── ranking/ranking.vue  # ⑤ 排行榜
        └── admin/admin.vue      # ⑥ 管理页
```

---

# Phase A：后端（Task 1–8）

## Task 1: 后端骨架与依赖

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`（空）
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`（空）

- [ ] **Step 1: 写 requirements.txt**

```txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
pydantic==2.10.4
pytest==8.3.4
httpx==0.28.1
passlib==1.7.4
```

- [ ] **Step 2: 安装依赖**

Run: `pip install -r backend/requirements.txt`
Expected: 全部安装成功（网络受限则申请升级权限重跑）

- [ ] **Step 3: 写 main.py（健康检查）**

```python
from fastapi import FastAPI

app = FastAPI(title="羽毛球双打小程序 API", version="1.0.0")

@app.get("/api/health")
def health():
    return {"ok": True}
```

- [ ] **Step 4: 冒烟测试**

Run: `python -c "from app.main import app; print(app.title)"`（cwd=backend）
Expected: 输出 `羽毛球双打小程序 API`

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app
git commit -m "feat(backend): fastapi skeleton with health check"
```

## Task 2: 数据库与 ORM 模型

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/models.py`
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: 写 database.py**

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_PATH = os.environ.get("BADMINTON_DB", os.path.join(os.path.dirname(__file__), "..", "badminton.db"))
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def init_db():
    from . import models  # noqa: F401
    Base.metadata.create_all(engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: 写 models.py（4 张表）**

```python
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class Match(Base):
    __tablename__ = "match"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    invite_code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    admin_password_hash: Mapped[str] = mapped_column(String(128))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=180)
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    players: Mapped[list["Player"]] = relationship(back_populates="match", cascade="all,delete")

class Player(Base):
    __tablename__ = "player"
    __table_args__ = (UniqueConstraint("match_id", "claim_token"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), index=True)
    name: Mapped[str] = mapped_column(String(32))
    level: Mapped[str] = mapped_column(String(1))
    claim_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    match: Mapped["Match"] = relationship(back_populates="players")

class Round(Base):
    __tablename__ = "round"
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    p1: Mapped[int] = mapped_column(ForeignKey("player.id"))
    p2: Mapped[int] = mapped_column(ForeignKey("player.id"))
    p3: Mapped[int] = mapped_column(ForeignKey("player.id"))
    p4: Mapped[int] = mapped_column(ForeignKey("player.id"))
    score1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    is_shuffle: Mapped[bool] = mapped_column(default=False)
    version: Mapped[int] = mapped_column(Integer, default=0)
    played_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class ScoreLog(Base):
    __tablename__ = "score_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    round_id: Mapped[int] = mapped_column(ForeignKey("round.id"), index=True)
    old_score1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    old_score2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_score1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_score2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    operator: Mapped[str] = mapped_column(String(32), default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: 写 conftest.py**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
import app.models  # noqa: F401
from app.main import app

@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    session = TestingSession()
    yield session
    session.close()

@pytest.fixture()
def client(db_session):
    def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()
```

- [ ] **Step 4: 建表冒烟测试**

Run: `python -c "from app.database import init_db; init_db(); print('tables ok')"`（cwd=backend）
Expected: `tables ok`

- [ ] **Step 5: Commit**

```bash
git add backend/app/database.py backend/app/models.py backend/tests/conftest.py
git commit -m "feat(backend): database layer and orm models"
```

## Task 3: 排班算法——等级组合与分侧（纯函数，TDD 核心）

**Files:**
- Create: `backend/app/scheduler.py`
- Test: `backend/tests/test_scheduler_rules.py`

- [ ] **Step 1: 写失败测试**

```python
from app.scheduler import SchedPlayer, is_valid_level_combo, team_splits

def P(i, level):
    return SchedPlayer(id=i, name=f"P{i}", level=level)

def test_span_over_one_rejected():
    assert not is_valid_level_combo(["H", "H", "M", "L"])
    assert not is_valid_level_combo(["H", "L", "L", "L"])

def test_valid_combos():
    for combo in (["H","H","H","H"], ["H","H","M","M"], ["H","H","H","M"],
                  ["M","M","M","M"], ["M","M","L","L"], ["M","M","M","L"],
                  ["L","L","L","L"], ["H","M","M","M"]):
        assert is_valid_level_combo(combo), combo

def test_one_high_three_mid_rejected():
    assert not is_valid_level_combo(["H", "M", "M", "M"])
    assert not is_valid_level_combo(["M", "L", "L", "L"])

def test_team_splits_two_high_two_mid():
    four = [P(1,"H"), P(2,"H"), P(3,"M"), P(4,"M")]
    for t1, t2 in team_splits(four):
        h1 = sum(1 for p in t1 if p.level == "H")
        h2 = sum(1 for p in t2 if p.level == "H")
        assert h1 == 1 and h2 == 1

def test_team_splits_three_high_one_mid():
    four = [P(1,"H"), P(2,"H"), P(3,"H"), P(4,"M")]
    splits = team_splits(four)
    assert len(splits) > 0
    for t1, t2 in splits:
        hs = sorted(sum(1 for p in t if p.level == "H") for t in (t1, t2))
        assert hs == [1, 2]

def test_team_splits_same_level_free():
    four = [P(1,"M"), P(2,"M"), P(3,"M"), P(4,"M")]
    assert len(team_splits(four)) == 3
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_scheduler_rules.py -v`（cwd=backend）→ FAIL

- [ ] **Step 3: 写 scheduler.py 第一部分**

```python
from __future__ import annotations
from collections import Counter
from dataclasses import dataclass
from itertools import combinations

LEVEL_SCORE = {"H": 3, "M": 2, "L": 1}

@dataclass(frozen=True)
class SchedPlayer:
    id: int
    name: str
    level: str  # H / M / L

def is_valid_level_combo(levels: list[str]) -> bool:
    """4 人等级组合合法性（设计文档 6.1 规则 1/2）。"""
    vals = [LEVEL_SCORE[l] for l in levels]
    if max(vals) - min(vals) > 1:
        return False
    c = Counter(levels)
    if c.get("H", 0) == 1 and c.get("M", 0) == 3:
        return False
    if c.get("M", 0) == 1 and c.get("L", 0) == 3:
        return False
    return True

def _split_valid(t1, t2) -> bool:
    """分侧合法性：任意等级在两侧数量差 ≤ 1。"""
    c1 = Counter(p.level for p in t1)
    c2 = Counter(p.level for p in t2)
    return all(abs(c1.get(l, 0) - c2.get(l, 0)) <= 1 for l in ("H", "M", "L"))

def team_splits(four: list[SchedPlayer]) -> list[tuple[tuple, tuple]]:
    """4 人的所有合法 2v2 分侧（最多 3 种）。"""
    a, b, c, d = four
    raw = [((a, b), (c, d)), ((a, c), (b, d)), ((a, d), (b, c))]
    return [s for s in raw if _split_valid(*s)]
```

- [ ] **Step 4: 跑测试确认通过** → 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/scheduler.py backend/tests/test_scheduler_rules.py
git commit -m "feat(scheduler): level combo rules and team splitting"
```

## Task 4: 排班算法——完整赛程生成（洗牌局/容差/评分）

**Files:**
- Modify: `backend/app/scheduler.py`（追加生成函数）
- Test: `backend/tests/test_scheduler_schedule.py`

- [ ] **Step 1: 写失败测试（赛程级规则全覆盖）**

```python
from app.scheduler import SchedPlayer, generate_schedule, is_valid_level_combo

def P(i, level):
    return SchedPlayer(id=i, name=f"P{i}", level=level)

def count_plays(players, rounds):
    counts = {p.id: 0 for p in players}
    for r in rounds:
        for pid in (r.p1, r.p2, r.p3, r.p4):
            counts[pid] += 1
    return counts

def check_invariants(players, rounds):
    last_court = set()
    n = len(players)
    for r in rounds:
        ids = {r.p1, r.p2, r.p3, r.p4}
        assert len(ids) == 4
        if not r.is_shuffle:
            overlap = ids & last_court
            assert len(overlap) <= max(0, 4 - (n - 4)), f"round {r.seq} overlap {overlap}"
        last_court = ids

def test_eight_players_balance_and_rules():
    players = [P(i, lvl) for i, lvl in enumerate(["H","H","M","M","M","M","L","L"], start=1)]
    rounds = generate_schedule(players, total_minutes=180, minutes_per_round=12)
    assert len(rounds) == 15
    check_invariants(players, rounds)
    counts = count_plays(players, rounds)
    assert max(counts.values()) - min(counts.values()) <= 1
    lvl = {p.id: p.level for p in players}
    for r in rounds:
        assert is_valid_level_combo([lvl[r.p1], lvl[r.p2], lvl[r.p3], lvl[r.p4]])
    assert any(r.is_shuffle for r in rounds)

def test_six_players_natural_rotation():
    players = [P(i, lvl) for i, lvl in enumerate(["H","M","M","M","L","L"], start=1)]
    rounds = generate_schedule(players, total_minutes=180, minutes_per_round=12)
    check_invariants(players, rounds)
    counts = count_plays(players, rounds)
    assert max(counts.values()) - min(counts.values()) <= 1

def test_seven_players():
    players = [P(i, lvl) for i, lvl in enumerate(["H","M","M","M","M","L","L"], start=1)]
    rounds = generate_schedule(players, total_minutes=180, minutes_per_round=12)
    check_invariants(players, rounds)
    counts = count_plays(players, rounds)
    assert max(counts.values()) - min(counts.values()) <= 1

def test_shuffle_breaks_two_group_lock():
    players = [P(i, "M") for i in range(1, 9)]
    rounds = generate_schedule(players, total_minutes=180, minutes_per_round=12)
    seen = set()
    for r in rounds:
        seen.add(frozenset((r.p1, r.p2)))
        seen.add(frozenset((r.p3, r.p4)))
    # 无洗牌时只会出现两组内部的搭档对；有洗牌应出现跨组搭档
    assert len(seen) > 6

def test_all_same_level():
    players = [P(i, "H") for i in range(1, 7)]
    rounds = generate_schedule(players, total_minutes=120, minutes_per_round=12)
    assert len(rounds) == 10

def test_too_few_players_raises():
    import pytest
    with pytest.raises(ValueError):
        generate_schedule([P(1, "M"), P(2, "M"), P(3, "M")])

def test_impossible_level_distribution_raises():
    import pytest
    players = [P(1, "H")] + [P(i, "L") for i in range(2, 7)]
    with pytest.raises(ValueError):
        generate_schedule(players)
```

- [ ] **Step 2: 跑测试确认失败** → FAIL（generate_schedule 未定义）

- [ ] **Step 3: 实现生成函数（追加到 scheduler.py）**

```python
@dataclass(frozen=True)
class RoundDraft:
    seq: int
    p1: int
    p2: int
    p3: int
    p4: int
    is_shuffle: bool

def _feasibility_precheck(players: list[SchedPlayer]) -> None:
    """每个球员必须能和至少 3 个其他人组成合法等级组合，否则报错。"""
    for p in players:
        others = [x for x in players if x.id != p.id]
        ok = any(
            is_valid_level_combo([p.level] + [q.level for q in trio])
            for trio in combinations(others, 3)
        )
        if not ok:
            raise ValueError(
                f"球员 {p.name} 的等级无法组成合法对局（高需要高/中同伴，低需要低/中同伴），请调整名单"
            )

def _tolerance_ok(quad, played) -> bool:
    new = dict(played)
    for p in quad:
        new[p.id] += 1
    vals = new.values()
    return max(vals) - min(vals) <= 1

def _best_split(four, partner_count):
    splits = team_splits(four)
    if not splits:
        return None
    def split_score(s):
        t1, t2 = s
        keys = [frozenset((t1[0].id, t1[1].id)), frozenset((t2[0].id, t2[1].id))]
        return -sum(partner_count.get(k, 0) for k in keys)
    return max(splits, key=split_score)

def generate_schedule(
    players: list[SchedPlayer],
    total_minutes: int = 180,
    minutes_per_round: int = 12,
    shuffle_every: int = 3,
) -> list[RoundDraft]:
    n = len(players)
    if n < 4:
        raise ValueError("至少需要 4 名球员")
    _feasibility_precheck(players)
    n_rounds = max(1, total_minutes // minutes_per_round)

    played = {p.id: 0 for p in players}
    streak = {p.id: 0 for p in players}
    rest = {p.id: 10 ** 9 for p in players}
    partner_count: dict = {}
    opponent_count: dict = {}
    last_court: set = set()
    rounds: list[RoundDraft] = []

    for r in range(1, n_rounds + 1):
        is_shuffle_round = n >= 8 and r % shuffle_every == 0
        resting = [p for p in players if p.id not in last_court]
        on_court = [p for p in players if p.id in last_court and streak[p.id] < 2]

        quads: list = []
        if is_shuffle_round:
            for keep in (1, 2):
                for kc in combinations(on_court, keep):
                    need = 4 - keep
                    for rc in combinations(resting, need):
                        quads.append(kc + rc)
        else:
            if len(resting) >= 4:
                quads = list(combinations(resting, 4))
            else:
                need = 4 - len(resting)
                for oc in combinations(on_court, need):
                    quads.append(tuple(resting) + oc)

        best = None
        best_score = None
        for quad in quads:
            levels = [p.level for p in quad]
            if not is_valid_level_combo(levels):
                continue
            if not _tolerance_ok(quad, played):
                continue
            split = _best_split(quad, partner_count)
            if split is None:
                continue
            t1, t2 = split
            pair_keys = [frozenset((t1[0].id, t1[1].id)), frozenset((t2[0].id, t2[1].id))]
            opp_keys = [frozenset((a.id, b.id)) for a in t1 for b in t2]
            score = (
                sum(rest[p.id] for p in quad) * 1.0
                - sum(partner_count.get(k, 0) for k in pair_keys) * 2.0
                - sum(opponent_count.get(k, 0) for k in opp_keys) * 1.0
            )
            if best_score is None or score > best_score:
                best_score = score
                best = (quad, split)

        if best is None:
            raise ValueError(f"第 {r} 局无法生成合法对局，请检查名单等级分布")

        quad, (t1, t2) = best
        rounds.append(RoundDraft(
            seq=r, p1=t1[0].id, p2=t1[1].id, p3=t2[0].id, p4=t2[1].id,
            is_shuffle=is_shuffle_round,
        ))
        chosen_ids = {p.id for p in quad}
        for p in players:
            rest[p.id] += 1
            streak[p.id] = streak[p.id] + 1 if p.id in chosen_ids else 0
        for p in quad:
            played[p.id] += 1
            rest[p.id] = 0
        for pair in (t1, t2):
            k = frozenset((pair[0].id, pair[1].id))
            partner_count[k] = partner_count.get(k, 0) + 1
        for a in t1:
            for b in t2:
                k = frozenset((a.id, b.id))
                opponent_count[k] = opponent_count.get(k, 0) + 1
        last_court = chosen_ids

    return rounds
```

- [ ] **Step 4: 跑全部调度测试**

Run: `python -m pytest tests/test_scheduler_schedule.py tests/test_scheduler_rules.py -v`
Expected: 全部 PASS。若 `test_shuffle_breaks_two_group_lock` 不过，检查洗牌局候选生成与搭档新鲜度权重。

- [ ] **Step 5: Commit**

```bash
git add backend/app/scheduler.py backend/tests/test_scheduler_schedule.py
git commit -m "feat(scheduler): full schedule generation with shuffle rounds and play tolerance"
```

## Task 5: 排名计算（纯函数）

**Files:**
- Create: `backend/app/ranking.py`
- Test: `backend/tests/test_ranking.py`

- [ ] **Step 1: 写失败测试**

```python
from app.ranking import compute_ranking, RankRow

def row(pid, pts, wins, games):
    return RankRow(player_id=pid, points=pts, wins=wins, games=games)

def test_ranking_basic_and_ties():
    rows = [row(1, 8, 2, 2), row(2, -3, 1, 3), row(3, 8, 2, 2)]
    ranked = compute_ranking(rows)
    assert ranked[0]["rank"] == 1 and ranked[1]["rank"] == 1
    assert ranked[2]["rank"] == 3

def test_ranking_tiebreak_games():
    rows = [row(1, 5, 2, 3), row(2, 5, 2, 4)]
    ranked = compute_ranking(rows)
    assert ranked[0]["player_id"] == 1
```

- [ ] **Step 2: 跑测试确认失败** → FAIL

- [ ] **Step 3: 实现 ranking.py**

```python
from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class RankRow:
    player_id: int
    points: int
    wins: int
    games: int

def compute_ranking(rows: list[RankRow]) -> list[dict]:
    """排序键：净胜分↓、胜局↓、总局数↑、player_id↑；全同则同名次。"""
    ordered = sorted(rows, key=lambda r: (-r.points, -r.wins, r.games, r.player_id))
    result = []
    prev_key = None
    prev_rank = 0
    for i, r in enumerate(ordered, start=1):
        key = (r.points, r.wins, r.games)
        rank = prev_rank if key == prev_key else i
        result.append({
            "player_id": r.player_id,
            "points": r.points,
            "wins": r.wins,
            "games": r.games,
            "rank": rank,
        })
        if key != prev_key:
            prev_key = key
            prev_rank = rank
    return result
```

- [ ] **Step 4: 跑测试确认通过** → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/ranking.py backend/tests/test_ranking.py
git commit -m "feat(ranking): net points ranking with tiebreak rules"
```

## Task 6: 比赛/球员/认领 API

**Files:**
- Create: `backend/app/schemas.py`
- Create: `backend/app/routers/__init__.py`（空）
- Create: `backend/app/routers/matches.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: 写失败测试**

```python
def create_match(client, **kw):
    body = {"name": "周日夜场", "admin_password": "8888", "duration_minutes": 180, **kw}
    r = client.post("/api/match", json=body)
    assert r.status_code == 200, r.text
    return r.json()

def test_create_match_returns_invite_code(client):
    data = create_match(client)
    assert len(data["invite_code"]) == 6
    assert data["id"] > 0

def test_add_players_requires_admin_token(client):
    data = create_match(client)
    r = client.post(f"/api/match/{data['id']}/players",
                    json={"admin_token": "wrong", "players": [{"name": "阿伟", "level": "H"}]})
    assert r.status_code == 403
    r2 = client.post(f"/api/match/{data['id']}/players",
                     json={"admin_token": data["admin_token"],
                           "players": [{"name": "阿伟", "level": "H"},
                                        {"name": "小美", "level": "M"}]})
    assert r2.status_code == 200
    assert len(r2.json()["players"]) == 2

def test_claim_and_conflict(client):
    data = create_match(client)
    client.post(f"/api/match/{data['id']}/players",
                json={"admin_token": data["admin_token"],
                      "players": [{"name": "阿伟", "level": "H"}, {"name": "小美", "level": "M"}]})
    r = client.post(f"/api/match/{data['id']}/claim",
                    json={"invite_code": data["invite_code"], "player_id": 1, "claim_token": "tok-A"})
    assert r.status_code == 200
    r2 = client.post(f"/api/match/{data['id']}/claim",
                     json={"invite_code": data["invite_code"], "player_id": 1, "claim_token": "tok-B"})
    assert r2.status_code == 409
    r3 = client.post(f"/api/match/{data['id']}/claim",
                     json={"invite_code": data["invite_code"], "player_id": 1, "claim_token": "tok-A"})
    assert r3.status_code == 200

def test_claim_wrong_code(client):
    data = create_match(client)
    r = client.post(f"/api/match/{data['id']}/claim",
                    json={"invite_code": "000000", "player_id": 1, "claim_token": "tok-A"})
    assert r.status_code == 404
```

- [ ] **Step 2: 跑测试确认失败** → FAIL

- [ ] **Step 3: 实现 schemas.py**

```python
from pydantic import BaseModel, Field

class MatchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    admin_password: str = Field(min_length=4, max_length=32)
    duration_minutes: int = Field(default=180, ge=30, le=600)

class PlayerIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    level: str = Field(pattern="^[HML]$")

class PlayersAdd(BaseModel):
    admin_token: str
    players: list[PlayerIn]

class ClaimIn(BaseModel):
    invite_code: str
    player_id: int
    claim_token: str

class ScoreIn(BaseModel):
    score1: int = Field(ge=0, le=15)
    score2: int = Field(ge=0, le=15)
    version: int
    operator: str = Field(default="unknown", max_length=32)

class AdminToken(BaseModel):
    admin_token: str
```

- [ ] **Step 4: 实现 routers/matches.py（第一批端点）**

```python
import random
import string
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.hash import pbkdf2_sha256

from ..database import get_db
from ..models import Match, Player
from ..schemas import MatchCreate, PlayersAdd, ClaimIn, AdminToken

router = APIRouter(prefix="/api")

def _gen_code():
    return "".join(random.choices(string.digits, k=6))

def _get_match(db: Session, match_id: int) -> Match:
    m = db.get(Match, match_id)
    if not m:
        raise HTTPException(404, "比赛不存在")
    return m

def _check_admin(db: Session, match: Match, token: str):
    if not pbkdf2_sha256.verify(token, match.admin_password_hash):
        raise HTTPException(403, "管理员密码错误")

@router.post("/match")
def create_match(body: MatchCreate, db: Session = Depends(get_db)):
    code = _gen_code()
    while db.query(Match).filter_by(invite_code=code).first():
        code = _gen_code()
    m = Match(name=body.name, invite_code=code,
              admin_password_hash=pbkdf2_sha256.hash(body.admin_password),
              duration_minutes=body.duration_minutes)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id, "invite_code": m.invite_code, "admin_token": body.admin_password}

@router.post("/match/{match_id}/players")
def add_players(match_id: int, body: PlayersAdd, db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    _check_admin(db, m, body.admin_token)
    for p in body.players:
        db.add(Player(match_id=m.id, name=p.name, level=p.level))
    db.commit()
    return {"players": [{"id": p.id, "name": p.name, "claimed": p.claim_token is not None}
                        for p in m.players]}

@router.post("/match/{match_id}/claim")
def claim(match_id: int, body: ClaimIn, db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    if m.invite_code != body.invite_code:
        raise HTTPException(404, "口令错误")
    p = db.get(Player, body.player_id)
    if not p or p.match_id != m.id:
        raise HTTPException(404, "球员不存在")
    if p.claim_token:
        if p.claim_token == body.claim_token:
            return {"ok": True, "player_id": p.id}
        raise HTTPException(409, "该球员已被认领")
    p.claim_token = body.claim_token
    db.commit()
    return {"ok": True, "player_id": p.id}
```

- [ ] **Step 5: main.py 注册路由**

```python
from fastapi import FastAPI
from .routers import matches
from .database import init_db

app = FastAPI(title="羽毛球双打小程序 API", version="1.0.0")
app.include_router(matches.router)
init_db()

@app.get("/api/health")
def health():
    return {"ok": True}
```

- [ ] **Step 6: 跑测试确认通过** → PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/routers backend/app/main.py backend/tests/test_api.py
git commit -m "feat(api): match creation, players, claim endpoints"
```

## Task 7: 赛程/记分/排名/重排/移除 API + state 端点

**Files:**
- Modify: `backend/app/routers/matches.py`
- Modify: `backend/tests/test_api.py`（追加）

- [ ] **Step 1: 追加失败测试**

```python
def setup_full_match(client, n=8):
    data = create_match(client)
    lvls = ["H","H","M","M","M","M","L","L"][:n]
    client.post(f"/api/match/{data['id']}/players",
                json={"admin_token": data["admin_token"],
                      "players": [{"name": f"P{i}", "level": lv} for i, lv in enumerate(lvls, 1)]})
    return data

def test_schedule_and_state(client):
    data = setup_full_match(client)
    r = client.post(f"/api/match/{data['id']}/schedule", json={"admin_token": data["admin_token"]})
    assert r.status_code == 200
    assert len(r.json()["rounds"]) == 15
    r2 = client.get(f"/api/match/{data['id']}/state?invite_code={data['invite_code']}")
    assert r2.status_code == 200
    state = r2.json()
    assert "level" not in state["players"][0]

def test_score_with_optimistic_lock(client):
    data = setup_full_match(client)
    client.post(f"/api/match/{data['id']}/schedule", json={"admin_token": data["admin_token"]})
    rounds = client.get(f"/api/match/{data['id']}/state?invite_code={data['invite_code']}").json()["rounds"]
    rid = rounds[0]["id"]
    r = client.post(f"/api/round/{rid}/score", json={"score1": 15, "score2": 7, "version": 0, "operator": "P1"})
    assert r.status_code == 200
    r2 = client.post(f"/api/round/{rid}/score", json={"score1": 15, "score2": 9, "version": 0, "operator": "P2"})
    assert r2.status_code == 409
    r3 = client.post(f"/api/round/{rid}/score", json={"score1": 15, "score2": 9, "version": 1, "operator": "P2"})
    assert r3.status_code == 200

def test_score_validation(client):
    data = setup_full_match(client)
    client.post(f"/api/match/{data['id']}/schedule", json={"admin_token": data["admin_token"]})
    rounds = client.get(f"/api/match/{data['id']}/state?invite_code={data['invite_code']}").json()["rounds"]
    rid = rounds[0]["id"]
    r = client.post(f"/api/round/{rid}/score", json={"score1": 14, "score2": 7, "version": 0})
    assert r.status_code == 422
    r2 = client.post(f"/api/round/{rid}/score", json={"score1": 15, "score2": 15, "version": 0})
    assert r2.status_code == 422

def test_ranking_after_scores(client):
    data = setup_full_match(client)
    client.post(f"/api/match/{data['id']}/schedule", json={"admin_token": data["admin_token"]})
    state = client.get(f"/api/match/{data['id']}/state?invite_code={data['invite_code']}").json()
    rid = state["rounds"][0]["id"]
    client.post(f"/api/round/{rid}/score", json={"score1": 15, "score2": 7, "version": 0, "operator": "P1"})
    rk = client.get(f"/api/match/{data['id']}/ranking").json()
    ids = {row["player_id"]: row for row in rk}
    winners = {state["rounds"][0]["p1"], state["rounds"][0]["p2"]}
    for pid in winners:
        assert ids[pid]["points"] == 8

def test_remove_player_and_reschedule(client):
    data = setup_full_match(client)
    client.post(f"/api/match/{data['id']}/schedule", json={"admin_token": data["admin_token"]})
    rid = client.get(f"/api/match/{data['id']}/state?invite_code={data['invite_code']}").json()["rounds"][0]["id"]
    client.post(f"/api/round/{rid}/score", json={"score1": 15, "score2": 7, "version": 0})
    r = client.post(f"/api/match/{data['id']}/remove-player",
                    json={"admin_token": data["admin_token"], "player_id": 8})
    assert r.status_code == 200
    r2 = client.post(f"/api/match/{data['id']}/reschedule", json={"admin_token": data["admin_token"]})
    assert r2.status_code == 200
    state = client.get(f"/api/match/{data['id']}/state?invite_code={data['invite_code']}").json()
    assert len(state["rounds"]) > 0
    assert state["rounds"][0]["status"] == "done"
```

- [ ] **Step 2: 跑测试确认失败** → FAIL

- [ ] **Step 3: 追加实现（routers/matches.py 顶部补充导入）**

```python
from fastapi import Query
from datetime import datetime
from ..models import Round as RoundModel, ScoreLog
from ..schemas import ScoreIn
from ..scheduler import SchedPlayer, generate_schedule
from ..ranking import RankRow, compute_ranking
```

- [ ] **Step 4: 追加端点实现**

```python
@router.post("/match/{match_id}/schedule")
def make_schedule(match_id: int, body: AdminToken, db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    _check_admin(db, m, body.admin_token)
    if len(m.players) < 4:
        raise HTTPException(422, "至少需要 4 名球员")
    sched = [SchedPlayer(id=p.id, name=p.name, level=p.level) for p in m.players]
    try:
        drafts = generate_schedule(sched, total_minutes=m.duration_minutes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.query(RoundModel).filter(RoundModel.match_id == m.id,
                                RoundModel.status == "pending").delete()
    for d in drafts:
        db.add(RoundModel(match_id=m.id, seq=d.seq, p1=d.p1, p2=d.p2,
                          p3=d.p3, p4=d.p4, is_shuffle=d.is_shuffle))
    db.commit()
    rounds = db.query(RoundModel).filter_by(match_id=m.id).order_by(RoundModel.seq).all()
    return {"rounds": [{"id": r.id, "seq": r.seq} for r in rounds]}

def _round_out(r):
    return {"id": r.id, "seq": r.seq, "p1": r.p1, "p2": r.p2, "p3": r.p3, "p4": r.p4,
            "score1": r.score1, "score2": r.score2, "status": r.status,
            "is_shuffle": r.is_shuffle, "version": r.version}

def _state_out(m: Match, db: Session, with_levels: bool = False):
    rounds = db.query(RoundModel).filter_by(match_id=m.id).order_by(RoundModel.seq).all()
    done = [r for r in rounds if r.status == "done"]
    rows = []
    for p in m.players:
        pts = wins = games = 0
        for r in done:
            s1, s2 = r.score1 or 0, r.score2 or 0
            if p.id in (r.p1, r.p2):
                pts += s1 - s2
                games += 1
                wins += 1 if s1 > s2 else 0
            elif p.id in (r.p3, r.p4):
                pts += s2 - s1
                games += 1
                wins += 1 if s2 > s1 else 0
        rows.append(RankRow(player_id=p.id, points=pts, wins=wins, games=games))
    player_out = {"id": p.id, "name": p.name, "claimed": p.claim_token is not None}
    if with_levels:
        player_out["level"] = p.level
    return {
        "match": {"id": m.id, "name": m.name, "duration_minutes": m.duration_minutes,
                  "status": m.status},
        "players": [dict(player_out, id=p.id, name=p.name,
                          claimed=p.claim_token is not None,
                          **({"level": p.level} if with_levels else {})) for p in m.players],
        "rounds": [_round_out(r) for r in rounds],
        "ranking": compute_ranking(rows),
    }

@router.get("/match/{match_id}/state")
def match_state(match_id: int, invite_code: str = Query(...), db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    if m.invite_code != invite_code:
        raise HTTPException(404, "口令错误")
    return _state_out(m, db)

@router.post("/round/{round_id}/score")
def record_score(round_id: int, body: ScoreIn, db: Session = Depends(get_db)):
    r = db.get(RoundModel, round_id)
    if not r:
        raise HTTPException(404, "小局不存在")
    if (body.score1 == 15) == (body.score2 == 15):
        raise HTTPException(422, "必须且只能一方得到 15 分")
    if r.version != body.version:
        raise HTTPException(409, "比分已被他人更新，请刷新后重试")
    db.add(ScoreLog(round_id=r.id, old_score1=r.score1, old_score2=r.score2,
                    new_score1=body.score1, new_score2=body.score2, operator=body.operator))
    r.score1, r.score2 = body.score1, body.score2
    r.status = "done"
    r.version += 1
    r.played_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "version": r.version}

@router.get("/match/{match_id}/ranking")
def match_ranking(match_id: int, db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    return _state_out(m, db)["ranking"]

@router.post("/match/{match_id}/remove-player")
def remove_player(match_id: int, body: dict, db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    _check_admin(db, m, body["admin_token"])
    p = db.get(Player, body["player_id"])
    if not p or p.match_id != m.id:
        raise HTTPException(404, "球员不存在")
    for col in ("p1", "p2", "p3", "p4"):
        db.query(RoundModel).filter(RoundModel.match_id == m.id,
                                    RoundModel.status == "pending",
                                    getattr(RoundModel, col) == p.id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}

@router.post("/match/{match_id}/reschedule")
def reschedule(match_id: int, body: AdminToken, db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    _check_admin(db, m, body.admin_token)
    done = db.query(RoundModel).filter_by(match_id=m.id, status="done").all()
    remaining_minutes = max(0, m.duration_minutes - len(done) * 12)
    sched = [SchedPlayer(id=p.id, name=p.name, level=p.level) for p in m.players]
    try:
        drafts = generate_schedule(sched, total_minutes=remaining_minutes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.query(RoundModel).filter(RoundModel.match_id == m.id,
                                RoundModel.status == "pending").delete()
    for d in drafts:
        db.add(RoundModel(match_id=m.id, seq=d.seq, p1=d.p1, p2=d.p2,
                          p3=d.p3, p4=d.p4, is_shuffle=d.is_shuffle))
    db.commit()
    return {"ok": True, "new_rounds": len(drafts)}
```

注：`_state_out` 中 player 列表用推导式生成（上面代码中 player_out 变量为草稿，最终版直接在推导式里构造）。

- [ ] **Step 5: 跑全部后端测试**

Run: `python -m pytest -v` → 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/matches.py backend/tests/test_api.py
git commit -m "feat(api): schedule, scoring with optimistic lock, ranking, reschedule"
```

## Task 8: Dockerfile 与部署文档

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Create: `DEPLOY.md`（项目根）

- [ ] **Step 1: Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV BADMINTON_DB=/data/badminton.db
RUN mkdir -p /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: .dockerignore**

```
__pycache__/
*.pyc
tests/
badminton.db
.venv/
```

- [ ] **Step 3: DEPLOY.md（微信云托管部署步骤）**

```markdown
# 部署到微信云托管

1. 注册微信小程序 AppID（mp.weixin.qq.com，个人主体免费）。
2. 微信开发者工具 → 云托管（或 console.cloud.weixin.qq.com）开通，绑定小程序。
3. 上传 backend/ 目录（含 Dockerfile）创建服务，端口 8000。
4. 记下服务默认域名（形如 https://xxx.gz.apigw.tencentcs.com）。
5. 小程序后台 → 开发管理 → 服务器域名 → request 合法域名添加云托管域名。
6. frontend/utils/api.js 的 BASE_URL 填入该域名。
7. 注意：容器内 SQLite 在重新部署时会重置；每场活动创建新比赛即可。若需持久化，后续可换云托管 MySQL。

本地开发：cd backend && uvicorn app.main:app --reload --port 8000
```

- [ ] **Step 4: 本地镜像验证（无 docker 则跳过，云托管控制台构建时验证）**

Run: `docker build -t badminton-backend ./backend` → 成功

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore DEPLOY.md
git commit -m "build: dockerfile and wechat cloud deploy guide"
```


---

# Phase B：前端（Task 9–15）

## Task 9: uni-app Vue2 骨架 + API 封装

**Files:**
- Create: `frontend/package.json`、`frontend/manifest.json`、`frontend/pages.json`、`frontend/main.js`、`frontend/App.vue`
- Create: `frontend/utils/api.js`、`frontend/utils/store.js`

- [ ] **Step 1: 获取 uni-app Vue2 脚手架**

Run: `npx degit dcloudio/uni-preset-vue#vue2 frontend`（在 badminton-miniapp 目录）
若网络失败：申请升级权限重试；仍失败则与用户确认是否降级为原生微信小程序（零构建依赖，页面代码结构不变，WXML/WXSS 语法）。
Expected: 生成 Vue2 模板（src 目录或根目录结构）

- [ ] **Step 2: pages.json（6 页面注册 + tabBar + 全局样式）**

```json
{
  "pages": [
    {"path": "pages/entry/entry", "style": {"navigationBarTitleText": "夜场球馆"}},
    {"path": "pages/claim/claim", "style": {"navigationBarTitleText": "选择你的名字"}},
    {"path": "pages/home/home", "style": {"navigationBarTitleText": "比赛"}},
    {"path": "pages/schedule/schedule", "style": {"navigationBarTitleText": "赛程"}},
    {"path": "pages/ranking/ranking", "style": {"navigationBarTitleText": "排行榜"}},
    {"path": "pages/admin/admin", "style": {"navigationBarTitleText": "管理"}}
  ],
  "globalStyle": {
    "navigationBarBackgroundColor": "#0D1F1A",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#0D1F1A"
  },
  "tabBar": {
    "color": "#7C8F87",
    "selectedColor": "#D8F34E",
    "backgroundColor": "#0D1F1A",
    "list": [
      {"pagePath": "pages/home/home", "text": "比赛"},
      {"pagePath": "pages/schedule/schedule", "text": "赛程"},
      {"pagePath": "pages/ranking/ranking", "text": "排行榜"},
      {"pagePath": "pages/admin/admin", "text": "管理"}
    ]
  }
}
```

- [ ] **Step 3: utils/api.js**

```javascript
const BASE_URL = 'http://127.0.0.1:8000' // 部署时替换为云托管域名

const request = (method, url, data) => new Promise((resolve, reject) => {
  uni.request({
    url: BASE_URL + url, method, data,
    header: {'content-type': 'application/json'},
    success: res => {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data)
      else reject({statusCode: res.statusCode, message: (res.data && res.data.detail) || '请求失败'})
    },
    fail: () => reject({message: '网络异常，请检查网络后重试'})
  })
})

export const api = {
  createMatch: (body) => request('POST', '/api/match', body),
  addPlayers: (matchId, body) => request('POST', '/api/match/' + matchId + '/players', body),
  claim: (matchId, body) => request('POST', '/api/match/' + matchId + '/claim', body),
  schedule: (matchId, body) => request('POST', '/api/match/' + matchId + '/schedule', body),
  state: (matchId, code) => request('GET', '/api/match/' + matchId + '/state?invite_code=' + code),
  stateByCode: (code) => request('GET', '/api/match/by-code?invite_code=' + code),
  adminState: (matchId, code, token) => request('GET', '/api/match/' + matchId + '/admin-state?invite_code=' + code + '&admin_token=' + token),
  score: (roundId, body) => request('POST', '/api/round/' + roundId + '/score', body),
  reschedule: (matchId, body) => request('POST', '/api/match/' + matchId + '/reschedule', body),
  removePlayer: (matchId, body) => request('POST', '/api/match/' + matchId + '/remove-player', body)
}
```

- [ ] **Step 4: utils/store.js**

```javascript
export const store = {
  state: {
    matchId: null,
    inviteCode: '',
    myPlayerId: null,
    claimToken: '',
    adminToken: ''
  },
  persist() {
    uni.setStorageSync('badminton_store', JSON.stringify(this.state))
  },
  restore() {
    const raw = uni.getStorageSync('badminton_store')
    if (raw) { try { Object.assign(this.state, JSON.parse(raw)) } catch (e) {} }
    return this.state
  },
  reset() {
    this.state = { matchId: null, inviteCode: '', myPlayerId: null, claimToken: '', adminToken: '' }
    uni.removeStorageSync('badminton_store')
  }
}
```

- [ ] **Step 5: main.js + App.vue**

```javascript
import Vue from 'vue'
import App from './App'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({ ...App })
app.$mount()
```

```vue
<script>
export default { onLaunch() {} }
</script>
<style>
page { background: #0D1F1A; color: #F2F7F0; font-family: -apple-system, "PingFang SC", sans-serif; }
</style>
```

- [ ] **Step 6: 编译冒烟**

Run: `npm run dev:mp-weixin`（frontend 目录）
Expected: 生成 dist/dev/mp-weixin，微信开发者工具可导入预览

- [ ] **Step 7: Commit** → `feat(frontend): uni-app vue2 skeleton with api and store`

## Task 10: 进入页 + 认领页 + by-code 端点

**Files:**
- Create: `frontend/pages/entry/entry.vue`
- Create: `frontend/pages/claim/claim.vue`
- Modify: `backend/app/routers/matches.py`（by-code 端点）
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: 后端补 by-code 端点 + 测试**

```python
@router.get("/match/by-code")
def match_by_code(invite_code: str = Query(...), db: Session = Depends(get_db)):
    m = db.query(Match).filter_by(invite_code=invite_code).first()
    if not m:
        raise HTTPException(404, "口令错误")
    return {"match": {"id": m.id, "name": m.name},
            "players": [{"id": p.id, "name": p.name, "claimed": p.claim_token is not None}
                        for p in m.players]}
```

```python
def test_by_code(client):
    data = create_match(client)
    r = client.get(f"/api/match/by-code?invite_code={data['invite_code']}")
    assert r.status_code == 200 and r.json()["match"]["id"] == data["id"]
    r2 = client.get("/api/match/by-code?invite_code=000000")
    assert r2.status_code == 404
```

- [ ] **Step 2: entry.vue**

```vue
<template>
  <view class="page">
    <view class="hero">
      <text class="title">夜场球馆</text>
      <text class="sub">荧光对决 · 双打之夜</text>
    </view>
    <view class="card">
      <input class="code-input" v-model="code" maxlength="6" type="number" placeholder="输入 6 位邀请口令" />
      <button class="btn-primary" :loading="loading" @tap="enter">进入球馆</button>
      <text v-if="error" class="error">{{ error }}</text>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api'
import { store } from '../../utils/store'
export default {
  data() { return { code: '', loading: false, error: '' } },
  onLoad() {
    store.restore()
    if (store.state.matchId && store.state.inviteCode) {
      this.code = store.state.inviteCode
      this.enter(true)
    }
  },
  methods: {
    async enter(silent) {
      if (!/^\d{6}$/.test(this.code)) { if (!silent) this.error = '请输入 6 位数字口令'; return }
      this.loading = true; this.error = ''
      try {
        const res = await api.stateByCode(this.code)
        store.state.matchId = res.match.id
        store.state.inviteCode = this.code
        store.persist()
        if (store.state.myPlayerId) uni.switchTab({ url: '/pages/home/home' })
        else uni.redirectTo({ url: '/pages/claim/claim' })
      } catch (e) {
        if (!silent) this.error = e.message || '口令错误'
      } finally { this.loading = false }
    }
  }
}
</script>

<style>
.page { min-height: 100vh; background: #0D1F1A; padding: 120rpx 48rpx; }
.hero { text-align: center; margin-bottom: 80rpx; }
.title { font-size: 72rpx; font-weight: 800; color: #D8F34E; letter-spacing: 8rpx; }
.sub { display: block; margin-top: 16rpx; color: #7C8F87; font-size: 26rpx; }
.card { background: #12291F; border: 2rpx solid rgba(216,243,78,0.25); border-radius: 24rpx; padding: 48rpx 32rpx; }
.code-input { background: #0D1F1A; color: #F2F7F0; font-size: 48rpx; text-align: center; letter-spacing: 24rpx; padding: 32rpx 0; border: 2rpx solid #2A4438; border-radius: 16rpx; }
.btn-primary { margin-top: 40rpx; background: #D8F34E; color: #0D1F1A; font-weight: 700; border-radius: 16rpx; }
.error { color: #FF5A5F; font-size: 26rpx; margin-top: 24rpx; text-align: center; }
</style>
```

- [ ] **Step 3: claim.vue（网格名单认领）**

```vue
<template>
  <view class="page">
    <text class="tip">找到你的名字，点亮它</text>
    <view class="grid">
      <view v-for="p in players" :key="p.id"
            class="cell" :class="{claimed: p.claimed, me: p.id === myPick}"
            @tap="pick(p)">
        <text class="name">{{ p.name }}</text>
        <text class="state">{{ p.claimed ? '已就位' : '' }}</text>
      </view>
    </view>
    <button class="btn-primary" :disabled="!myPick" :loading="loading" @tap="confirm">认领并进入</button>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>

<script>
import { api } from '../../utils/api'
import { store } from '../../utils/store'
export default {
  data() { return { players: [], myPick: null, loading: false, error: '' } },
  onLoad() { store.restore(); this.load() },
  methods: {
    async load() {
      try { const res = await api.stateByCode(store.state.inviteCode); this.players = res.players }
      catch (e) { this.error = e.message }
    },
    pick(p) {
      if (p.claimed) { uni.showToast({title: '已被认领', icon: 'none'}); return }
      this.myPick = p.id
    },
    async confirm() {
      this.loading = true; this.error = ''
      const token = 'tok-' + Math.random().toString(36).slice(2, 12)
      try {
        await api.claim(store.state.matchId, {
          invite_code: store.state.inviteCode, player_id: this.myPick, claim_token: token
        })
        store.state.myPlayerId = this.myPick
        store.state.claimToken = token
        store.persist()
        uni.switchTab({ url: '/pages/home/home' })
      } catch (e) { this.error = e.message } finally { this.loading = false }
    }
  }
}
</script>

<style>
.page { min-height: 100vh; background: #0D1F1A; padding: 48rpx; }
.tip { color: #7C8F87; text-align: center; display: block; margin-bottom: 48rpx; }
.grid { display: flex; flex-wrap: wrap; }
.cell { width: 31%; margin: 1.16%; border: 2rpx solid #2A4438; border-radius: 20rpx; padding: 36rpx 0; text-align: center; background: #12291F; }
.cell.me { border-color: #D8F34E; box-shadow: 0 0 24rpx rgba(216,243,78,0.35); }
.cell.claimed { opacity: 0.4; }
.name { color: #F2F7F0; font-size: 32rpx; font-weight: 600; }
.state { display: block; color: #7BE0AD; font-size: 22rpx; margin-top: 8rpx; }
.btn-primary { margin-top: 64rpx; background: #D8F34E; color: #0D1F1A; font-weight: 700; border-radius: 16rpx; }
.error { color: #FF5A5F; text-align: center; margin-top: 24rpx; }
</style>
```

- [ ] **Step 4: 编译 + 手动验证**（口令进入 → 认领 → 跳主页）

- [ ] **Step 5: Commit** → `feat(frontend): entry and claim pages`

## Task 11: 比赛主页 + 记分牌组件

**Files:**
- Create: `frontend/components/CourtCard.vue`（球场线卡片——签名视觉）
- Create: `frontend/components/ScoreBoard.vue`
- Create: `frontend/pages/home/home.vue`

- [ ] **Step 1: CourtCard.vue**

```vue
<template>
  <view class="court">
    <view class="court-line outer"></view>
    <view class="court-line mid"></view>
    <view class="court-line short"></view>
    <view class="court-content"><slot></slot></view>
  </view>
</template>

<style>
.court { position: relative; background: #12291F; border-radius: 24rpx; padding: 40rpx 32rpx; overflow: hidden; }
.court-line { position: absolute; border: 2rpx solid rgba(242,247,240,0.18); }
.outer { top: 16rpx; left: 16rpx; right: 16rpx; bottom: 16rpx; border-radius: 16rpx; }
.mid { left: 16rpx; right: 16rpx; top: 50%; border-top: none; border-left: none; border-right: none; }
.short { top: 16rpx; bottom: 16rpx; left: 50%; width: 0; border-top: none; border-bottom: none; border-left: 2rpx dashed rgba(216,243,78,0.35); }
.court-content { position: relative; }
</style>
```

- [ ] **Step 2: ScoreBoard.vue**

```vue
<template>
  <view class="board">
    <view class="team">
      <text class="tname">{{ t1names }}</text>
      <text class="score" :class="{win: score1 > score2}">{{ score1 === null ? '–' : score1 }}</text>
    </view>
    <text class="vs">VS</text>
    <view class="team">
      <text class="tname">{{ t2names }}</text>
      <text class="score" :class="{win: score2 > score1}">{{ score2 === null ? '–' : score2 }}</text>
    </view>
  </view>
</template>

<script>
export default {
  props: { t1names: String, t2names: String, score1: Number, score2: Number }
}
</script>

<style>
.board { display: flex; align-items: center; padding: 24rpx 32rpx; }
.team { flex: 1; text-align: center; }
.tname { color: #F2F7F0; font-size: 28rpx; display: block; margin-bottom: 12rpx; }
.score { font-size: 120rpx; font-weight: 800; color: #F2F7F0; }
.score.win { color: #D8F34E; text-shadow: 0 0 32rpx rgba(216,243,78,0.45); }
.vs { color: #7C8F87; font-size: 28rpx; font-weight: 700; margin: 0 16rpx; }
</style>
```

- [ ] **Step 3: home.vue（当前局 + 记分弹层 + 我的轮转）**

```vue
<template>
  <view class="page">
    <view class="header">
      <text class="match-name">{{ match.name }}</text>
      <text class="round-no">第 {{ currentRound ? currentRound.seq : '-' }} 局{{ currentRound && currentRound.is_shuffle ? ' ⚡' : '' }}</text>
    </view>

    <CourtCard v-if="currentRound">
      <ScoreBoard :t1names="names(currentRound.p1, currentRound.p2)"
                  :t2names="names(currentRound.p3, currentRound.p4)"
                  :score1="currentRound.score1" :score2="currentRound.score2" />
      <button v-if="currentRound.status !== 'done'" class="btn-primary" @tap="openScore">记录这一局比分</button>
      <button v-else class="btn-ghost" @tap="openScore">修改比分</button>
    </CourtCard>

    <view class="me-card" v-if="myNext">
      <text class="me-title">我的轮转</text>
      <text class="me-line">下一场：第 {{ myNext.seq }} 局</text>
      <text class="me-line rest">还要休息 {{ myRestCount }} 局</text>
    </view>

    <view class="score-modal" v-if="scoring" @tap="scoring = false">
      <view class="modal-body" @tap.stop>
        <text class="modal-title">{{ names(currentRound.p1, currentRound.p2) }} VS {{ names(currentRound.p3, currentRound.p4) }}</text>
        <view class="score-row">
          <view class="side">
            <button class="minus" @tap="s1 = Math.max(0, s1 - 1)">−1</button>
            <text class="big">{{ s1 }}</text>
            <button class="plus" @tap="s1 = Math.min(15, s1 + 1)">+1</button>
          </view>
          <text class="colon">:</text>
          <view class="side">
            <button class="minus" @tap="s2 = Math.max(0, s2 - 1)">−1</button>
            <text class="big">{{ s2 }}</text>
            <button class="plus" @tap="s2 = Math.min(15, s2 + 1)">+1</button>
          </view>
        </view>
        <button class="btn-primary" :loading="saving" @tap="save">确认比分</button>
        <text v-if="scoreError" class="error">{{ scoreError }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api'
import { store } from '../../utils/store'
import CourtCard from '../../components/CourtCard.vue'
import ScoreBoard from '../../components/ScoreBoard.vue'

export default {
  components: { CourtCard, ScoreBoard },
  data() { return { match: {}, players: [], rounds: [], ranking: [],
                    currentRound: null, myNext: null, myRestCount: 0,
                    scoring: false, s1: 0, s2: 0, saving: false, scoreError: '' } },
  onShow() { this.refresh() },
  methods: {
    async refresh() {
      try {
        const res = await api.state(store.state.matchId, store.state.inviteCode)
        this.match = res.match; this.players = res.players
        this.rounds = res.rounds; this.ranking = res.ranking
        this.currentRound = this.rounds.find(r => r.status !== 'done') || this.rounds[this.rounds.length - 1]
        this.computeMyStatus()
      } catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
    },
    names(a, b) {
      const m = {}
      this.players.forEach(p => { m[p.id] = p.name })
      return (m[a] || '?') + ' / ' + (m[b] || '?')
    },
    computeMyStatus() {
      const me = store.state.myPlayerId
      if (!me) return
      const myRounds = this.rounds.filter(r => [r.p1, r.p2, r.p3, r.p4].indexOf(me) >= 0)
      const played = myRounds.filter(r => r.status === 'done').length
      this.myNext = myRounds[played] || null
      this.myRestCount = this.myNext && this.currentRound
        ? this.myNext.seq - this.currentRound.seq - 1 : 0
    },
    openScore() {
      this.s1 = this.currentRound.score1 || 0
      this.s2 = this.currentRound.score2 || 0
      this.scoreError = ''; this.scoring = true
    },
    async save() {
      if ((this.s1 === 15) === (this.s2 === 15)) {
        this.scoreError = '必须且只能一方达到 15 分'; return
      }
      const me = this.players.find(p => p.id === store.state.myPlayerId)
      this.saving = true
      try {
        await api.score(this.currentRound.id, {
          score1: this.s1, score2: this.s2,
          version: this.currentRound.version, operator: me ? me.name : 'unknown'
        })
        this.scoring = false
        await this.refresh()
        uni.showToast({ title: '比分已记录', icon: 'success' })
      } catch (e) {
        this.scoreError = e.message || '提交失败，请重试'
      } finally { this.saving = false }
    }
  }
}
</script>

<style>
.page { min-height: 100vh; background: #0D1F1A; padding: 32rpx; }
.header { margin-bottom: 32rpx; }
.match-name { color: #F2F7F0; font-size: 40rpx; font-weight: 700; display: block; }
.round-no { color: #D8F34E; font-size: 30rpx; display: block; margin-top: 8rpx; }
.btn-primary { margin-top: 24rpx; background: #D8F34E; color: #0D1F1A; font-weight: 700; border-radius: 16rpx; }
.btn-ghost { margin-top: 24rpx; background: transparent; color: #7C8F87; border: 2rpx solid #2A4438; border-radius: 16rpx; }
.me-card { margin-top: 32rpx; background: #16301F; border: 2rpx solid rgba(216,243,78,0.3); border-radius: 20rpx; padding: 32rpx; }
.me-title { color: #D8F34E; font-size: 28rpx; font-weight: 700; display: block; margin-bottom: 12rpx; }
.me-line { color: #F2F7F0; font-size: 30rpx; display: block; margin-top: 8rpx; }
.me-line.rest { color: #7BE0AD; }
.score-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(13,31,26,0.92); display: flex; align-items: center; justify-content: center; z-index: 99; }
.modal-body { width: 86%; background: #12291F; border-radius: 32rpx; padding: 48rpx 32rpx; }
.modal-title { color: #F2F7F0; font-size: 28rpx; text-align: center; display: block; margin-bottom: 32rpx; }
.score-row { display: flex; align-items: center; justify-content: space-between; }
.side { flex: 1; display: flex; align-items: center; justify-content: center; }
.big { font-size: 110rpx; font-weight: 800; color: #D8F34E; width: 140rpx; text-align: center; }
.minus, .plus { width: 88rpx; height: 88rpx; line-height: 88rpx; border-radius: 50%; background: #0D1F1A; color: #F2F7F0; font-size: 32rpx; padding: 0; }
.plus { background: #D8F34E; color: #0D1F1A; }
.colon { color: #7C8F87; font-size: 48rpx; margin: 0 8rpx; }
.error { color: #FF5A5F; font-size: 26rpx; text-align: center; margin-top: 24rpx; display: block; }
</style>
```

- [ ] **Step 4: 编译 + 手动验证**（记一局分 → 当前局推进）

- [ ] **Step 5: Commit** → `feat(frontend): home page with scoreboard and scoring modal`

## Task 12: 赛程页

**Files:**
- Create: `frontend/pages/schedule/schedule.vue`

- [ ] **Step 1: schedule.vue**

```vue
<template>
  <view class="page">
    <view v-for="r in rounds" :key="r.id" class="row"
          :class="{done: r.status === 'done', now: r.id === currentId, me: involvesMe(r)}">
      <view class="seq">
        <text class="seq-no">{{ r.seq }}</text>
        <text v-if="r.is_shuffle" class="shuffle">⚡</text>
      </view>
      <view class="teams">
        <view class="team-line">
          <text class="names">{{ names(r.p1, r.p2) }}</text>
          <text class="score">{{ r.score1 !== null ? r.score1 : '' }}</text>
        </view>
        <view class="team-line">
          <text class="names">{{ names(r.p3, r.p4) }}</text>
          <text class="score">{{ r.score2 !== null ? r.score2 : '' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api'
import { store } from '../../utils/store'
export default {
  data() { return { rounds: [], players: [], currentId: null } },
  onShow() { this.refresh() },
  methods: {
    async refresh() {
      try {
        const res = await api.state(store.state.matchId, store.state.inviteCode)
        this.rounds = res.rounds; this.players = res.players
        const cur = res.rounds.find(r => r.status !== 'done')
        this.currentId = cur ? cur.id : null
      } catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
    },
    names(a, b) {
      const m = {}
      this.players.forEach(p => { m[p.id] = p.name })
      return (m[a] || '?') + ' / ' + (m[b] || '?')
    },
    involvesMe(r) {
      const me = store.state.myPlayerId
      return me && [r.p1, r.p2, r.p3, r.p4].indexOf(me) >= 0
    }
  }
}
</script>

<style>
.page { min-height: 100vh; background: #0D1F1A; padding: 24rpx; }
.row { display: flex; align-items: center; background: #12291F; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; border: 2rpx solid transparent; }
.row.done { opacity: 0.75; }
.row.now { border-color: #D8F34E; box-shadow: 0 0 20rpx rgba(216,243,78,0.25); }
.row.me { background: #16301F; }
.seq { width: 80rpx; text-align: center; }
.seq-no { color: #D8F34E; font-size: 40rpx; font-weight: 800; display: block; }
.shuffle { font-size: 24rpx; }
.teams { flex: 1; }
.team-line { display: flex; justify-content: space-between; padding: 6rpx 24rpx; }
.names { color: #F2F7F0; font-size: 28rpx; }
.score { color: #7BE0AD; font-size: 32rpx; font-weight: 700; }
</style>
```

- [ ] **Step 2: 编译 + 手动验证**（列表完整、当前局高亮、我的局底色不同）

- [ ] **Step 3: Commit** → `feat(frontend): schedule page`

## Task 13: 排行榜页

**Files:**
- Create: `frontend/pages/ranking/ranking.vue`

- [ ] **Step 1: ranking.vue（领奖台 + 列表 + 过渡动画）**

```vue
<template>
  <view class="page">
    <view class="podium">
      <view v-for="p in podium" :key="p.player_id" class="podium-item" :class="'pos-' + p.rank">
        <text class="medal">{{ medal(p.rank) }}</text>
        <text class="pname">{{ nameOf(p.player_id) }}</text>
        <text class="ppts">{{ p.points > 0 ? '+' : '' }}{{ p.points }}</text>
      </view>
    </view>
    <view class="list">
      <view v-for="(p, i) in ranking" :key="p.player_id" class="rrow"
            :class="{me: p.player_id === myId}" :style="{transitionDelay: (i * 40) + 'ms'}">
        <text class="rk">{{ p.rank }}</text>
        <text class="nm">{{ nameOf(p.player_id) }}</text>
        <text class="meta">{{ p.wins }}胜 / {{ p.games }}局</text>
        <text class="pts">{{ p.points > 0 ? '+' : '' }}{{ p.points }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api'
import { store } from '../../utils/store'
export default {
  data() { return { ranking: [], players: [], myId: null } },
  onShow() { this.refresh() },
  computed: {
    podium() { return this.ranking.filter(p => p.rank <= 3).slice(0, 3) }
  },
  methods: {
    async refresh() {
      try {
        const res = await api.state(store.state.matchId, store.state.inviteCode)
        this.ranking = res.ranking; this.players = res.players
        this.myId = store.state.myPlayerId
      } catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
    },
    nameOf(id) { const p = this.players.find(x => x.id === id); return p ? p.name : '?' },
    medal(r) { return r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉' }
  }
}
</script>

<style>
.page { min-height: 100vh; background: #0D1F1A; padding: 32rpx; }
.podium { display: flex; margin-bottom: 40rpx; }
.podium-item { flex: 1; margin: 0 10rpx; background: #12291F; border-radius: 20rpx; text-align: center; padding: 32rpx 0; border: 2rpx solid rgba(216,243,78,0.2); }
.pos-1 { border-color: #D8F34E; box-shadow: 0 0 30rpx rgba(216,243,78,0.3); }
.medal { font-size: 48rpx; display: block; }
.pname { color: #F2F7F0; font-size: 30rpx; font-weight: 700; display: block; margin-top: 12rpx; }
.ppts { color: #D8F34E; font-size: 40rpx; font-weight: 800; display: block; margin-top: 8rpx; }
.rrow { display: flex; align-items: center; background: #12291F; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; transition: all 0.3s ease; }
.rrow.me { background: #16301F; border: 2rpx solid rgba(216,243,78,0.4); }
.rk { width: 70rpx; color: #7C8F87; font-size: 34rpx; font-weight: 800; text-align: center; }
.nm { flex: 1; color: #F2F7F0; font-size: 30rpx; font-weight: 600; }
.meta { color: #7C8F87; font-size: 24rpx; margin-right: 24rpx; }
.pts { color: #D8F34E; font-size: 36rpx; font-weight: 800; min-width: 90rpx; text-align: right; }
</style>
```

- [ ] **Step 2: 编译 + 手动验证**（记分后排行榜更新；前三名领奖台）

- [ ] **Step 3: Commit** → `feat(frontend): ranking page with podium`

## Task 14: 管理页 + admin-state 端点

**Files:**
- Create: `frontend/pages/admin/admin.vue`
- Modify: `backend/app/routers/matches.py`（admin-state）
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: 后端补 admin-state 端点 + 测试**

```python
@router.get("/match/{match_id}/admin-state")
def admin_state(match_id: int, invite_code: str = Query(...),
                admin_token: str = Query(...), db: Session = Depends(get_db)):
    m = _get_match(db, match_id)
    if m.invite_code != invite_code:
        raise HTTPException(404, "口令错误")
    _check_admin(db, m, admin_token)
    return _state_out(m, db, with_levels=True)
```

_state_out 增加参数 `with_levels: bool = False`：True 时 players 每项含 `level` 字段（管理员可见）。
测试：正确 token 返回 level；错误 token 返回 403。

- [ ] **Step 2: admin.vue（密码 → 建赛/加人/等级🏸/排班/重排/移除）**

```vue
<template>
  <view class="page">
    <view v-if="!unlocked" class="lock">
      <input class="pw" type="password" v-model="pw" placeholder="管理员密码" />
      <button class="btn-primary" @tap="unlock">进入管理</button>
      <text v-if="error" class="error">{{ error }}</text>
    </view>

    <view v-else>
      <view class="section">
        <text class="sec-title">创建比赛</text>
        <input class="ipt" v-model="newName" placeholder="比赛名称（如：周日夜场）" />
        <input class="ipt" type="number" v-model="newDuration" placeholder="总时长（分钟，默认180）" />
        <button class="btn-primary" @tap="createMatch">创建并生成口令</button>
        <view v-if="created" class="code-box">
          <text class="code">{{ created.invite_code }}</text>
          <text class="hint">把口令发给球友</text>
        </view>
      </view>

      <view class="section">
        <text class="sec-title">球员名单（{{ players.length }}人）</text>
        <view class="add-row">
          <input class="ipt short" v-model="pName" placeholder="姓名" />
          <picker :range="['低','中','高']" @change="onLevelPick">
            <view class="lv-pick">水平：{{ levelText(pLevel) }}</view>
          </picker>
          <button class="btn-mini" @tap="addPlayer">添加</button>
        </view>
        <view v-for="p in players" :key="p.id" class="prow">
          <text class="pn">{{ p.name }}</text>
          <text class="pl">{{ '🏸'.repeat(levelNum(p.level)) }}</text>
          <button class="rm" @tap="removePlayer(p)">移除</button>
        </view>
      </view>

      <view class="section">
        <text class="sec-title">赛程</text>
        <button class="btn-primary" @tap="genSchedule">生成赛程</button>
        <button class="btn-ghost" @tap="doReschedule">重排剩余场次</button>
        <text v-if="scheduleMsg" class="msg">{{ scheduleMsg }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api'
import { store } from '../../utils/store'
export default {
  data() { return { unlocked: false, pw: '', error: '',
                    newName: '', newDuration: '180', created: null,
                    players: [], pName: '', pLevel: 'M', scheduleMsg: '' } },
  methods: {
    levelText(l) { return { H: '高', M: '中', L: '低' }[l] },
    levelNum(l) { return { H: 3, M: 2, L: 1 }[l] },
    onLevelPick(e) { this.pLevel = ['L', 'M', 'H'][e.detail.value] },
    async unlock() {
      this.error = ''
      if (store.state.matchId && store.state.adminToken) {
        try {
          const res = await api.adminState(store.state.matchId, store.state.inviteCode, store.state.adminToken)
          this.players = res.players; this.unlocked = true; return
        } catch (e) { /* fallthrough */ }
      }
      if (this.created) { this.unlocked = true; return }
      if (!store.state.matchId) { this.error = '请先创建比赛'; return }
      try {
        const res = await api.adminState(store.state.matchId, store.state.inviteCode, this.pw)
        store.state.adminToken = this.pw; store.persist()
        this.players = res.players; this.unlocked = true
      } catch (e) { this.error = e.message || '密码错误' }
    },
    async createMatch() {
      this.error = ''
      const pw = this.pw || '8888'
      try {
        const res = await api.createMatch({ name: this.newName || '夜场球馆',
                                            admin_password: pw,
                                            duration_minutes: parseInt(this.newDuration) || 180 })
        this.created = res
        store.state.matchId = res.id
        store.state.inviteCode = res.invite_code
        store.state.adminToken = pw
        store.persist()
        this.unlocked = true
        uni.showToast({ title: '口令已生成', icon: 'success' })
      } catch (e) { this.error = e.message }
    },
    async loadPlayers() {
      const res = await api.adminState(store.state.matchId, store.state.inviteCode, store.state.adminToken)
      this.players = res.players
    },
    async addPlayer() {
      if (!this.pName) return
      try {
        await api.addPlayers(store.state.matchId, {
          admin_token: store.state.adminToken,
          players: [{ name: this.pName, level: this.pLevel }]
        })
        this.pName = ''
        await this.loadPlayers()
      } catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
    },
    async removePlayer(p) {
      const ok = await new Promise(r => uni.showModal({
        title: '移除球员', content: '确定移除 ' + p.name + '？未打的场次将一并删除', success: res => r(res.confirm)
      }))
      if (!ok) return
      await api.removePlayer(store.state.matchId, { admin_token: store.state.adminToken, player_id: p.id })
      await this.loadPlayers()
    },
    async genSchedule() {
      try {
        const res = await api.schedule(store.state.matchId, { admin_token: store.state.adminToken })
        this.scheduleMsg = '已生成 ' + res.rounds.length + ' 局'
      } catch (e) { this.scheduleMsg = e.message }
    },
    async doReschedule() {
      try {
        const res = await api.reschedule(store.state.matchId, { admin_token: store.state.adminToken })
        this.scheduleMsg = '已重排，剩余 ' + res.new_rounds + ' 局'
      } catch (e) { this.scheduleMsg = e.message }
    }
  }
}
</script>

<style>
.page { min-height: 100vh; background: #0D1F1A; padding: 32rpx; }
.lock { margin-top: 160rpx; }
.pw { background: #12291F; color: #F2F7F0; border: 2rpx solid #2A4438; border-radius: 16rpx; padding: 24rpx; margin-bottom: 24rpx; }
.section { background: #12291F; border-radius: 24rpx; padding: 32rpx; margin-bottom: 32rpx; }
.sec-title { color: #D8F34E; font-size: 30rpx; font-weight: 700; display: block; margin-bottom: 24rpx; }
.ipt { background: #0D1F1A; color: #F2F7F0; border: 2rpx solid #2A4438; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; }
.ipt.short { flex: 1; margin-bottom: 0; }
.add-row { display: flex; align-items: center; margin-bottom: 24rpx; }
.lv-pick { color: #F2F7F0; font-size: 26rpx; padding: 24rpx; }
.btn-mini { background: #D8F34E; color: #0D1F1A; font-size: 26rpx; border-radius: 12rpx; margin: 0 0 0 16rpx; }
.prow { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 2rpx solid #1C3327; }
.pn { flex: 1; color: #F2F7F0; font-size: 30rpx; }
.pl { color: #D8F34E; }
.rm { font-size: 22rpx; color: #FF5A5F; background: transparent; border: 2rpx solid rgba(255,90,95,0.4); border-radius: 12rpx; padding: 0 20rpx; }
.code-box { margin-top: 24rpx; text-align: center; }
.code { color: #D8F34E; font-size: 64rpx; font-weight: 800; letter-spacing: 16rpx; }
.hint { display: block; color: #7C8F87; font-size: 24rpx; margin-top: 8rpx; }
.btn-primary { background: #D8F34E; color: #0D1F1A; font-weight: 700; border-radius: 16rpx; }
.btn-ghost { margin-top: 20rpx; background: transparent; color: #7C8F87; border: 2rpx solid #2A4438; border-radius: 16rpx; }
.msg { color: #7BE0AD; font-size: 26rpx; display: block; margin-top: 16rpx; }
.error { color: #FF5A5F; text-align: center; margin-top: 24rpx; }
</style>
```

- [ ] **Step 3: 编译 + 手动验证全流程**：创建 → 加 8 人（2高4中2低）→ 生成 15 局 → 口令进入认领 → 记分 → 排行榜更新

- [ ] **Step 4: Commit** → `feat(frontend): admin page with level management`

## Task 15: 视觉打磨 + 真机联调 + README

**Files:**
- Modify: 各页面样式微调
- Create: `README.md`

- [ ] **Step 1: 视觉自查清单**
- 色板一致：底 #0D1F1A、卡 #12291F、荧光黄 #D8F34E、白 #F2F7F0、珊瑚红 #FF5A5F、青柠 #7BE0AD
- 球场线元素（CourtCard）用于主页
- 记分弹层 +1/−1 按钮热区 88rpx、大数字
- 排名行 transition 动画
- 普通球员所有页面无 level 字样（检查 state 响应）

- [ ] **Step 2: 真机预览**

微信开发者工具 → 预览 → 手机扫码；BASE_URL 指向电脑局域网 IP（手机与电脑同网）验证完整流程。

- [ ] **Step 3: README.md**

```markdown
# 羽毛球双打小程序 · 夜场球馆

微信小程序 + FastAPI：管理员建赛管人（高/中/低等级），球员认领、记分、净胜分实时排名；
排班算法满足等级规则、局数均衡（差 ≤ 1）、打一歇一 + 洗牌局。

- 设计文档：docs/superpowers/specs/2026-09-20-badminton-doubles-miniapp-design.md
- 实施计划：docs/superpowers/plans/2026-09-20-badminton-miniapp.md
- 部署：见 DEPLOY.md
- 后端测试：cd backend && python -m pytest -v

## 快速开始（本地）
1. cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000
2. frontend/utils/api.js 的 BASE_URL 改为电脑局域网 IP
3. cd frontend && npm run dev:mp-weixin
4. 微信开发者工具打开 dist/dev/mp-weixin
```

- [ ] **Step 4: 全量回归**

Run: `cd backend && python -m pytest -v` → 全部 PASS

- [ ] **Step 5: Commit** → `docs: readme and visual polish`

---

## 计划自审记录

- **Spec 覆盖**：9 个核心 API + 补充 by-code/admin-state（Task 6/7/10/14）；排班规则 6.1–6.5（Task 3/4）；排名并列（Task 5）；页面 6+1（Task 10–14）；视觉方向（Task 9–15）；部署（Task 8）✓
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码 ✓
- **类型一致性**：RoundDraft(p1-p4) ↔ Round 模型字段；RankRow(player_id,points,wins,games) ↔ ranking 响应；api.js 方法名 ↔ 路由路径 ✓
- **已知简化**：_state_out 中 players 构造以 Task 7 Step 4 代码为准（直接推导式）；reschedule 的 12 分钟/局与生成器默认值一致 ✓
