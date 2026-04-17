import logging

import httpx

from ai.base import AIProvider
from jmdict_client import get_jmdict_entry
from schemas import SentenceExplanationResponse, WordExplanation

_MYMEMORY_URL = "https://api.mymemory.translated.net/get"


def _mymemory_translate(text: str) -> str | None:
    """Call MyMemory free API synchronously. Returns None on any error."""
    try:
        r = httpx.get(
            _MYMEMORY_URL,
            params={"q": text, "langpair": "ja|en"},
            timeout=5.0,
        )
        r.raise_for_status()
        data = r.json()
        translated = data.get("responseData", {}).get("translatedText", "")
        # MyMemory returns "QUERY LENGTH LIMIT..." or empty string on failure
        if translated and not translated.upper().startswith("QUERY LENGTH"):
            return translated
    except Exception as exc:
        logging.warning("MyMemory translation failed: %s", exc)
    return None


class JMdictFallbackProvider(AIProvider):
    """Returns a degraded response built from local JMdict data + MyMemory translation."""

    def explain_sentence(
        self,
        sentence: str,
        jlpt_level: str,
        dict_forms: list[str],
    ) -> SentenceExplanationResponse:
        words: dict[str, WordExplanation] = {}

        seen: set[str] = set()
        for form in dict_forms:
            if form in seen:
                continue
            seen.add(form)

            entry = get_jmdict_entry(form)
            if entry is None:
                continue

            meaning, reading = entry
            words[form] = WordExplanation(
                reading=reading,
                pos="",
                meaning=meaning,
                usage_in_context=None,
                source="jmdict",
            )

        translation = _mymemory_translate(sentence)

        return SentenceExplanationResponse(
            sentence=sentence,
            translation=translation,
            words=words,
            grammar_points=[],
            reading_tips=None,
            degraded=True,
        )
