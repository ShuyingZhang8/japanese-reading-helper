"""
One-time seed script: loads JLPT CSVs and JMdict JSON into PostgreSQL.
Run from the backend/ directory:
    python scripts/seed_db.py

Requires DATABASE_URL in environment (or backend/.env).
Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING).
"""

import asyncio
import csv
import json
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

# Allow imports from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"]
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
JMDICT_PATH = DATA_DIR / "jmdict-eng-common-3.6.2.json"


# ── JLPT CSVs ────────────────────────────────────────────────────────────────

def load_jlpt_rows() -> list[dict]:
    rows = []
    seen: set[str] = set()
    for level in JLPT_LEVELS:
        csv_path = DATA_DIR / f"{level.lower()}.csv"
        if not csv_path.exists():
            print(f"  [WARN] {csv_path} not found, skipping")
            continue
        with csv_path.open("r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                expr = row.get("expression", "").strip()
                if not expr or expr in seen:
                    continue
                seen.add(expr)
                rows.append({
                    "expression": expr,
                    "reading":    row.get("reading", "").strip(),
                    "meaning":    row.get("meaning", "").strip(),
                    "level":      level,
                    "tags":       row.get("tags", "").strip() or None,
                })
    return rows


async def seed_jlpt(conn: asyncpg.Connection, rows: list[dict]) -> int:
    inserted = 0
    for r in rows:
        result = await conn.execute(
            """
            INSERT INTO jlpt_vocab (expression, reading, meaning, level, tags)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (expression) DO NOTHING
            """,
            r["expression"], r["reading"], r["meaning"], r["level"], r["tags"],
        )
        if result == "INSERT 0 1":
            inserted += 1
    return inserted


# ── JMdict JSON ───────────────────────────────────────────────────────────────

def _all_readings(word: dict) -> list[str]:
    seen: set[str] = set()
    result = []
    for k in word.get("kana", []):
        t = k.get("text", "").strip()
        if t and t not in seen:
            seen.add(t)
            result.append(t)
    return result


def _all_meanings(word: dict) -> list[str]:
    result = []
    for sense in word.get("sense", []):
        for gloss in sense.get("gloss", []):
            if gloss.get("lang") == "eng":
                t = gloss.get("text", "").strip()
                if t:
                    result.append(t)
    return result


def load_jmdict_rows() -> list[dict]:
    print(f"  Loading {JMDICT_PATH} …", flush=True)
    with JMDICT_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    rows: dict[str, dict] = {}  # expression → row (first occurrence wins)
    for word in data.get("words", []):
        readings = _all_readings(word)
        meanings = _all_meanings(word)
        if not meanings:
            continue

        expressions: list[str] = []
        kanji_list = word.get("kanji", [])
        if kanji_list:
            expressions = [k.get("text", "").strip() for k in kanji_list]
        else:
            expressions = readings[:]  # kana-only

        for expr in expressions:
            if not expr or expr in rows:
                continue
            rows[expr] = {
                "expression": expr,
                "readings":   readings,
                "meanings":   meanings,
            }

    return list(rows.values())


async def seed_jmdict(conn: asyncpg.Connection, rows: list[dict]) -> int:
    inserted = 0
    for r in rows:
        result = await conn.execute(
            """
            INSERT INTO jmdict_entry (expression, readings, meanings)
            VALUES ($1, $2, $3)
            ON CONFLICT (expression) DO NOTHING
            """,
            r["expression"], r["readings"], r["meanings"],
        )
        if result == "INSERT 0 1":
            inserted += 1
    return inserted


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    print(f"Connecting to {url} …")
    conn = await asyncpg.connect(url)

    try:
        print("\n── JLPT vocab ──────────────────────────────")
        jlpt_rows = load_jlpt_rows()
        print(f"  Loaded {len(jlpt_rows)} rows from CSVs")
        n = await seed_jlpt(conn, jlpt_rows)
        print(f"  Inserted {n} new rows (skipped duplicates)")

        print("\n── JMdict ──────────────────────────────────")
        jmdict_rows = load_jmdict_rows()
        print(f"  Loaded {len(jmdict_rows)} expression rows")
        n = await seed_jmdict(conn, jmdict_rows)
        print(f"  Inserted {n} new rows (skipped duplicates)")

        # Verification
        jlpt_count  = await conn.fetchval("SELECT COUNT(*) FROM jlpt_vocab")
        jmdict_count = await conn.fetchval("SELECT COUNT(*) FROM jmdict_entry")
        print(f"\n── Verification ────────────────────────────")
        print(f"  jlpt_vocab:   {jlpt_count} rows")
        print(f"  jmdict_entry: {jmdict_count} rows")
        print("\nDone.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
