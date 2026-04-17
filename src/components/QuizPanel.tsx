import type { QuizQuestion, OptionId } from '../services/quizApi';

interface QuizPanelProps {
  questions: QuizQuestion[];
  answers: Record<number, OptionId>;   // questionIndex → chosen option
  onAnswer: (questionIndex: number, optionId: OptionId) => void;
  onTryAgain: () => void;
  highlightedSentence: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  comprehension: '📖 Reading Comprehension',
  vocabulary: '📝 Vocabulary',
  grammar: '🔤 Grammar',
};

export default function QuizPanel({
  questions,
  answers,
  onAnswer,
  onTryAgain,
  highlightedSentence,
}: QuizPanelProps) {
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;
  const score = questions.filter((q, i) => answers[i] === q.correct_id).length;

  return (
    <div className="mt-10 pt-10 border-t border-slate-200 space-y-8">
      <h3 className="text-2xl font-bold text-slate-900">Comprehension Quiz</h3>

      {questions.map((q, qi) => {
        const chosen = answers[qi];
        const locked = chosen !== undefined;
        const correct = locked && chosen === q.correct_id;

        return (
          <div key={qi} className="bg-slate-50 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {TYPE_LABELS[q.type] ?? q.type}
              </span>
              {locked && (
                <span className={`ml-auto text-sm font-bold ${correct ? 'text-green-600' : 'text-red-600'}`}>
                  {correct ? '✓ Correct' : '✗ Incorrect'}
                </span>
              )}
            </div>

            <p className="text-slate-900 font-medium">{q.question}</p>

            <div className="space-y-2">
              {q.options.map((opt) => {
                let style = 'border-slate-200 bg-white text-slate-800 hover:border-blue-400';
                if (locked) {
                  if (opt.id === q.correct_id) {
                    style = 'border-green-500 bg-green-50 text-green-900 font-semibold';
                  } else if (opt.id === chosen) {
                    style = 'border-red-400 bg-red-50 text-red-800';
                  } else {
                    style = 'border-slate-200 bg-white text-slate-400 cursor-default';
                  }
                }

                return (
                  <button
                    key={opt.id}
                    disabled={locked}
                    onClick={() => onAnswer(qi, opt.id)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${style} disabled:cursor-default`}
                  >
                    <span className="font-bold flex-shrink-0">{opt.id}.</span>
                    <span>{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {locked && (
              <div className="mt-2 space-y-2">
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Explanation</p>
                  <p className="text-sm text-slate-700">{q.explanation}</p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700 uppercase tracking-wide mb-1">Source</p>
                  <p className={`text-sm font-medium ${highlightedSentence === q.source_sentence ? 'text-blue-700' : 'text-amber-900'}`}>
                    {q.source_sentence}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {allAnswered && (
        <div className="flex items-center justify-between bg-white rounded-xl p-6 border border-slate-200">
          <p className="text-xl font-bold text-slate-900">
            Score: <span className={score === questions.length ? 'text-green-600' : 'text-blue-600'}>{score} / {questions.length}</span>
          </p>
          <button
            onClick={onTryAgain}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
