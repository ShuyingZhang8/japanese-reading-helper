import json

from jmdict_client import get_jmdict_entry, get_jmdict_meaning, init_jmdict_data


def _make_jmdict_entry(kanji: str, kana: str, gloss: str) -> dict:
    entry: dict = {
        "id": "0000000",
        "kanji": [{"text": kanji, "tags": [], "common": True}] if kanji else [],
        "kana": [{"text": kana, "tags": [], "common": True, "appliesToKanji": ["*"]}],
        "sense": [
            {
                "partOfSpeech": [],
                "appliesToKanji": ["*"],
                "appliesToKana": ["*"],
                "gloss": [{"lang": "eng", "gender": None, "type": None, "text": gloss}],
            }
        ],
    }
    return entry


def _write_jmdict(tmp_path, entries: list[dict]) -> str:
    data = {"version": "test", "languages": ["eng"], "words": entries}
    path = tmp_path / "jmdict-eng.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return str(path)


def test_found_by_kanji(tmp_path) -> None:
    path = _write_jmdict(tmp_path, [_make_jmdict_entry("食べる", "たべる", "to eat")])
    init_jmdict_data(path)
    assert get_jmdict_meaning("食べる") == "to eat"


def test_not_found_returns_none(tmp_path) -> None:
    path = _write_jmdict(tmp_path, [_make_jmdict_entry("食べる", "たべる", "to eat")])
    init_jmdict_data(path)
    assert get_jmdict_meaning("飲む") is None


def test_kana_only_word_found(tmp_path) -> None:
    path = _write_jmdict(tmp_path, [_make_jmdict_entry("", "たべる", "to eat")])
    init_jmdict_data(path)
    assert get_jmdict_meaning("たべる") == "to eat"


def test_missing_file_returns_none(tmp_path) -> None:
    init_jmdict_data(str(tmp_path / "nonexistent.json"))
    assert get_jmdict_meaning("食べる") is None


def test_first_gloss_is_used(tmp_path) -> None:
    entry = _make_jmdict_entry("見る", "みる", "to see")
    entry["sense"][0]["gloss"].append({"lang": "eng", "gender": None, "type": None, "text": "to watch"})
    path = _write_jmdict(tmp_path, [entry])
    init_jmdict_data(path)
    assert get_jmdict_meaning("見る") == "to see"


def test_get_jmdict_entry_returns_reading(tmp_path) -> None:
    path = _write_jmdict(tmp_path, [_make_jmdict_entry("食べる", "たべる", "to eat")])
    init_jmdict_data(path)
    entry = get_jmdict_entry("食べる")
    assert entry is not None
    meaning, reading = entry
    assert meaning == "to eat"
    assert reading == "たべる"


def test_get_jmdict_entry_not_found_returns_none(tmp_path) -> None:
    path = _write_jmdict(tmp_path, [_make_jmdict_entry("食べる", "たべる", "to eat")])
    init_jmdict_data(path)
    assert get_jmdict_entry("飲む") is None
