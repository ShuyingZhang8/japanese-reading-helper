import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import asyncpg

# Maps expression → (meanings_joined, first_reading)
_JMDICT_MAP: dict[str, tuple[str, str]] = {}


async def init_jmdict_data_from_db(pool: "asyncpg.Pool") -> None:
    """Load JMdict from PostgreSQL into the in-memory dict at startup."""
    global _JMDICT_MAP
    rows = await pool.fetch("SELECT expression, meanings, readings FROM jmdict_entry")
    lookup: dict[str, tuple[str, str]] = {}
    for r in rows:
        meaning = "; ".join(r["meanings"]) if r["meanings"] else ""
        reading = r["readings"][0] if r["readings"] else ""
        lookup[r["expression"]] = (meaning, reading)
    _JMDICT_MAP = lookup
    logging.info("JMdict loaded from DB: %d entries", len(_JMDICT_MAP))


def init_jmdict_data(path: str) -> None:
    global _JMDICT_MAP

    file_path = Path(path)
    if not file_path.exists():
        logging.warning("JMdict file not found: %s — Stage 4C lookups will be skipped", path)
        _JMDICT_MAP = {}
        return

    with file_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    lookup: dict[str, tuple[str, str]] = {}
    for word in data.get("words", []):
        gloss = _first_eng_gloss(word)
        if not gloss:
            continue
        reading = _first_kana_reading(word)

        for kanji_entry in word.get("kanji", []):
            text = kanji_entry.get("text", "").strip()
            if text and text not in lookup:
                lookup[text] = (gloss, reading)

        # kana-only words
        if not word.get("kanji"):
            for kana_entry in word.get("kana", []):
                text = kana_entry.get("text", "").strip()
                if text and text not in lookup:
                    lookup[text] = (gloss, reading)

    _JMDICT_MAP = lookup
    logging.info("JMdict loaded: %d entries", len(_JMDICT_MAP))


def _first_eng_gloss(word: dict) -> str:
    for sense in word.get("sense", []):
        for gloss in sense.get("gloss", []):
            if gloss.get("lang") == "eng":
                return gloss.get("text", "")
    return ""


def _first_kana_reading(word: dict) -> str:
    kana_list = word.get("kana", [])
    if kana_list:
        return kana_list[0].get("text", "")
    return ""


def get_jmdict_meaning(word: str) -> str | None:
    entry = _JMDICT_MAP.get(word)
    return entry[0] if entry else None


def get_jmdict_entry(word: str) -> tuple[str, str] | None:
    """Return (meaning, reading) or None if not found."""
    return _JMDICT_MAP.get(word)
