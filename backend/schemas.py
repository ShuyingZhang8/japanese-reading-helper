from typing import Any, Literal

from pydantic import BaseModel, field_validator


JLPTLevel = Literal["N5", "N4", "N3", "N2", "N1"]


class TokenInfo(BaseModel):
    surface: str
    dictionary_form: str
    reading: str
    part_of_speech: list[str]  # full 6-element SudachiPy POS tuple
    dictionary_id: int
    is_unknown: bool


class VocabItem(BaseModel):
    word: str
    reading: str
    part_of_speech: str
    meaning: str


class AnalyzeRequest(BaseModel):
    article: str
    jlpt_level: JLPTLevel

    @field_validator("article")
    @classmethod
    def validate_article(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("article must not be empty")
        return value


class AnalyzeResponse(BaseModel):
    tokens: list[TokenInfo]
    unknown_vocab: list[VocabItem]
    article_raw: str
    token_count: int
    unknown_count: int


class TokenizeRequest(BaseModel):
    text: str
    jlpt_level: str = "N3"


class TokenizeResponse(BaseModel):
    success: bool
    tokens: list[TokenInfo]
    token_count: int
    original_text: str


class HealthResponse(BaseModel):
    status: str
    service: str


# ── Sentence-level explanation ──────────────────────────────────────────────

class WordExplanation(BaseModel):
    reading: str
    pos: str
    meaning: str | None
    usage_in_context: str | None
    source: Literal["ai", "jmdict", "basic"]


class GrammarPoint(BaseModel):
    pattern: str
    explanation: str
    example: str


class SentenceExplanationRequest(BaseModel):
    sentence: str
    jlpt_level: JLPTLevel
    dict_forms: list[str]
    force_fallback: bool = False


class SentenceExplanationResponse(BaseModel):
    sentence: str
    translation: str | None
    words: dict[str, WordExplanation]
    grammar_points: list[GrammarPoint]
    reading_tips: str | None
    degraded: bool


# ── Quiz ─────────────────────────────────────────────────────────────────────

QuestionType = Literal["comprehension", "vocabulary", "grammar"]
OptionId = Literal["A", "B", "C", "D"]


class QuizOption(BaseModel):
    id: OptionId
    text: str


class QuizQuestion(BaseModel):
    type: QuestionType
    question: str
    options: list[QuizOption]
    correct_id: OptionId
    explanation: str
    source_sentence: str

    @field_validator("options")
    @classmethod
    def exactly_four_options(cls, v: list) -> list:
        if len(v) != 4:
            raise ValueError(f"options must have exactly 4 items, got {len(v)}")
        return v

    @field_validator("correct_id")
    @classmethod
    def correct_id_in_options(cls, v: str, info: Any) -> str:
        options = info.data.get("options", [])
        ids = {opt.id for opt in options}
        if v not in ids:
            raise ValueError(f"correct_id '{v}' not found in options {ids}")
        return v

    @field_validator("source_sentence")
    @classmethod
    def source_sentence_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("source_sentence must not be empty")
        return v


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]

    @field_validator("questions")
    @classmethod
    def exactly_three_questions(cls, v: list) -> list:
        if len(v) != 3:
            raise ValueError(f"questions must have exactly 3 items, got {len(v)}")
        expected_types = ["comprehension", "vocabulary", "grammar"]
        for i, (q, expected) in enumerate(zip(v, expected_types)):
            if q.type != expected:
                raise ValueError(f"question[{i}].type must be '{expected}', got '{q.type}'")
        return v


class QuizRequest(BaseModel):
    article: str
    jlpt_level: JLPTLevel
    unknown_words: list[str]  # dictionary forms from pre-analysis
