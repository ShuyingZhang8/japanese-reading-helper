from abc import ABC, abstractmethod

from schemas import SentenceExplanationResponse


class AIProvider(ABC):
    @abstractmethod
    def explain_sentence(
        self,
        sentence: str,
        jlpt_level: str,
        dict_forms: list[str],
    ) -> SentenceExplanationResponse:
        ...
