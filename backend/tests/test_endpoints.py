from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app import app
from schemas import (
    AnalyzeResponse,
    QuizResponse,
    SentenceExplanationResponse,
    WordExplanation,
)


@pytest.mark.asyncio
async def test_health_ok() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


@pytest.mark.asyncio
async def test_analyze_basic() -> None:
    transport = ASGITransport(app=app)
    payload = {"article": "私は学生です。", "jlpt_level": "N5"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body["tokens"]) > 0
    assert body["token_count"] > 0


@pytest.mark.asyncio
async def test_analyze_unknown_count_consistent() -> None:
    transport = ASGITransport(app=app)
    payload = {"article": "私は把握できません。", "jlpt_level": "N5"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    body = response.json()
    unknown_token_count = sum(1 for token in body["tokens"] if token["is_unknown"])
    assert body["unknown_count"] <= unknown_token_count


@pytest.mark.asyncio
async def test_analyze_empty_article_422() -> None:
    transport = ASGITransport(app=app)
    payload = {"article": "", "jlpt_level": "N5"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/analyze", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_analyze_invalid_jlpt_422() -> None:
    transport = ASGITransport(app=app)
    payload = {"article": "テスト", "jlpt_level": "N6"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/analyze", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_analyze_response_valid_schema() -> None:
    transport = ASGITransport(app=app)
    payload = {"article": "私は学生です。", "jlpt_level": "N5"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    AnalyzeResponse.model_validate(response.json())



@pytest.mark.asyncio
async def test_explain_sentence_ok() -> None:
    mock_result = SentenceExplanationResponse(
        sentence="私は学校に行きます。",
        translation="I go to school.",
        words={
            "学校": WordExplanation(
                reading="がっこう",
                pos="Noun",
                meaning="school",
                usage_in_context="destination",
                source="ai",
            )
        },
        grammar_points=[],
        reading_tips=None,
        degraded=False,
    )
    transport = ASGITransport(app=app)
    payload = {
        "sentence": "私は学校に行きます。",
        "jlpt_level": "N5",
        "dict_forms": ["私", "学校", "行く"],
    }
    with patch("app._ai_router") as mock_router:
        mock_router.explain_sentence.return_value = mock_result
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/explain-sentence", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["translation"] == "I go to school."
    assert body["degraded"] is False
    SentenceExplanationResponse.model_validate(body)


@pytest.mark.asyncio
async def test_explain_sentence_cached() -> None:
    """Second call with same sentence should not call the router again."""
    mock_result = SentenceExplanationResponse(
        sentence="テスト文。",
        translation="Test sentence.",
        words={},
        grammar_points=[],
        reading_tips=None,
        degraded=False,
    )
    transport = ASGITransport(app=app)
    payload = {"sentence": "テスト文。", "jlpt_level": "N3", "dict_forms": []}

    with patch("app._ai_router") as mock_router:
        mock_router.explain_sentence.return_value = mock_result
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/explain-sentence", json=payload)
            await client.post("/api/explain-sentence", json=payload)
        assert mock_router.explain_sentence.call_count == 1


@pytest.mark.asyncio
async def test_explain_sentence_force_fallback() -> None:
    """force_fallback=True bypasses the AI router and hits the fallback provider."""
    mock_result = SentenceExplanationResponse(
        sentence="学校に行く。",
        translation="Go to school.",
        words={},
        grammar_points=[],
        reading_tips=None,
        degraded=True,
    )
    transport = ASGITransport(app=app)
    payload = {
        "sentence": "学校に行く。",
        "jlpt_level": "N5",
        "dict_forms": ["学校", "行く"],
        "force_fallback": True,
    }
    with patch("app._fallback_provider") as mock_fallback:
        mock_fallback.explain_sentence.return_value = mock_result
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/explain-sentence", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["degraded"] is True
    mock_fallback.explain_sentence.assert_called_once()


@pytest.mark.asyncio
async def test_generate_quiz_endpoint_ok() -> None:
    """generate_quiz_endpoint returns 200 with a valid QuizResponse."""
    from schemas import QuizOption, QuizQuestion

    mock_questions = [
        QuizQuestion(
            type="comprehension",
            question="What did the student do?",
            options=[
                QuizOption(id="A", text="Went to school"),
                QuizOption(id="B", text="Stayed home"),
                QuizOption(id="C", text="Ate breakfast"),
                QuizOption(id="D", text="Read a book"),
            ],
            correct_id="A",
            explanation="The article states the student went to school.",
            source_sentence="学生は学校に行きました。",
        ),
        QuizQuestion(
            type="vocabulary",
            question="What does 学校 mean?",
            options=[
                QuizOption(id="A", text="Home"),
                QuizOption(id="B", text="School"),
                QuizOption(id="C", text="Library"),
                QuizOption(id="D", text="Hospital"),
            ],
            correct_id="B",
            explanation="学校 means school.",
            source_sentence="学生は学校に行きました。",
        ),
        QuizQuestion(
            type="grammar",
            question="Choose the correct particle: 学校___行きました。",
            options=[
                QuizOption(id="A", text="が"),
                QuizOption(id="B", text="は"),
                QuizOption(id="C", text="に"),
                QuizOption(id="D", text="を"),
            ],
            correct_id="C",
            explanation="に marks destination.",
            source_sentence="学生は学校に行きました。",
        ),
    ]
    mock_result = QuizResponse(questions=mock_questions)

    transport = ASGITransport(app=app)
    payload = {
        "article": "学生は学校に行きました。",
        "jlpt_level": "N5",
        "unknown_words": ["学校"],
    }
    with patch("app.generate_quiz", return_value=mock_result):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/generate-quiz", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body["questions"]) == 3
    QuizResponse.model_validate(body)


@pytest.mark.asyncio
async def test_generate_quiz_endpoint_value_error_422() -> None:
    """generate_quiz raises ValueError → endpoint returns 422."""
    transport = ASGITransport(app=app)
    payload = {"article": "テスト", "jlpt_level": "N5", "unknown_words": []}
    with patch("app.generate_quiz", side_effect=ValueError("Quiz generation failed")):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/generate-quiz", json=payload)
    assert response.status_code == 422
