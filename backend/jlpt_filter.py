import csv
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from jmdict_client import get_jmdict_meaning
from schemas import TokenInfo, VocabItem

if TYPE_CHECKING:
    import asyncpg


JLPT_LEVELS: list[str] = ["N5", "N4", "N3", "N2", "N1"]

# Maps dictionary form → (jlpt_level, meaning)
_VOCAB_MAP: dict[str, tuple[str, str]] = {}

# Stage 2: POS routing rules
_SKIP_POS: frozenset[str] = frozenset(
    {"助詞", "助動詞", "接続詞", "感動詞", "補助記号", "記号", "空白"}
)
_SKIP_AFFIX_POS: frozenset[str] = frozenset({"接尾辞", "接頭辞"})
_LOOKUP_POS: frozenset[str] = frozenset(
    {"名詞", "動詞", "形容詞", "形容動詞", "副詞", "代名詞"}
)


async def init_jlpt_data_from_db(pool: "asyncpg.Pool") -> None:
    """Load JLPT vocab from PostgreSQL into the in-memory dict at startup."""
    global _VOCAB_MAP
    rows = await pool.fetch("SELECT expression, level, meaning FROM jlpt_vocab")
    _VOCAB_MAP = {r["expression"]: (r["level"], r["meaning"]) for r in rows}
    logging.info("JLPT vocab loaded from DB: %d entries", len(_VOCAB_MAP))


def init_jlpt_data(data_dir: str) -> None:
    global _VOCAB_MAP

    dir_path = Path(data_dir)
    if not dir_path.is_dir():
        logging.warning("JLPT data directory not found: %s", data_dir)
        _VOCAB_MAP = {}
        return

    vocab: dict[str, tuple[str, str]] = {}
    for level in JLPT_LEVELS:
        csv_path = dir_path / f"{level.lower()}.csv"
        if not csv_path.exists():
            logging.warning("JLPT vocab file not found: %s", csv_path)
            continue
        with csv_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                expression = row.get("expression", "").strip()
                meaning = row.get("meaning", "").strip()
                if expression and expression not in vocab:
                    vocab[expression] = (level, meaning)

    _VOCAB_MAP = vocab


def get_word_jlpt_level(dictionary_form: str) -> str | None:
    entry = _VOCAB_MAP.get(dictionary_form)
    return entry[0] if entry else None


def get_word_meaning(dictionary_form: str) -> str:
    entry = _VOCAB_MAP.get(dictionary_form)
    return entry[1] if entry else ""


def _is_unknown(word_level: str, user_jlpt_level: str) -> bool:
    if user_jlpt_level not in JLPT_LEVELS:
        return True
    user_idx = JLPT_LEVELS.index(user_jlpt_level)
    word_idx = JLPT_LEVELS.index(word_level)
    return word_idx > user_idx


def _should_enter_lookup(pos: list[str]) -> bool:
    """Stage 2: decide whether this token should be looked up in the vocab tables."""
    if not pos:
        return False
    primary = pos[0]
    if primary in _SKIP_POS or primary in _SKIP_AFFIX_POS:
        return False
    if primary not in _LOOKUP_POS:
        return False
    # Proper nouns skip the lookup table
    if primary == "名詞" and len(pos) > 1 and pos[1] == "固有名詞":
        return False
    return True


def mark_unknown_tokens(tokens: list[TokenInfo], user_jlpt_level: str) -> list[TokenInfo]:
    result: list[TokenInfo] = []

    for token in tokens:
        pos = token.part_of_speech

        # Stage 2: POS filtering — skip, not highlighted
        if not _should_enter_lookup(pos):
            result.append(token.model_copy(update={"is_unknown": False}))
            continue

        # Stage 3: JLPT vocab lookup
        word_level = get_word_jlpt_level(token.dictionary_form)
        if word_level is not None:
            result.append(
                token.model_copy(
                    update={"is_unknown": _is_unknown(word_level, user_jlpt_level)}
                )
            )
            continue

        # Stage 4: Not found in JLPT vocab

        # 4A: OOV — not in SudachiDict at all
        if token.dictionary_id == -1:
            result.append(token.model_copy(update={"is_unknown": False}))
            continue

        # 4B: Proper noun (defensive; already excluded in Stage 2)
        if pos and pos[0] == "名詞" and len(pos) > 1 and pos[1] == "固有名詞":
            result.append(token.model_copy(update={"is_unknown": False}))
            continue

        # 4C: Regular word not in JLPT — try JMdict
        jmdict_meaning = get_jmdict_meaning(token.dictionary_form)
        result.append(token.model_copy(update={"is_unknown": jmdict_meaning is not None}))

    return result


def get_unknown_vocab_items(tokens: list[TokenInfo]) -> list[VocabItem]:
    unique: dict[str, VocabItem] = {}

    for token in tokens:
        if not token.is_unknown:
            continue

        key = token.dictionary_form
        if key in unique:
            continue

        meaning = get_word_meaning(token.dictionary_form)
        if not meaning:
            # Word came from Stage 4C (JMdict path)
            meaning = get_jmdict_meaning(token.dictionary_form) or ""

        unique[key] = VocabItem(
            word=token.dictionary_form,
            reading=token.reading,
            part_of_speech=token.part_of_speech[0] if token.part_of_speech else "",
            meaning=meaning,
        )

    return list(unique.values())
