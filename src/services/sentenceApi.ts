const BACKEND_URL = 'http://localhost:8000';

export interface WordExplanation {
  reading: string;
  pos: string;
  meaning: string | null;
  usage_in_context: string | null;
  source: 'ai' | 'jmdict' | 'basic';
}

export interface GrammarPoint {
  pattern: string;
  explanation: string;
  example: string;
}

export interface SentenceExplanationResponse {
  sentence: string;
  translation: string | null;
  words: Record<string, WordExplanation>;
  grammar_points: GrammarPoint[];
  reading_tips: string | null;
  degraded: boolean;
}

export async function explainSentence(
  sentence: string,
  jlptLevel: string,
  dictForms: string[],
  forceFallback = false
): Promise<SentenceExplanationResponse> {
  const response = await fetch(`${BACKEND_URL}/api/explain-sentence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sentence,
      jlpt_level: jlptLevel,
      dict_forms: dictForms,
      force_fallback: forceFallback,
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return response.json();
}
