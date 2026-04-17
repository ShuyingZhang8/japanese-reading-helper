import json
import logging
import os

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from ai.base import AIProvider
from schemas import GrammarPoint, SentenceExplanationResponse, WordExplanation

_MODEL = "gpt-4o-mini"

_SYSTEM_PROMPT = "You are a Japanese language reading assistant. Always respond with a single valid JSON object exactly matching the requested schema — no markdown, no code blocks, no extra text."

_USER_PROMPT_TEMPLATE = """\
Help a JLPT {jlpt_level} student understand this sentence.

Sentence: 「{sentence}」

Dictionary forms of words in this sentence:
{dict_forms}

Respond with ONLY a valid JSON object:
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


# ── Internal Pydantic models for validating response ───────────────────────

class _WordEntry(BaseModel):
    reading: str
    pos: str
    meaning: str
    usage_in_context: str | None = None


class _OpenAIRaw(BaseModel):
    translation: str
    words: dict[str, _WordEntry]
    grammar_points: list[dict[str, str]] = []
    reading_tips: str | None = None


class OpenAIProvider(AIProvider):
    def explain_sentence(
        self,
        sentence: str,
        jlpt_level: str,
        dict_forms: list[str],
    ) -> SentenceExplanationResponse:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")

        client = OpenAI(api_key=api_key)
        user_prompt = _USER_PROMPT_TEMPLATE.format(
            jlpt_level=jlpt_level,
            sentence=sentence,
            dict_forms=", ".join(dict_forms) if dict_forms else "(none)",
        )

        response = client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )

        raw_text = response.choices[0].message.content or ""
        data = json.loads(raw_text)
        parsed = _OpenAIRaw.model_validate(data)

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
