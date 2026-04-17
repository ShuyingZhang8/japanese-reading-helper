import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, FileText, HelpCircle, Loader, Zap, ZapOff, Download } from 'lucide-react';
import WordTooltip from '../components/WordTooltip';
import SentencePanel from '../components/SentencePanel';
import QuizPanel from '../components/QuizPanel';
import { explainSentence, type SentenceExplanationResponse } from '../services/sentenceApi';
import { generateQuiz, type QuizQuestion, type OptionId } from '../services/quizApi';
import { downloadReport } from '../services/reportPdf';
import type { TokenInfo, VocabItem } from '../services/tokenizer';

// ── Types ──────────────────────────────────────────────────────────────────

interface ClickedWord {
  surface: string;
  dictForm: string;
  sentenceIndex: number;
  x: number;
  y: number;
}

interface SentenceGroup {
  tokens: TokenInfo[];
  sentenceIndex: number;
}

// Punctuation / whitespace POS categories that should not be clickable
const NON_CLICKABLE_POS = new Set(['補助記号', '記号', '空白']);

function isClickable(token: TokenInfo): boolean {
  if (!token.part_of_speech.length) return false;
  return !NON_CLICKABLE_POS.has(token.part_of_speech[0]);
}

// ── Sentence segmentation ──────────────────────────────────────────────────

const SENTENCE_END_SURFACES = new Set(['。', '！', '？', '!', '?', '.', '\n']);

function segmentIntoSentences(tokens: TokenInfo[]): SentenceGroup[] {
  const groups: SentenceGroup[] = [];
  let current: TokenInfo[] = [];

  for (const token of tokens) {
    current.push(token);
    if (SENTENCE_END_SURFACES.has(token.surface)) {
      groups.push({ tokens: current, sentenceIndex: groups.length });
      current = [];
    }
  }
  if (current.length > 0) {
    groups.push({ tokens: current, sentenceIndex: groups.length });
  }
  return groups;
}

// ── Component ─────────────────────────────────────────────────────────────

interface ReadingPageProps {
  articleContent: string;
  tokenizedData: { tokens: TokenInfo[]; token_count: number; original_text: string } | null;
  unknownWords: VocabItem[];
  jlptLevel: string;
  onBack: () => void;       // → PreAnalysisPage
  onNewArticle: () => void; // → SetupPage
}

