import json
import logging
import os
import re

from pydantic import ValidationError

from schemas import QuizResponse

_PROMPT_TEMPLATE = """\
You are a Japanese language quiz writer. Generate exactly 3 quiz questions for a JLPT {jlpt_level} student who has just read the article below.

Article:
{article}

Unknown vocabulary words the student encountered (dictionary forms):
{unknown_words}

Generate EXACTLY this JSON structure — no markdown, no code blocks, no extra text:
{{
  "questions": [
    {{
      "type": "comprehension",
      "question": "Question text in English (or Japanese for N3+)",
      "options": [
        {{"id": "A", "text": "..."}},
        {{"id": "B", "text": "..."}},
        {{"id": "C", "text": "..."}},
        {{"id": "D", "text": "..."}}
      ],
      "correct_id": "A",
      "explanation": "Why the correct answer is right and why the others are wrong.",
      "source_sentence": "The exact sentence from the article that contains the answer."
    }},
    {{
      "type": "vocabulary",
      "question": "Question testing a word from the unknown vocabulary list, with the original sentence as context.",
      "options": [
        {{"id": "A", "text": "..."}},
        {{"id": "B", "text": "..."}},
        {{"id": "C", "text": "..."}},
        {{"id": "D", "text": "..."}}
      ],
      "correct_id": "B",
      "explanation": "Why the correct meaning is right and why distractors are wrong.",
      "source_sentence": "The exact sentence from the article containing this word."
    }},
    {{
      "type": "grammar",
      "question": "Fill-in-the-blank question testing a grammar point from the article that is above JLPT {jlpt_level}.",
      "options": [
        {{"id": "A", "text": "..."}},
        {{"id": "B", "text": "..."}},
        {{"id": "C", "text": "..."}},
        {{"id": "D", "text": "..."}}
      ],
      "correct_id": "C",
      "explanation": "Why the correct grammar form is right and why the distractors are commonly confused.",
      "source_sentence": "The exact sentence from the article containing this grammar point."
    }}
  ]
}}

Rules:
- Question order MUST be: comprehension (index 0), vocabulary (index 1), grammar (index 2).
- Comprehension: test a fact explicitly stated in the article; question wording must stay within JLPT {jlpt_level} vocabulary.
- Vocabulary: pick one word from the unknown_words list that has clear meaning in context. Use English options for N4 and below, Japanese options for N3 and above.
- Grammar: use a fill-in-the-blank from an actual article sentence; the blanked grammar point must be above JLPT {jlpt_level}; distractors must be plausible confusables for a {jlpt_level} learner.
- Every source_sentence must be a verbatim excerpt from the article.
- correct_id must be A, B, C, or D and must match one of the option ids."""


def _call_ai(prompt: str) -> str:
    """Call whichever AI is configured (same env var as the rest of the app)."""
    provider = os.getenv("AI_PROVIDER", "gemini").lower()
    if provider == "openai":
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a Japanese language quiz writer. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or ""
    else:
        from google import genai
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        return response.text


def _parse_quiz(raw: str) -> QuizResponse:
    json_match = re.search(r"\{[\s\S]*\}", raw)
    if not json_match:
        raise ValueError("No JSON object found in AI response")
    return QuizResponse.model_validate(json.loads(json_match.group()))


def generate_quiz(article: str, jlpt_level: str, unknown_words: list[str]) -> QuizResponse:
    """Call AI, validate with Pydantic, retry once on failure. Raises on second failure."""
    prompt = _PROMPT_TEMPLATE.format(
        jlpt_level=jlpt_level,
        article=article[:3000],
        unknown_words=", ".join(unknown_words[:30]) if unknown_words else "(none)",
    )

    for attempt in range(2):
        try:
            raw = _call_ai(prompt)
            return _parse_quiz(raw)
        except (ValidationError, ValueError, json.JSONDecodeError) as exc:
            if attempt == 0:
                logging.warning("Quiz generation attempt 1 failed (%s), retrying…", exc)
            else:
                raise ValueError(f"Quiz generation failed after 2 attempts: {exc}") from exc

    raise RuntimeError("unreachable")
