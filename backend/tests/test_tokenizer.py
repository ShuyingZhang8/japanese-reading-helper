from tokenizer import (
    get_sentence_context,
    tokenize_article,
)


def test_tokenize_basic() -> None:
    tokens = tokenize_article("私は学生です。")
    surfaces = [token.surface for token in tokens]
    assert "私" in surfaces
    assert "学生" in surfaces


def test_tokenize_empty_returns_empty_list() -> None:
    assert tokenize_article("") == []


def test_tokenize_surface_exists_in_original() -> None:
    text = "私は学生です。"
    tokens = tokenize_article(text)
    for token in tokens:
        assert token.surface in text


def test_tokenize_is_unknown_defaults_false() -> None:
    tokens = tokenize_article("私は学生です。")
    assert all(token.is_unknown is False for token in tokens)


def test_sentence_context_finds_correct_sentence() -> None:
    text = "今日は晴れです。明日は雨です。"
    context = get_sentence_context(text, "明日")
    assert "明日" in context


def test_sentence_context_fallback() -> None:
    text = "今日は晴れです。"
    context = get_sentence_context(text, "存在しない語")
    assert len(context) > 0