export default function ReadingPage({
  articleContent,
  tokenizedData,
  unknownWords,
  jlptLevel,
  onBack,
  onNewArticle,
}: ReadingPageProps) {
  const unknownSet = new Set(unknownWords.map((w) => w.word));
  const sentences = tokenizedData ? segmentIntoSentences(tokenizedData.tokens) : [];

  const sentenceCache = useRef<Map<number, SentenceExplanationResponse>>(new Map());

  const [clickedWord, setClickedWord] = useState<ClickedWord | null>(null);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [sentenceExplanation, setSentenceExplanation] = useState<SentenceExplanationResponse | null>(null);
  const [isLoadingSentence, setIsLoadingSentence] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, OptionId>>({});
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [highlightedSentence, setHighlightedSentence] = useState<string | null>(null);
  const quizCache = useRef<QuizQuestion[] | null>(null);

  useEffect(() => {
    if (!clickedWord) return;
    const handler = () => setClickedWord(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [clickedWord]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setClickedWord(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleWordClick = async (token: TokenInfo, sentenceIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isClickable(token)) return;

    setClickedWord({ surface: token.surface, dictForm: token.dictionary_form, sentenceIndex, x: e.clientX, y: e.clientY });

    if (sentenceIndex === activeSentenceIndex) return;

    const cached = sentenceCache.current.get(sentenceIndex);
    if (cached) {
      setActiveSentenceIndex(sentenceIndex);
      setSentenceExplanation(cached);
      return;
    }

    setActiveSentenceIndex(sentenceIndex);
    setSentenceExplanation(null);
    setIsLoadingSentence(true);

    const group = sentences.find((s) => s.sentenceIndex === sentenceIndex);
    if (!group) { setIsLoadingSentence(false); return; }

    const sentenceText = group.tokens.map((t) => t.surface).join('');
    const dictForms = group.tokens.map((t) => t.dictionary_form);

    try {
      const result = await explainSentence(sentenceText, jlptLevel, dictForms, !aiEnabled);
      sentenceCache.current.set(sentenceIndex, result);
      setSentenceExplanation(result);
    } catch (err) {
      console.error('Failed to fetch sentence explanation:', err);
    } finally {
      setIsLoadingSentence(false);
    }
  };

  const handleShowQuiz = async () => {
    if (quizQuestions) { setShowQuiz(!showQuiz); return; }
    setIsLoadingQuiz(true);
    try {
      const cached = quizCache.current;
      const questions = cached ?? (await generateQuiz(articleContent, jlptLevel, unknownWords.map((w) => w.word))).questions;
      if (!cached) quizCache.current = questions;
      setQuizQuestions(questions);
      setShowQuiz(true);
    } catch (err) {
      console.error('Error generating quiz:', err);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleAnswer = (questionIndex: number, optionId: OptionId) => {
    setQuizAnswers((prev) => ({ ...prev, [questionIndex]: optionId }));
    if (quizQuestions) {
      setHighlightedSentence(quizQuestions[questionIndex].source_sentence);
    }
  };

  const handleTryAgain = async () => {
    quizCache.current = null;
    setQuizQuestions(null);
    setQuizAnswers({});
    setHighlightedSentence(null);
    setIsLoadingQuiz(true);
    try {
      const result = await generateQuiz(articleContent, jlptLevel, unknownWords.map((w) => w.word));
      quizCache.current = result.questions;
      setQuizQuestions(result.questions);
    } catch (err) {
      console.error('Error regenerating quiz:', err);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleExportReport = async () => {
    if (!tokenizedData) return;
    setIsExporting(true);
    // Yield one animation frame so React commits the loading state before we start heavy work
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadReport({
        jlptLevel,
        date,
        tokens: tokenizedData.tokens,
        unknownWords,
        sentenceAnalyses: Array.from(sentenceCache.current.values()),
        quizQuestions: quizQuestions,
        quizAnswers,
      });
    } catch (err) {
      console.error('Failed to export report:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const activeWordExplanation =
    clickedWord && sentenceExplanation
      ? sentenceExplanation.words[clickedWord.dictForm] ?? null
      : null;

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 z-30">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <button
              onClick={onNewArticle}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-slate-400 rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              New Article
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportReport}
              disabled={isExporting || !tokenizedData}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {isExporting
                ? <><Loader className="w-4 h-4 animate-spin" />Exporting...</>
                : <><Download className="w-4 h-4" />Export Report</>}
            </button>

            <button
              onClick={() => setAiEnabled(!aiEnabled)}
              title={aiEnabled ? 'AI on — click to disable' : 'AI off — click to enable'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                aiEnabled
                  ? 'border-green-400 text-green-700 bg-green-50 hover:bg-green-100'
                  : 'border-slate-300 text-slate-500 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              {aiEnabled ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              AI
            </button>

            <div className="relative group">
              <button
                onClick={handleShowQuiz}
                disabled={isLoadingQuiz || !aiEnabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${
                  aiEnabled
                    ? 'bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
              >
                {isLoadingQuiz
                  ? <><Loader className="w-4 h-4 animate-spin" />Generating...</>
                  : <><HelpCircle className="w-4 h-4" />Pop Quiz</>}
              </button>
              {!aiEnabled && (
                <div className="absolute right-0 top-full mt-2 w-48 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Enable AI to use Pop Quiz
                  <div className="absolute -top-1 right-4 w-2 h-2 bg-slate-800 rotate-45" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden max-w-screen-xl mx-auto w-full">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
            <div className="leading-relaxed text-lg text-slate-900 text-justify">
              {sentences.map((group) => {
                const sentenceText = group.tokens.map((t) => t.surface).join('');
                const isHighlighted = highlightedSentence !== null && sentenceText === highlightedSentence;
                return (
                <span key={group.sentenceIndex} className={isHighlighted ? 'bg-amber-100 rounded' : ''}>
                  {group.tokens.map((token, i) => {
                    const clickable = isClickable(token);
                    const isUnknown =
                      (unknownSet.has(token.dictionary_form) || unknownSet.has(token.surface));
                    const isActive =
                      clickedWord?.sentenceIndex === group.sentenceIndex &&
                      clickedWord?.dictForm === token.dictionary_form;

                    return (
                      <span
                        key={i}
                        onClick={clickable ? (e) => handleWordClick(token, group.sentenceIndex, e) : undefined}
                        className={[
                          clickable ? 'cursor-pointer' : 'cursor-default',
                          isActive ? 'bg-blue-200' : isUnknown ? 'bg-red-200 hover:bg-red-300' : clickable ? 'hover:bg-blue-100' : '',
                          isUnknown ? 'font-semibold' : '',
                        ].join(' ')}
                      >
                        {token.surface}
                      </span>
                    );
                  })}
                </span>
                );
              })}
            </div>

            {showQuiz && quizQuestions && (
              <QuizPanel
                questions={quizQuestions}
                answers={quizAnswers}
                onAnswer={handleAnswer}
                onTryAgain={handleTryAgain}
                highlightedSentence={highlightedSentence}
              />
            )}
          </div>
        </div>

        {activeSentenceIndex !== null && (
          <div className="w-80 xl:w-96 border-l border-slate-200 bg-white overflow-y-auto flex-shrink-0">
            {isLoadingSentence ? (
              <div className="flex items-center justify-center h-32 gap-2 text-slate-500">
                <Loader className="w-5 h-5 animate-spin" />
                <span className="text-sm">Analyzing sentence…</span>
              </div>
            ) : sentenceExplanation ? (
              <SentencePanel explanation={sentenceExplanation} activeWord={clickedWord?.dictForm ?? null} />
            ) : null}
          </div>
        )}
      </div>

      {clickedWord && (
        <WordTooltip
          word={clickedWord.surface}
          explanation={activeWordExplanation}
          degraded={sentenceExplanation?.degraded ?? false}
          x={clickedWord.x}
          y={clickedWord.y}
          onClose={() => setClickedWord(null)}
        />
      )}
    </div>
  );
}
