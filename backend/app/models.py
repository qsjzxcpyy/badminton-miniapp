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
