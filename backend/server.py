"""
server.py — FastAPI backend for the MT5-enabled Trade Journal
"""

import asyncio
import json
import logging
import os
import re
import shutil
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import (
    FastAPI, HTTPException, Query, UploadFile, File, Body, BackgroundTasks
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from mt5_sync import sync_from_file, get_sync_status

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "journal.db"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Database ─────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket INTEGER UNIQUE,
            symbol TEXT NOT NULL,
            trade_type TEXT NOT NULL,
            volume REAL,
            open_price REAL,
            close_price REAL,
            open_time TEXT,
            close_time TEXT,
            stop_loss REAL,
            take_profit REAL,
            commission REAL DEFAULT 0,
            swap REAL DEFAULT 0,
            profit REAL DEFAULT 0,
            magic_number INTEGER,
            mt5_comment TEXT,
            strategy TEXT DEFAULT '',
            setup_tags TEXT DEFAULT '',
            emotion_before TEXT DEFAULT '',
            emotion_during TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            outcome TEXT DEFAULT '',
            pnl REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            source TEXT DEFAULT 'mt5'
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS screenshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)

    # Default settings
    defaults = {
        "currency": "$",
        "instruments": "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,AAPL,TSLA",
        "dailyGoal": "",
        "maxLoss": "",
        "openaiKey": "",
        "mt5_file_path": "",
        "auto_sync": "false",
        "sync_interval": "30",
    }
    for key, value in defaults.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )
    conn.commit()
    conn.close()


# ─── Auto-sync background task ────────────────────────────────────────────────
sync_task: Optional[asyncio.Task] = None


