import re
import threading

from sudachipy import Dictionary, SplitMode

from schemas import TokenInfo


_DICT = Dictionary()
_LOCAL = threading.local()
_SENTENCE_SPLIT_RE = re.compile(r"[。！？\n]")


def _get_tokenizer():
    if not hasattr(_LOCAL, "tokenizer"):
        _LOCAL.tokenizer = _DICT.create()
    return _LOCAL.tokenizer


def _katakana_to_hiragana(text: str) -> str:
    converted: list[str] = []
    for char in text:
        code = ord(char)
        if 0x30A1 <= code <= 0x30F6:
            converted.append(chr(code - 0x60))
        else:
            converted.append(char)
    return "".join(converted)


def tokenize_article(text: str) -> list[TokenInfo]:
    if not text:
        return []

    result: list[TokenInfo] = []
    morphemes = _get_tokenizer().tokenize(text, SplitMode.C)
    for morpheme in morphemes:
        pos = morpheme.part_of_speech()
        reading = _katakana_to_hiragana(morpheme.reading_form())
        result.append(
            TokenInfo(
                surface=morpheme.surface(),
                dictionary_form=morpheme.dictionary_form(),
                reading=reading,
                part_of_speech=list(pos),
                dictionary_id=morpheme.dictionary_id(),
                is_unknown=False,
            )
        )
    return result


def get_sentence_context(text: str, target_word: str) -> str:
    sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]
    for sentence in sentences:
        if target_word in sentence:
            return sentence

    fallback = text[:200].strip()
    return fallback if fallback else text[:200]


