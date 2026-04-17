const BACKEND_URL = 'http://localhost:8000';

export interface TokenInfo {
  surface: string;
  dictionary_form: string;
  reading: string;
  part_of_speech: string[];  // full 6-element SudachiPy POS tuple
  dictionary_id: number;
  is_unknown: boolean;
}

export interface VocabItem {
  word: string;
  reading: string;
  part_of_speech: string;
  meaning: string;
}

export interface TokenizeResponse {
  success: boolean;
  tokens: TokenInfo[];
  token_count: number;
  original_text: string;
}

export interface GrammarPattern {
  pattern: string;
  description: string;
}

export interface GrammarAnalysisResponse {
  success: boolean;
  patterns: GrammarPattern[];
  pattern_count: number;
}

export interface AnalyzeResponse {
  tokens: TokenInfo[];
  unknown_vocab: VocabItem[];
  article_raw: string;
  token_count: number;
  unknown_count: number;
}

export async function tokenizeText(text: string, jlptLevel: string): Promise<TokenizeResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/tokenize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        jlpt_level: jlptLevel
      })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Tokenization error:', error);
    throw error;
  }
}

export async function analyzeGrammar(text: string): Promise<GrammarAnalysisResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/grammar-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Grammar analysis error:', error);
    throw error;
  }
}

export async function analyzeArticle(
  article: string,
  jlptLevel: string
): Promise<AnalyzeResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        article,
        jlpt_level: jlptLevel
      })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Analyze article error:', error);
    throw error;
  }
}
