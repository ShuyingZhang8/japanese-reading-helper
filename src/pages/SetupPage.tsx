import { useState } from 'react';
import { AlertCircle, BookOpen } from 'lucide-react';

interface SetupPageProps {
  onNext: (jlptLevel: string, articleContent: string) => void;
}

const JLPT_LEVELS = [
  { level: 'N5', description: 'Beginner' },
  { level: 'N4', description: 'Elementary' },
  { level: 'N3', description: 'Intermediate' },
  { level: 'N2', description: 'Advanced' },
  { level: 'N1', description: 'Mastery' }
];

export default function SetupPage({ onNext }: SetupPageProps) {
  const [selectedLevel, setSelectedLevel] = useState('N3');
  const [articleText, setArticleText] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const hasJapaneseText = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(articleText);

  const handleNext = async () => {
    if (!articleText.trim()) {
      setError('Please paste an article');
      return;
    }

    if (!hasJapaneseText) {
      setError('Please paste a Japanese article');
      return;
    }

    if (articleText.trim().length < 50) {
      setError('Article should be at least 50 characters');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      onNext(selectedLevel, articleText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-slate-900">
              Japanese Reading Companion
            </h1>
          </div>

          <p className="text-slate-600 mb-8 text-lg">
            Select your JLPT level and paste a Japanese article to get started
          </p>

          <div className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Your JLPT Level
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {JLPT_LEVELS.map(({ level, description }) => (
                <button
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={`p-4 rounded-lg font-semibold transition-all ${
                    selectedLevel === level
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <div className="text-lg">{level}</div>
                  <div className="text-xs opacity-75">{description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              Paste Your Article
            </h2>
            <textarea
              value={articleText}
              onChange={(e) => {
                setArticleText(e.target.value);
                setError('');
              }}
              placeholder="Paste a Japanese article here... (at least 50 characters)"
              className="w-full h-48 p-4 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-slate-900 resize-none"
            />
            <div className="mt-2 text-sm text-slate-600">
              {articleText.length} characters
              {hasJapaneseText && ' • Contains Japanese text ✓'}
            </div>
          </div>

          {error && (
            <div className="mb-8 flex items-center gap-3 bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleNext}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Analyzing...' : 'Analyze Article'}
          </button>

          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-3">How it works:</h3>
            <ul className="space-y-2 text-slate-600 text-sm">
              <li>✓ Get a vocabulary preview before reading</li>
              <li>✓ Click any word to see contextual explanations</li>
              <li>✓ Track unknown words with AI assistance</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
