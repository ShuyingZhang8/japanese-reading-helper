import { X } from 'lucide-react';
import type { WordExplanation } from '../services/sentenceApi';

interface WordTooltipProps {
  word: string;
  explanation: WordExplanation | null;
  degraded: boolean;
  x: number;
  y: number;
  onClose: () => void;
}

export default function WordTooltip({
  word,
  explanation,
  degraded,
  x,
  y,
  onClose,
}: WordTooltipProps) {
  const tooltipX = Math.min(x, window.innerWidth - 320);
  const tooltipY = Math.min(y + 12, window.innerHeight - 280);

  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-2xl border border-slate-200 p-4 w-72"
      style={{ left: `${tooltipX}px`, top: `${tooltipY}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-900">{word}</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {explanation ? (
        <div className="space-y-2">
          {explanation.reading && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Reading</p>
              <p className="text-base text-slate-700">{explanation.reading}</p>
            </div>
          )}

          {explanation.pos && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Part of Speech</p>
              <p className="text-sm text-slate-700">{explanation.pos}</p>
            </div>
          )}

          {explanation.meaning && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Meaning</p>
              <p className="text-sm text-slate-700">{explanation.meaning}</p>
            </div>
          )}

          {explanation.usage_in_context && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">In Context</p>
              <p className="text-xs text-slate-600 italic">{explanation.usage_in_context}</p>
            </div>
          )}

          <p className="text-xs text-slate-400 pt-1">
            {degraded ? '⚠️ Basic' : '✨ AI-powered'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500 italic">No explanation available for this word.</p>
      )}
    </div>
  );
}
