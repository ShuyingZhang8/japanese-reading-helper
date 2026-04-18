const BACKEND_URL = '';

export type OptionId = 'A' | 'B' | 'C' | 'D';
export type QuestionType = 'comprehension' | 'vocabulary' | 'grammar';

export interface QuizOption {
  id: OptionId;
  text: string;
}

export interface QuizQuestion {
  type: QuestionType;
  question: string;
  options: QuizOption[];
  correct_id: OptionId;
  explanation: string;
  source_sentence: string;
}

export interface QuizResponse {
  questions: QuizQuestion[];
}

export async function generateQuiz(
  article: string,
  jlptLevel: string,
  unknownWords: string[]
): Promise<QuizResponse> {
  const response = await fetch(`${BACKEND_URL}/api/generate-quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      article,
      jlpt_level: jlptLevel,
      unknown_words: unknownWords,
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `Backend error: ${response.status}`);
  }

  return response.json();
}
