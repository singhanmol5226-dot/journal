"""
mt5_sync.py — Sync trades from MT5 JSON export file into the SQLite database.
"""

import json
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


def sync_from_file(file_path: str, db_conn) -> dict:
    """
    Read the MT5 JSON export file and upsert trades into the database.

    Returns a dict: { "new": int, "updated": int, "errors": int, "total": int }
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"MT5 export file not found: {file_path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    trades = data.get("trades", [])
    if not isinstance(trades, list):
        raise ValueError("Invalid MT5 export format: 'trades' must be an array")

    new_count = 0
    updated_count = 0
    error_count = 0
    cursor = db_conn.cursor()

    for trade in trades:
        try:
            ticket = trade.get("ticket")
            if ticket is None:
                error_count += 1
                continue

            symbol = trade.get("symbol", "")
            trade_type = trade.get("trade_type", "Buy")
            volume = float(trade.get("volume") or 0)
            open_price = float(trade.get("open_price") or 0)
            close_price = float(trade.get("close_price") or 0)
            open_time = trade.get("open_time", "")
            close_time = trade.get("close_time", "")
            stop_loss = float(trade.get("stop_loss") or 0)
            take_profit = float(trade.get("take_profit") or 0)
            commission = float(trade.get("commission") or 0)
            swap = float(trade.get("swap") or 0)
            profit = float(trade.get("profit") or 0)
            magic_number = int(trade.get("magic_number") or 0)
            comment = trade.get("comment", "")

            # Compute net P&L
            pnl = profit - commission - swap

            # Determine outcome
            if pnl > 0:
                outcome = "Win"
            elif pnl < 0:
                outcome = "Loss"
            else:
                outcome = "Breakeven"

            # Check if trade already exists
            cursor.execute("SELECT id, profit, commission, swap FROM trades WHERE ticket = ?", (ticket,))
            existing = cursor.fetchone()

            if existing is None:
                # Insert new trade
                cursor.execute(
                    """
                    INSERT INTO trades (
                        ticket, symbol, trade_type, volume, open_price, close_price,
                        open_time, close_time, stop_loss, take_profit, commission, swap,
                        profit, magic_number, mt5_comment, pnl, outcome, source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mt5')
                    """,
                    (
                        ticket, symbol, trade_type, volume, open_price, close_price,
                        open_time, close_time, stop_loss, take_profit, commission, swap,
                        profit, magic_number, comment, round(pnl, 2), outcome,
                    ),
                )
                new_count += 1
            else:
                _, ex_profit, ex_commission, ex_swap = existing
                # Update if financial data changed (re-sync); use epsilon for float comparison
                _eps = 1e-9
                if (abs(ex_profit - profit) > _eps
                        or abs(ex_commission - commission) > _eps
                        or abs(ex_swap - swap) > _eps):
                    cursor.execute(
                        """
                        UPDATE trades SET
                            symbol=?, trade_type=?, volume=?, open_price=?, close_price=?,
                            open_time=?, close_time=?, stop_loss=?, take_profit=?,
                            commission=?, swap=?, profit=?, magic_number=?, mt5_comment=?,
                            pnl=?, outcome=?, updated_at=datetime('now')
                        WHERE ticket=?
                        """,
                        (
                            symbol, trade_type, volume, open_price, close_price,
                            open_time, close_time, stop_loss, take_profit,
                            commission, swap, profit, magic_number, comment,
                            round(pnl, 2), outcome, ticket,
                        ),
                    )
                    updated_count += 1

        except Exception as e:
            logger.error("Error processing trade ticket=%s: %s", trade.get("ticket"), e)
            error_count += 1

    db_conn.commit()

    result = {
        "new": new_count,
        "updated": updated_count,
        "errors": error_count,
        "total": len(trades),
    }
    logger.info("Sync complete: %s", result)
    return result


def get_sync_status(db_conn) -> dict:
    """Return last sync info from settings table."""
    cursor = db_conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key='last_sync_time'")
    row = cursor.fetchone()
    last_sync_time = row[0] if row else None

    cursor.execute("SELECT value FROM settings WHERE key='last_sync_result'")
    row = cursor.fetchone()
    last_sync_result = row[0] if row else None

    cursor.execute("SELECT COUNT(*) FROM trades WHERE source='mt5'")
    row = cursor.fetchone()
    mt5_trade_count = row[0] if row else 0

    cursor.execute("SELECT value FROM settings WHERE key='mt5_file_path'")
    row = cursor.fetchone()
    file_path = row[0] if row else ""

    file_exists = Path(file_path).exists() if file_path else False

    return {
        "last_sync_time": last_sync_time,
        "last_sync_result": json.loads(last_sync_result) if last_sync_result else None,
        "mt5_trade_count": mt5_trade_count,
        "file_path": file_path,
        "file_exists": file_exists,
        "status": "connected" if file_exists else "disconnected",
    }