async def auto_sync_loop():
    while True:
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key='auto_sync'")
            row = cursor.fetchone()
            auto_sync = row["value"] == "true" if row else False

            cursor.execute("SELECT value FROM settings WHERE key='sync_interval'")
            row = cursor.fetchone()
            interval = int(row["value"]) if row else 30

            cursor.execute("SELECT value FROM settings WHERE key='mt5_file_path'")
            row = cursor.fetchone()
            file_path = row["value"] if row else ""

            if auto_sync and file_path and Path(file_path).exists():
                try:
                    result = sync_from_file(file_path, conn)
                    now = datetime.now(timezone.utc).isoformat()
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync_time', ?)", (now,)
                    )
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync_result', ?)",
                        (json.dumps(result),),
                    )
                    conn.commit()
                    logger.info("Auto-sync complete: %s", result)
                except Exception as e:
                    logger.error("Auto-sync error: %s", e)
            conn.close()
        except Exception as e:
            logger.error("Auto-sync loop error: %s", e)

        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    SCREENSHOTS_DIR.mkdir(exist_ok=True)
    global sync_task
    sync_task = asyncio.create_task(auto_sync_loop())
    yield
    if sync_task:
        sync_task.cancel()


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Trade Journal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files — frontend and screenshots
if FRONTEND_DIR.exists():
    app.mount("/app", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if SCREENSHOTS_DIR.exists():
    app.mount("/screenshots", StaticFiles(directory=str(SCREENSHOTS_DIR)), name="screenshots")


# ─── Helpers ──────────────────────────────────────────────────────────────────
def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def compute_analytics_from_trades(trades: list) -> dict:
    if not trades:
        return _empty_analytics()

    wins = [t for t in trades if t.get("pnl", 0) > 0]
    losses = [t for t in trades if t.get("pnl", 0) < 0]
    total = len(trades)

    total_pnl = sum(t.get("pnl", 0) for t in trades)
    win_rate = round(len(wins) / total * 100, 1) if total else 0
    avg_win = round(sum(t["pnl"] for t in wins) / len(wins), 2) if wins else 0
    avg_loss = round(sum(t["pnl"] for t in losses) / len(losses), 2) if losses else 0
    largest_win = round(max((t["pnl"] for t in wins), default=0), 2)
    largest_loss = round(min((t["pnl"] for t in losses), default=0), 2)

    gross_profit = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss else (float("inf") if gross_profit > 0 else 0)

    # R:R from stop/target
    rr_values = []
    for t in trades:
        ep = t.get("open_price") or 0
        sl = t.get("stop_loss") or 0
        tp = t.get("take_profit") or 0
        if sl and tp and ep and sl != ep:
            risk = abs(ep - sl)
            reward = abs(tp - ep)
            if risk:
                rr_values.append(reward / risk)
    avg_rr = round(sum(rr_values) / len(rr_values), 2) if rr_values else 0

    # Sort by open_time
    sorted_trades = sorted(trades, key=lambda t: (t.get("open_time") or ""))

    # Streaks
    max_win_streak = max_loss_streak = current_streak = tmp_w = tmp_l = 0
    for t in sorted_trades:
        p = t.get("pnl", 0)
        if p > 0:
            tmp_w += 1; tmp_l = 0
            max_win_streak = max(max_win_streak, tmp_w)
        elif p < 0:
            tmp_l += 1; tmp_w = 0
            max_loss_streak = max(max_loss_streak, tmp_l)

    cw = cl = 0
    for t in reversed(sorted_trades):
        p = t.get("pnl", 0)
        if p > 0:
            if cl: break
            cw += 1
        elif p < 0:
            if cw: break
            cl += 1
        else:
            break
    current_streak = cw if cw else -cl

    # Max drawdown
    peak = cum = max_dd = 0
    for t in sorted_trades:
        cum += t.get("pnl", 0)
        if cum > peak: peak = cum
        dd = peak - cum
        if dd > max_dd: max_dd = dd

    # Expectancy
    expectancy = round((win_rate / 100) * avg_win + (1 - win_rate / 100) * avg_loss, 2)

    # Equity curve
    equity_curve = []
    cumulative = 0
    for t in sorted_trades:
        cumulative += t.get("pnl", 0)
        equity_curve.append({
            "date": (t.get("open_time") or "")[:10],
            "pnl": t.get("pnl", 0),
            "cumulative": round(cumulative, 2),
        })

    # Daily P&L
    daily_map = {}
    for t in trades:
        d = (t.get("open_time") or "")[:10] or "Unknown"
        daily_map[d] = round(daily_map.get(d, 0) + t.get("pnl", 0), 2)
    daily_pnl = [{"date": d, "pnl": v} for d, v in sorted(daily_map.items())]

    # By strategy
    strat_map = {}
    for t in trades:
        s = t.get("strategy") or "Unknown"
        if s not in strat_map:
            strat_map[s] = {"trades": 0, "wins": 0, "total_pnl": 0}
        strat_map[s]["trades"] += 1
        if t.get("pnl", 0) > 0:
            strat_map[s]["wins"] += 1
        strat_map[s]["total_pnl"] += t.get("pnl", 0)
    by_strategy = [
        {
            "strategy": s,
            "trades": v["trades"],
            "winRate": round(v["wins"] / v["trades"] * 100, 1),
            "avgPnL": round(v["total_pnl"] / v["trades"], 2),
            "totalPnL": round(v["total_pnl"], 2),
        }
        for s, v in strat_map.items()
    ]

    # By instrument
    instr_map = {}
    for t in trades:
        s = t.get("symbol") or "Unknown"
        if s not in instr_map:
            instr_map[s] = {"trades": 0, "wins": 0, "total_pnl": 0}
        instr_map[s]["trades"] += 1
        if t.get("pnl", 0) > 0:
            instr_map[s]["wins"] += 1
        instr_map[s]["total_pnl"] += t.get("pnl", 0)
    by_instrument = [
        {
            "instrument": s,
            "trades": v["trades"],
            "winRate": round(v["wins"] / v["trades"] * 100, 1),
            "avgPnL": round(v["total_pnl"] / v["trades"], 2),
            "totalPnL": round(v["total_pnl"], 2),
        }
        for s, v in instr_map.items()
    ]

    # By day of week
    dow_names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    dow_map = {}
    for t in trades:
        ot = t.get("open_time") or ""
        if not ot: continue
        try:
            d = datetime.fromisoformat(ot[:10])
            # weekday() returns 0=Mon..6=Sun; shift +1 and mod 7 → Sun=0, Mon=1..Sat=6
            name = dow_names[(d.weekday() + 1) % 7]
        except Exception:
            continue
        if name not in dow_map:
            dow_map[name] = {"trades": 0, "wins": 0, "total_pnl": 0}
        dow_map[name]["trades"] += 1
        if t.get("pnl", 0) > 0:
            dow_map[name]["wins"] += 1
        dow_map[name]["total_pnl"] += t.get("pnl", 0)
    by_day_of_week = [
        {
            "day": name,
            "trades": v["trades"],
            "winRate": round(v["wins"] / v["trades"] * 100, 1),
            "totalPnL": round(v["total_pnl"], 2),
        }
        for name in dow_names if name in dow_map
        for v in [dow_map[name]]
    ]

    # By hour
    hour_map = {}
    for t in trades:
        ot = t.get("open_time") or ""
        if len(ot) < 13: continue
        try:
            hour = int(ot[11:13])
        except Exception:
            continue
        if hour not in hour_map:
            hour_map[hour] = {"trades": 0, "wins": 0, "total_pnl": 0}
        hour_map[hour]["trades"] += 1
        if t.get("pnl", 0) > 0:
            hour_map[hour]["wins"] += 1
        hour_map[hour]["total_pnl"] += t.get("pnl", 0)
    by_hour = [
        {
            "hour": h,
            "label": f"{h:02d}:00",
            "trades": v["trades"],
            "winRate": round(v["wins"] / v["trades"] * 100, 1),
            "totalPnL": round(v["total_pnl"], 2),
        }
        for h, v in sorted(hour_map.items())
    ]

    # By month
    month_map = {}
    for t in trades:
        ot = t.get("open_time") or ""
        if len(ot) < 7: continue
        key = ot[:7]
        if key not in month_map:
            month_map[key] = {"trades": 0, "wins": 0, "total_pnl": 0}
        month_map[key]["trades"] += 1
        if t.get("pnl", 0) > 0:
            month_map[key]["wins"] += 1
        month_map[key]["total_pnl"] += t.get("pnl", 0)
    by_month = [
        {
            "month": m,
            "trades": v["trades"],
            "winRate": round(v["wins"] / v["trades"] * 100, 1),
            "totalPnL": round(v["total_pnl"], 2),
        }
        for m, v in sorted(month_map.items())
    ]

    return {
        "total": total,
        "wins": len(wins),
        "losses": len(losses),
        "winRate": win_rate,
        "totalPnL": round(total_pnl, 2),
        "avgWin": avg_win,
        "avgLoss": avg_loss,
        "largestWin": largest_win,
        "largestLoss": largest_loss,
        "profitFactor": profit_factor,
        "avgRR": avg_rr,
        "currentStreak": current_streak,
        "maxWinStreak": max_win_streak,
        "maxLossStreak": max_loss_streak,
        "maxDrawdown": round(max_dd, 2),
        "expectancy": expectancy,
        "equityCurve": equity_curve,
        "dailyPnL": daily_pnl,
        "byStrategy": by_strategy,
        "byInstrument": by_instrument,
        "byDayOfWeek": by_day_of_week,
        "byHour": by_hour,
        "byMonth": by_month,
    }


def _empty_analytics():
    return {
        "total": 0, "wins": 0, "losses": 0, "winRate": 0, "totalPnL": 0,
        "avgWin": 0, "avgLoss": 0, "largestWin": 0, "largestLoss": 0,
        "profitFactor": 0, "avgRR": 0, "currentStreak": 0,
        "maxWinStreak": 0, "maxLossStreak": 0, "maxDrawdown": 0, "expectancy": 0,
        "equityCurve": [], "dailyPnL": [], "byStrategy": [], "byInstrument": [],
        "byDayOfWeek": [], "byHour": [], "byMonth": [],
    }


# ─── Pydantic models ──────────────────────────────────────────────────────────
class TradeAnnotation(BaseModel):
    strategy: Optional[str] = None
    setup_tags: Optional[str] = None
    emotion_before: Optional[str] = None
    emotion_during: Optional[str] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None


class ManualTrade(BaseModel):
    symbol: str
    trade_type: str
    volume: Optional[float] = None
    open_price: Optional[float] = None
    close_price: Optional[float] = None
    open_time: Optional[str] = None
    close_time: Optional[str] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    commission: Optional[float] = 0
    swap: Optional[float] = 0
    profit: Optional[float] = 0
    strategy: Optional[str] = ""
    setup_tags: Optional[str] = ""
    emotion_before: Optional[str] = ""
    emotion_during: Optional[str] = ""
    notes: Optional[str] = ""
    outcome: Optional[str] = ""
    pnl: Optional[float] = 0


class SettingsUpdate(BaseModel):
    currency: Optional[str] = None
    instruments: Optional[str] = None
    dailyGoal: Optional[str] = None
    maxLoss: Optional[str] = None
    openaiKey: Optional[str] = None
    mt5_file_path: Optional[str] = None
    auto_sync: Optional[str] = None
    sync_interval: Optional[str] = None


class AIAnalyzeRequest(BaseModel):
    question: Optional[str] = "Analyze my trading performance and give me the top 3 specific improvements."


# ─── Trade endpoints ──────────────────────────────────────────────────────────
@app.get("/api/trades")
def get_trades(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None),
    strategy: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    conn = get_db()
    sql = "SELECT * FROM trades WHERE 1=1"
    params = []
    if date_from:
        sql += " AND open_time >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND open_time <= ?"
        params.append(date_to + "T23:59:59")
    if symbol:
        sql += " AND symbol LIKE ?"
        params.append(f"%{symbol}%")
    if outcome:
        sql += " AND outcome = ?"
        params.append(outcome)
    if strategy:
        sql += " AND strategy LIKE ?"
        params.append(f"%{strategy}%")
    if search:
        sql += " AND (notes LIKE ? OR symbol LIKE ? OR strategy LIKE ? OR setup_tags LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s])
    sql += " ORDER BY open_time DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/trades/{trade_id}")
