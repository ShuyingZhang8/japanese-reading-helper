import json
import logging
import os
import re

from google import genai
from pydantic import BaseModel, ValidationError

from ai.base import AIProvider
from schemas import GrammarPoint, SentenceExplanationResponse, WordExplanation

_MODEL = "gemini-2.0-flash"

_PROMPT_TEMPLATE = """\
You are a Japanese language reading assistant helping a JLPT {jlpt_level} student.

Sentence: 「{sentence}」

Dictionary forms of words in this sentence:
{dict_forms}

Respond with ONLY a valid JSON object (no markdown, no code blocks):
{{
  "translation": "natural English translation of the full sentence",
  "words": {{
    "<dictionary_form>": {{
      "reading": "hiragana reading of the dictionary form",
      "pos": "part of speech in English (Noun / Verb / i-adj / na-adj / Adverb / etc.)",
      "meaning": "concise English meaning",
      "usage_in_context": "one sentence explaining how it is used here"
    }}
  }},
  "grammar_points": [
    {{
      "pattern": "grammar pattern name (e.g. ている)",
      "explanation": "what it means and how it works",
      "example": "the part of the sentence that uses this pattern"
    }}
  ],
  "reading_tips": "one concise reading tip, or null"
}}

Only include entries in "words" that are worth explaining for a JLPT {jlpt_level} student.
Focus on words from the provided list."""


# ── Internal Pydantic models for validating Gemini output ──────────────────

class _WordEntry(BaseModel):
    reading: str
    pos: str
    meaning: str
    usage_in_context: str | None = None


class _GeminiRaw(BaseModel):
    translation: str
    words: dict[str, _WordEntry]
    grammar_points: list[dict[str, str]] = []
    reading_tips: str | None = None


class GeminiProvider(AIProvider):
    def explain_sentence(
        self,
        sentence: str,
        jlpt_level: str,
        dict_forms: list[str],
    ) -> SentenceExplanationResponse:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")

        client = genai.Client(api_key=api_key)
        prompt = _PROMPT_TEMPLATE.format(
            jlpt_level=jlpt_level,
            sentence=sentence,
            dict_forms=", ".join(dict_forms) if dict_forms else "(none)",
        )

        response = client.models.generate_content(model=_MODEL, contents=prompt)
        raw_text = response.text or ""

        # Strip markdown code fences if present
        json_match = re.search(r"\{[\s\S]*\}", raw_text)
        if not json_match:
            raise ValueError(f"No JSON object found in Gemini response: {raw_text[:200]}")

        data = json.loads(json_match.group())
        parsed = _GeminiRaw.model_validate(data)

        words = {
            form: WordExplanation(
                reading=entry.reading,
                pos=entry.pos,
                meaning=entry.meaning,
                usage_in_context=entry.usage_in_context,
                source="ai",
            )
            for form, entry in parsed.words.items()
        }

        grammar_points: list[GrammarPoint] = []
        for gp in parsed.grammar_points:
            try:
                grammar_points.append(
                    GrammarPoint(
                        pattern=gp.get("pattern", ""),
                        explanation=gp.get("explanation", ""),
                        example=gp.get("example", ""),
                    )
                )
            except (ValidationError, KeyError) as exc:
                logging.warning("Skipping malformed grammar point: %s", exc)

        return SentenceExplanationResponse(
            sentence=sentence,
            translation=parsed.translation,
            words=words,
            grammar_points=grammar_points,
            reading_tips=parsed.reading_tips,
            degraded=False,
        )
