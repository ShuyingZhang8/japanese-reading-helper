import { useState, useEffect } from 'react';
import { ArrowLeft, Loader, AlertCircle, Download } from 'lucide-react';
import { analyzeArticle } from '../services/tokenizer';
import type { VocabItem } from '../services/tokenizer';
import type { TokenizedData } from '../App';

interface PreAnalysisPageProps {
  jlptLevel: string;
  articleContent: string;
  onBack: () => void;
  onStart: (tokenizedData: TokenizedData, unknownWords: VocabItem[]) => void;
  unknownWords: VocabItem[];
}

const POS_JA_TO_EN: Record<string, string> = {
  '名詞': 'Noun',
  '動詞': 'Verb',
  '形容詞': 'Adjective (i)',
  '形容動詞': 'Adjective (na)',
  '副詞': 'Adverb',
  '代名詞': 'Pronoun',
  '接続詞': 'Conjunction',
  '感動詞': 'Interjection',
  '助詞': 'Particle',
  '助動詞': 'Auxiliary verb',
  '接頭辞': 'Prefix',
  '接尾辞': 'Suffix',
  '記号': 'Symbol',
  '補助記号': 'Auxiliary symbol',
  '空白': 'Whitespace',
};

function translatePos(pos: string): string {
  return POS_JA_TO_EN[pos] ?? pos;
}

function exportCsv(words: VocabItem[], jlptLevel: string) {
  const header = 'Word,Reading,Part of Speech,Meaning';
  const rows = words.map((w) => {
    const escape = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
    return [escape(w.word), escape(w.reading), escape(w.part_of_speech), escape(w.meaning)].join(',');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `unknown_vocab_${jlptLevel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PreAnalysisPage({
  jlptLevel,
  articleContent,
  onBack,
  onStart,
}: PreAnalysisPageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tokenizedData, setTokenizedData] = useState<TokenizedData | null>(null);
  const [unknownWords, setUnknownWords] = useState<VocabItem[]>([]);
  const [uniqueUnknownWords, setUniqueUnknownWords] = useState<VocabItem[]>([]);

  useEffect(() => {
    const processArticle = async () => {
      try {
        setIsLoading(true);
        setError('');

        const analysis = await analyzeArticle(articleContent, jlptLevel);

        const tokenResponse = {
          tokens: analysis.tokens,
          token_count: analysis.token_count,
          original_text: analysis.article_raw,
        };
        setTokenizedData(tokenResponse);

        const unknownList = analysis.unknown_vocab.map((word) => ({
          word: word.word,
          reading: word.reading,
          meaning: word.meaning,
          part_of_speech: word.part_of_speech,
        }));
        setUnknownWords(unknownList);
        setUniqueUnknownWords(unknownList); // backend already dedupes
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyze article. Make sure the backend is running on http://localhost:8000');
      } finally {
        setIsLoading(false);
      }
    };

    processArticle();
  }, [articleContent, jlptLevel]);

  const handleStartReading = () => { if (tokenizedData) onStart(tokenizedData, unknownWords); };

  const unknownPercentage = tokenizedData
    ? Math.round((unknownWords.length / tokenizedData.token_count) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Pre-Analysis</h1>
          <p className="text-slate-600">
            Here's what we found in your article for JLPT {jlptLevel}
          </p>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 flex flex-col items-center justify-center gap-4">
            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-slate-600 text-lg">Analyzing your article...</p>
            <p className="text-slate-500 text-sm">This involves tokenization and vocabulary analysis</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 border-l-4 border-red-500">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-red-900 mb-2">Error</h3>
                <p className="text-red-700 mb-4">{error}</p>
                <p className="text-red-600 text-sm mb-4">Make sure the Python backend is running:</p>
                <code className="bg-red-50 px-3 py-2 rounded text-sm font-mono text-red-800">
                  cd backend && uvicorn app:app --reload
                </code>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-slate-900">Unknown Vocabulary</h2>
                  {uniqueUnknownWords.length > 0 && (
                    <button
                      onClick={() => exportCsv(uniqueUnknownWords, jlptLevel)}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  )}
                </div>
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-slate-600">
                    Found <span className="font-semibold text-blue-600">{uniqueUnknownWords.length}</span> unique unknown words
                    ({unknownPercentage}% of total words)
                  </p>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {uniqueUnknownWords.length === 0 ? (
                    <p className="text-slate-500 py-4">No unknown words found! This article matches your JLPT level.</p>
                  ) : (
                    uniqueUnknownWords.map((word, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{word.word}</span>
                            <span className="text-sm text-slate-500">{word.reading}</span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">{word.meaning}</p>
                          {word.part_of_speech && (
                            <p className="text-xs text-slate-500 mt-1">POS: {translatePos(word.part_of_speech)}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-6">Summary</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Total Words</p>
                    <p className="text-3xl font-bold text-slate-900">{tokenizedData?.token_count || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Unknown Words</p>
                    <p className="text-3xl font-bold text-blue-600">{uniqueUnknownWords.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Difficulty</p>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(unknownPercentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{unknownPercentage}% unknown</p>
                  </div>
                  <button
                    onClick={handleStartReading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors mt-8"
                  >
                    Start Reading
                  </button>
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-200">
                <h4 className="font-semibold text-amber-900 mb-3">Tips</h4>
                <ul className="text-sm text-amber-800 space-y-2">
                  <li>• Click any word while reading for explanations</li>
                  <li>• Highlighted words are ones you likely don't know</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