def get_trade(trade_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM trades WHERE id=?", (trade_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Trade not found")
    return dict(row)


@app.put("/api/trades/{trade_id}")
def update_trade_annotations(trade_id: int, data: TradeAnnotation):
    conn = get_db()
    row = conn.execute("SELECT id FROM trades WHERE id=?", (trade_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Trade not found")

    updates = {}
    if data.strategy is not None: updates["strategy"] = data.strategy
    if data.setup_tags is not None: updates["setup_tags"] = data.setup_tags
    if data.emotion_before is not None: updates["emotion_before"] = data.emotion_before
    if data.emotion_during is not None: updates["emotion_during"] = data.emotion_during
    if data.notes is not None: updates["notes"] = data.notes
    if data.outcome is not None: updates["outcome"] = data.outcome
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    set_clause = ", ".join(f"{k}=?" for k in updates)
    conn.execute(
        f"UPDATE trades SET {set_clause} WHERE id=?",
        list(updates.values()) + [trade_id],
    )
    conn.commit()
    row = conn.execute("SELECT * FROM trades WHERE id=?", (trade_id,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/trades/{trade_id}")
def delete_trade(trade_id: int):
    conn = get_db()
    row = conn.execute("SELECT id FROM trades WHERE id=?", (trade_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Trade not found")
    conn.execute("DELETE FROM trades WHERE id=?", (trade_id,))
    conn.commit()
    conn.close()

    # trade_id is typed as int, so str(trade_id) is safe
    ss_dir = SCREENSHOTS_DIR / str(int(trade_id))
    if ss_dir.exists():
        shutil.rmtree(ss_dir)

    return {"ok": True}


@app.post("/api/trades")
def create_trade(trade: ManualTrade):
    conn = get_db()
    pnl = trade.pnl or round((trade.profit or 0) - (trade.commission or 0) - (trade.swap or 0), 2)
    outcome = trade.outcome or ("Win" if pnl > 0 else "Loss" if pnl < 0 else "Breakeven")

    cursor = conn.execute(
        """
        INSERT INTO trades (
            symbol, trade_type, volume, open_price, close_price,
            open_time, close_time, stop_loss, take_profit, commission, swap, profit,
            strategy, setup_tags, emotion_before, emotion_during, notes, outcome, pnl, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
        """,
        (
            trade.symbol, trade.trade_type, trade.volume, trade.open_price, trade.close_price,
            trade.open_time, trade.close_time, trade.stop_loss, trade.take_profit,
            trade.commission, trade.swap, trade.profit,
            trade.strategy, trade.setup_tags, trade.emotion_before, trade.emotion_during,
            trade.notes, outcome, pnl,
        ),
    )
    conn.commit()
    new_id = cursor.lastrowid
    row = conn.execute("SELECT * FROM trades WHERE id=?", (new_id,)).fetchone()
    conn.close()
    return dict(row)


# ─── Sync endpoints ───────────────────────────────────────────────────────────
@app.post("/api/sync")
def trigger_sync():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key='mt5_file_path'")
    row = cursor.fetchone()
    file_path = row["value"] if row else ""

    if not file_path:
        conn.close()
        raise HTTPException(status_code=400, detail="MT5 file path not configured in settings.")

    try:
        result = sync_from_file(file_path, conn)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync_time', ?)", (now,)
        )
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync_result', ?)",
            (json.dumps(result),),
        )
        conn.commit()
        conn.close()
        return {"ok": True, "synced_at": now, **result}
    except FileNotFoundError as e:
        conn.close()
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sync/status")
def sync_status():
    conn = get_db()
    status = get_sync_status(conn)
    conn.close()
    return status


# ─── Analytics endpoints ──────────────────────────────────────────────────────
def _fetch_all_trades_for_analytics(conn):
    rows = conn.execute("SELECT * FROM trades ORDER BY open_time ASC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/analytics")
def get_analytics():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    return compute_analytics_from_trades(trades)


@app.get("/api/analytics/by-strategy")
def analytics_by_strategy():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    a = compute_analytics_from_trades(trades)
    return a.get("byStrategy", [])


@app.get("/api/analytics/by-instrument")
def analytics_by_instrument():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    a = compute_analytics_from_trades(trades)
    return a.get("byInstrument", [])


@app.get("/api/analytics/by-month")
def analytics_by_month():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    a = compute_analytics_from_trades(trades)
    return a.get("byMonth", [])


@app.get("/api/analytics/by-week")
def analytics_by_week():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()

    def get_week_label(date_str):
        if not date_str: return "Unknown"
        try:
            d = datetime.fromisoformat(date_str[:10])
            iso = d.isocalendar()
            return f"{iso[0]}-W{iso[1]:02d}"
        except Exception:
            return "Unknown"

    by_week_map = {}
    for t in trades:
        wk = get_week_label(t.get("open_time") or "")
        if wk not in by_week_map:
            by_week_map[wk] = {"trades": 0, "wins": 0, "total_pnl": 0}
        by_week_map[wk]["trades"] += 1
        if t.get("pnl", 0) > 0:
            by_week_map[wk]["wins"] += 1
        by_week_map[wk]["total_pnl"] += t.get("pnl", 0)

    return [
        {
            "week": wk,
            "trades": v["trades"],
            "winRate": round(v["wins"] / v["trades"] * 100, 1),
            "totalPnL": round(v["total_pnl"], 2),
        }
        for wk, v in sorted(by_week_map.items())
    ]


@app.get("/api/analytics/by-year")
def analytics_by_year():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()

    by_year_map = {}
    for t in trades:
        ot = t.get("open_time") or ""
        y = ot[:4] if len(ot) >= 4 else "Unknown"
        if y not in by_year_map:
            by_year_map[y] = {"trades": 0, "wins": 0, "total_pnl": 0}
        by_year_map[y]["trades"] += 1
        if t.get("pnl", 0) > 0:
            by_year_map[y]["wins"] += 1
        by_year_map[y]["total_pnl"] += t.get("pnl", 0)

    return [
        {
            "year": y,
            "trades": v["trades"],
            "winRate": round(v["wins"] / v["trades"] * 100, 1),
            "totalPnL": round(v["total_pnl"], 2),
        }
        for y, v in sorted(by_year_map.items())
    ]


@app.get("/api/analytics/by-day-of-week")
def analytics_by_day_of_week():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    a = compute_analytics_from_trades(trades)
    return a.get("byDayOfWeek", [])


@app.get("/api/analytics/by-hour")
def analytics_by_hour():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    a = compute_analytics_from_trades(trades)
    return a.get("byHour", [])


@app.get("/api/analytics/equity-curve")
def analytics_equity_curve():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    a = compute_analytics_from_trades(trades)
    return a.get("equityCurve", [])


@app.get("/api/analytics/daily-pnl")
def analytics_daily_pnl():
    conn = get_db()
    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()
    a = compute_analytics_from_trades(trades)
    return a.get("dailyPnL", [])


# ─── Settings endpoints ───────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


@app.put("/api/settings")
def update_settings(data: SettingsUpdate):
    conn = get_db()
    updates = data.model_dump(exclude_none=True)
    for key, value in updates.items():
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, str(value) if value is not None else ""),
        )
    conn.commit()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


# ─── Screenshot helpers ────────────────────────────────────────────────────────
import uuid as _uuid

_ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'}


def _safe_extension(filename: str) -> str:
    """Extract and validate image extension. Returns the extension (e.g. '.png')."""
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or '(none)'}")
    return ext


def _screenshot_path(trade_id: int, stored_name: str) -> Path:
    """Build a filesystem path using only server-controlled components."""
    # trade_id is a Python int (FastAPI-validated), stored_name comes from DB
    return SCREENSHOTS_DIR / str(int(trade_id)) / stored_name


# ─── Screenshots endpoints ────────────────────────────────────────────────────
@app.post("/api/screenshots/{trade_id}")
async def upload_screenshot(trade_id: int, file: UploadFile = File(...)):
    conn = get_db()
    row = conn.execute("SELECT id FROM trades WHERE id=?", (trade_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Trade not found")

    # Generate a server-controlled UUID filename — user input only supplies the extension
    ext = _safe_extension(file.filename or "screenshot.png")
    stored_name = f"{_uuid.uuid4().hex}{ext}"   # never derived from user input

    trade_dir = SCREENSHOTS_DIR / str(int(trade_id))
    trade_dir.mkdir(exist_ok=True)
    dest = _screenshot_path(trade_id, stored_name)

    async with aiofiles.open(dest, "wb") as f:
        content = await file.read()
        await f.write(content)

    conn.execute(
        "INSERT INTO screenshots (trade_id, filename) VALUES (?, ?)",
        (trade_id, stored_name),
    )
    conn.commit()
    conn.close()

    return {"ok": True, "filename": stored_name, "url": f"/screenshots/{trade_id}/{stored_name}"}


@app.delete("/api/screenshots/{trade_id}/{filename}")
def delete_screenshot(trade_id: int, filename: str):
    conn = get_db()
    # Look up in DB — filename from URL is used only as a search key, never in a path directly
    row = conn.execute(
        "SELECT filename FROM screenshots WHERE trade_id=? AND filename=?",
        (trade_id, filename),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Screenshot not found.")

    conn.execute(
        "DELETE FROM screenshots WHERE trade_id=? AND filename=?",
        (trade_id, filename),
    )
    conn.commit()
    conn.close()

    # Use the DB-returned value (not the URL parameter) to construct the filesystem path
    db_filename = row["filename"]
    file_path = _screenshot_path(trade_id, db_filename)
    if file_path.exists():
        file_path.unlink()

    return {"ok": True}


@app.get("/api/screenshots/{trade_id}/{filename}")
def serve_screenshot(trade_id: int, filename: str):
    conn = get_db()
    # filename from URL is used as a DB lookup key only — path is built from DB-returned value
    row = conn.execute(
        "SELECT filename FROM screenshots WHERE trade_id=? AND filename=?",
        (trade_id, filename),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Screenshot not found.")
    # db_filename comes from the database (server-controlled), not from the request
    db_filename = row["filename"]
    file_path = _screenshot_path(trade_id, db_filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Screenshot file missing.")
    return FileResponse(str(file_path))


@app.get("/api/screenshots/{trade_id}")
def list_screenshots(trade_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT filename, created_at FROM screenshots WHERE trade_id=? ORDER BY created_at",
        (trade_id,),
    ).fetchall()
    conn.close()
    return [
        {"filename": r["filename"], "url": f"/screenshots/{trade_id}/{r['filename']}", "created_at": r["created_at"]}
        for r in rows
    ]


# ─── AI endpoint ──────────────────────────────────────────────────────────────
@app.post("/api/ai/analyze")
async def ai_analyze(body: AIAnalyzeRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key='openaiKey'")
    row = cursor.fetchone()
    api_key = row["value"] if row else ""

    if not api_key:
        conn.close()
        raise HTTPException(status_code=400, detail="OpenAI API key not configured in settings.")

    trades = _fetch_all_trades_for_analytics(conn)
    conn.close()

    if not trades:
        raise HTTPException(status_code=400, detail="No trades to analyze.")

    wins = [t for t in trades if t.get("pnl", 0) > 0]
    total = len(trades)
    win_rate = round(len(wins) / total * 100) if total else 0
    total_pnl = sum(t.get("pnl", 0) for t in trades)

    summary = {
        "totalTrades": total,
        "wins": len(wins),
        "losses": len([t for t in trades if t.get("pnl", 0) < 0]),
        "winRate": f"{win_rate}%",
        "totalPnL": round(total_pnl, 2),
        "recentTrades": [
            {
                "date": (t.get("open_time") or "")[:10],
                "symbol": t.get("symbol"),
                "type": t.get("trade_type"),
                "pnl": t.get("pnl"),
                "outcome": t.get("outcome"),
                "strategy": t.get("strategy"),
                "emotion": t.get("emotion_before"),
            }
            for t in trades[-20:]
        ],
    }

    try:
        import openai
        client = openai.AsyncOpenAI(api_key=api_key)
        system_prompt = (
            f"You are an expert trading coach and performance analyst. "
            f"Analyze the trader's data and provide specific, actionable insights. "
            f"Be concise and direct. Data: {json.dumps(summary)}"
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": body.question},
            ],
            max_tokens=600,
            temperature=0.7,
        )
        answer = response.choices[0].message.content
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Export / Import ──────────────────────────────────────────────────────────
@app.get("/api/export")
def export_data():
    conn = get_db()
    trades = [dict(r) for r in conn.execute("SELECT * FROM trades ORDER BY open_time ASC").fetchall()]
    settings_rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings_data = {r["key"]: r["value"] for r in settings_rows}
    conn.close()
    return {
        "version": 2,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "trades": trades,
        "settings": settings_data,
    }


@app.post("/api/import")
async def import_data(file: UploadFile = File(...)):
    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file.")

    trades = data.get("trades", [])
    if not isinstance(trades, list):
        raise HTTPException(status_code=400, detail="Invalid format: 'trades' must be an array.")

    conn = get_db()
    imported = 0
    for t in trades:
        try:
            ticket = t.get("ticket")
            pnl = t.get("pnl", 0)
            outcome = t.get("outcome") or ("Win" if pnl > 0 else "Loss" if pnl < 0 else "Breakeven")
            if ticket:
                conn.execute(
                    """INSERT OR IGNORE INTO trades (
                        ticket, symbol, trade_type, volume, open_price, close_price,
                        open_time, close_time, stop_loss, take_profit, commission, swap, profit,
                        magic_number, mt5_comment, strategy, setup_tags, emotion_before,
                        emotion_during, notes, outcome, pnl, source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        ticket, t.get("symbol", ""), t.get("trade_type", "Buy"),
                        t.get("volume"), t.get("open_price"), t.get("close_price"),
                        t.get("open_time"), t.get("close_time"),
                        t.get("stop_loss"), t.get("take_profit"),
                        t.get("commission", 0), t.get("swap", 0), t.get("profit", 0),
                        t.get("magic_number"), t.get("mt5_comment"),
                        t.get("strategy", ""), t.get("setup_tags", ""),
                        t.get("emotion_before", ""), t.get("emotion_during", ""),
                        t.get("notes", ""), outcome, pnl, t.get("source", "mt5"),
                    ),
                )
            else:
                conn.execute(
                    """INSERT INTO trades (
                        symbol, trade_type, volume, open_price, close_price,
                        open_time, close_time, stop_loss, take_profit, commission, swap, profit,
                        strategy, setup_tags, emotion_before, emotion_during, notes, outcome, pnl, source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        t.get("symbol", ""), t.get("trade_type", "Buy"),
                        t.get("volume"), t.get("open_price"), t.get("close_price"),
                        t.get("open_time"), t.get("close_time"),
                        t.get("stop_loss"), t.get("take_profit"),
                        t.get("commission", 0), t.get("swap", 0), t.get("profit", 0),
                        t.get("strategy", ""), t.get("setup_tags", ""),
                        t.get("emotion_before", ""), t.get("emotion_during", ""),
                        t.get("notes", ""), outcome, pnl, t.get("source", "manual"),
                    ),
                )
            imported += 1
        except Exception as e:
            logger.error("Import error for trade: %s", e)

    conn.commit()
    conn.close()
    return {"ok": True, "imported": imported, "total": len(trades)}


# ─── Root redirect ────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "Trade Journal API running. Frontend at /app"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
