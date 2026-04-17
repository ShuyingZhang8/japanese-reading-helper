"""Tests for quiz_generator._parse_quiz and schema validators."""

import json

import pytest
from pydantic import ValidationError

from quiz_generator import _parse_quiz
from schemas import QuizResponse

# ── Shared fixture ─────────────────────────────────────────────────────────────

VALID_QUIZ_JSON = json.dumps({
    "questions": [
        {
            "type": "comprehension",
            "question": "Where did the student go?",
            "options": [
                {"id": "A", "text": "School"},
                {"id": "B", "text": "Home"},
                {"id": "C", "text": "Park"},
                {"id": "D", "text": "Store"},
            ],
            "correct_id": "A",
            "explanation": "The article says the student went to school.",
            "source_sentence": "学生は学校に行きました。",
        },
        {
            "type": "vocabulary",
            "question": "What does 学校 mean?",
            "options": [
                {"id": "A", "text": "Home"},
                {"id": "B", "text": "School"},
                {"id": "C", "text": "Library"},
                {"id": "D", "text": "Hospital"},
            ],
            "correct_id": "B",
            "explanation": "学校 means school.",
            "source_sentence": "学生は学校に行きました。",
        },
        {
            "type": "grammar",
            "question": "Choose the correct particle: 学校___行きました。",
            "options": [
                {"id": "A", "text": "が"},
                {"id": "B", "text": "は"},
                {"id": "C", "text": "に"},
                {"id": "D", "text": "を"},
            ],
            "correct_id": "C",
            "explanation": "に marks destination of movement.",
            "source_sentence": "学生は学校に行きました。",
        },
    ]
})


# ── _parse_quiz tests ──────────────────────────────────────────────────────────

def test_parse_quiz_valid_json() -> None:
    result = _parse_quiz(VALID_QUIZ_JSON)
    assert isinstance(result, QuizResponse)
    assert len(result.questions) == 3
    assert result.questions[0].type == "comprehension"
    assert result.questions[1].type == "vocabulary"
    assert result.questions[2].type == "grammar"


def test_parse_quiz_strips_markdown() -> None:
    """JSON wrapped in ```json fences should still parse correctly."""
    fenced = f"```json\n{VALID_QUIZ_JSON}\n```"
    result = _parse_quiz(fenced)
    assert isinstance(result, QuizResponse)
    assert len(result.questions) == 3


def test_parse_quiz_invalid_json() -> None:
    """Malformed JSON raises ValueError."""
    with pytest.raises(ValueError):
        _parse_quiz("not json at all")


# ── Schema validator tests ─────────────────────────────────────────────────────

def test_quiz_question_validators_wrong_option_count() -> None:
    """QuizQuestion with != 4 options raises ValidationError."""
    data = json.loads(VALID_QUIZ_JSON)
    # Remove one option from first question
    data["questions"][0]["options"].pop()
    with pytest.raises(ValidationError):
        QuizResponse.model_validate(data)


def test_quiz_response_validators_wrong_question_count() -> None:
    """QuizResponse with != 3 questions raises ValidationError."""
    data = json.loads(VALID_QUIZ_JSON)
    data["questions"].pop()  # Only 2 questions now
    with pytest.raises(ValidationError):
        QuizResponse.model_validate(data)


def test_quiz_response_validators_wrong_type_order() -> None:
    """QuizResponse where question types are out of order raises ValidationError."""
    data = json.loads(VALID_QUIZ_JSON)
    # Swap comprehension and vocabulary
    data["questions"][0]["type"] = "vocabulary"
    data["questions"][1]["type"] = "comprehension"
    with pytest.raises(ValidationError):
        QuizResponse.model_validate(data)
