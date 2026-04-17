import logging

from ai.base import AIProvider
from schemas import SentenceExplanationResponse


class AIRouter:
    """Calls the primary provider; on any failure falls back to the secondary."""

    def __init__(self, primary: AIProvider, fallback: AIProvider) -> None:
        self._primary = primary
        self._fallback = fallback

    def explain_sentence(
        self,
        sentence: str,
        jlpt_level: str,
        dict_forms: list[str],
    ) -> SentenceExplanationResponse:
        try:
            return self._primary.explain_sentence(sentence, jlpt_level, dict_forms)
        except Exception as exc:
            logging.warning("Primary AI provider failed (%s), switching to fallback", exc)
            return self._fallback.explain_sentence(sentence, jlpt_level, dict_forms)
