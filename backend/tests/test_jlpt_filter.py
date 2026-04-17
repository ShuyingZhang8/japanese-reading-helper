from unittest.mock import patch

from jlpt_filter import get_unknown_vocab_items, init_jlpt_data, mark_unknown_tokens
from schemas import TokenInfo


TEST_VOCAB = {
    "N5": ["食べる", "見る", "私"],
    "N4": ["準備", "説明"],
    "N3": ["把握", "影響"],
}

# A normal noun POS tuple (名詞 → enters lookup flow)
_NOUN_POS = ["名詞", "普通名詞", "一般", "*", "*", "*"]
# A particle POS tuple (助詞 → skipped in Stage 2)
_PARTICLE_POS = ["助詞", "格助詞", "*", "*", "*", "*"]
# A proper noun POS tuple (固有名詞 → skipped in Stage 2)
_PROPER_NOUN_POS = ["名詞", "固有名詞", "一般", "*", "*", "*"]
# A suffix POS tuple (接尾辞 → skipped in Stage 2)
_SUFFIX_POS = ["接尾辞", "名詞的", "*", "*", "*", "*"]


def make_token(
    surface: str,
    dict_form: str,
    pos: list[str] | None = None,
    dictionary_id: int = 1,
) -> TokenInfo:
    return TokenInfo(
        surface=surface,
        dictionary_form=dict_form,
        reading="",
        part_of_speech=pos if pos is not None else _NOUN_POS,
        dictionary_id=dictionary_id,
        is_unknown=False,
    )


def _setup_vocab(tmp_path) -> None:
    for level, words in TEST_VOCAB.items():
        csv_path = tmp_path / f"{level.lower()}.csv"
        lines = ["expression,reading,meaning,tags"] + [f"{w},,test meaning for {w}," for w in words]
        csv_path.write_text("\n".join(lines), encoding="utf-8")
    init_jlpt_data(str(tmp_path))


# ---------------------------------------------------------------------------
# Stage 3: JLPT level comparison
# ---------------------------------------------------------------------------

def test_n5_word_known_to_n5_student(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("食べる", "食べる")], "N5")
    assert result[0].is_unknown is False


def test_n5_word_known_to_n3_student(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("食べる", "食べる")], "N3")
    assert result[0].is_unknown is False


def test_n3_word_unknown_to_n5_student(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("把握", "把握")], "N5")
    assert result[0].is_unknown is True


def test_n3_word_unknown_to_n4_student(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("把握", "把握")], "N4")
    assert result[0].is_unknown is True


def test_n3_word_known_to_n3_student(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("把握", "把握")], "N3")
    assert result[0].is_unknown is False


def test_n3_word_known_to_n1_student(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("把握", "把握")], "N1")
    assert result[0].is_unknown is False


# ---------------------------------------------------------------------------
# Stage 2: POS filtering
# ---------------------------------------------------------------------------

def test_particle_is_not_unknown(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("は", "は", pos=_PARTICLE_POS)], "N5")
    assert result[0].is_unknown is False


def test_proper_noun_is_not_unknown(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("東京", "東京", pos=_PROPER_NOUN_POS)], "N5")
    assert result[0].is_unknown is False


def test_suffix_is_not_unknown(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens([make_token("さん", "さん", pos=_SUFFIX_POS)], "N5")
    assert result[0].is_unknown is False


# ---------------------------------------------------------------------------
# Stage 4A: OOV
# ---------------------------------------------------------------------------

def test_oov_token_is_not_unknown(tmp_path) -> None:
    _setup_vocab(tmp_path)
    result = mark_unknown_tokens(
        [make_token("XYZ謎語", "XYZ謎語", dictionary_id=-1)], "N5"
    )
    assert result[0].is_unknown is False


# ---------------------------------------------------------------------------
# Stage 4C: JMdict fallback
# ---------------------------------------------------------------------------

def test_word_not_in_jlpt_found_in_jmdict_is_unknown(tmp_path) -> None:
    _setup_vocab(tmp_path)
    with patch("jlpt_filter.get_jmdict_meaning", return_value="some meaning"):
        result = mark_unknown_tokens([make_token("謎語", "謎語")], "N5")
    assert result[0].is_unknown is True


def test_word_not_in_jlpt_not_in_jmdict_is_not_unknown(tmp_path) -> None:
    _setup_vocab(tmp_path)
    with patch("jlpt_filter.get_jmdict_meaning", return_value=None):
        result = mark_unknown_tokens([make_token("謎語", "謎語")], "N5")
    assert result[0].is_unknown is False


# ---------------------------------------------------------------------------
# Vocab item extraction
# ---------------------------------------------------------------------------

def test_mark_unknown_does_not_mutate_input(tmp_path) -> None:
    _setup_vocab(tmp_path)
    source = [make_token("把握", "把握")]
    _ = mark_unknown_tokens(source, "N5")
    assert source[0].is_unknown is False


def test_unknown_vocab_deduped(tmp_path) -> None:
    _setup_vocab(tmp_path)
    marked = mark_unknown_tokens(
        [make_token("把握", "把握"), make_token("把握", "把握")],
        "N5",
    )
    unknown_items = get_unknown_vocab_items(marked)
    assert len(unknown_items) == 1


def test_unknown_vocab_meaning_from_csv(tmp_path) -> None:
    _setup_vocab(tmp_path)
    marked = mark_unknown_tokens([make_token("把握", "把握")], "N5")
    unknown_items = get_unknown_vocab_items(marked)
    assert unknown_items[0].meaning == "test meaning for 把握"


def test_unknown_vocab_meaning_from_jmdict(tmp_path) -> None:
    _setup_vocab(tmp_path)
    with patch("jlpt_filter.get_jmdict_meaning", return_value="jmdict meaning"):
        marked = mark_unknown_tokens([make_token("謎語", "謎語")], "N5")
        unknown_items = get_unknown_vocab_items(marked)
    assert unknown_items[0].meaning == "jmdict meaning"
