import { useRef, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import type { SentenceExplanationResponse } from '../services/sentenceApi';

interface SentencePanelProps {
  explanation: SentenceExplanationResponse;
  activeWord: string | null; // dictionary_form of clicked word
}

export default function SentencePanel({ explanation, activeWord }: SentencePanelProps) {
  const wordEntries = Object.entries(explanation.words);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleDownload = async () => {
    if (!contentRef.current) return;
    setIsCapturing(true);
    try {
      // Clone the node and remove scroll constraints so the full content is captured
      const node = contentRef.current;
      const clone = node.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.width = `${node.scrollWidth}px`;
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      document.body.removeChild(clone);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'sentence-analysis.png';
      a.click();
    } catch (err) {
      console.error('Failed to capture PNG:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Analysis</span>
        <button
          onClick={handleDownload}
          disabled={isCapturing}
          title="Download as PNG"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-lg transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {isCapturing ? 'Saving…' : 'PNG'}
        </button>
      </div>

      <div ref={contentRef} className="flex flex-col gap-4 p-4 bg-white">
        {explanation.degraded && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Basic mode — AI unavailable, showing dictionary definitions only.
          </div>
        )}

        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Sentence</p>
          <p className="text-base font-medium text-slate-900 leading-relaxed">{explanation.sentence}</p>
        </div>

        {explanation.translation && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Translation</p>
            <p className="text-sm text-slate-700 italic">{explanation.translation}</p>
          </div>
        )}

        {wordEntries.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Vocabulary</p>
            <div className="space-y-2">
              {wordEntries.map(([form, entry]) => (
                <div
                  key={form}
                  className={`p-2 rounded-lg border transition-colors ${
                    form === activeWord
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-slate-50 border-transparent'
                  }`}
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{form}</span>
                    {entry.reading && (
                      <span className="text-xs text-slate-500">{entry.reading}</span>
                    )}
                    {entry.pos && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-1 rounded">{entry.pos}</span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                      {entry.source === 'ai' ? '✨ AI' : entry.source === 'jmdict' ? 'JMdict' : 'basic'}
                    </span>
                  </div>
                  {entry.meaning && (
                    <p className="text-sm text-slate-700 mt-0.5">{entry.meaning}</p>
                  )}
                  {entry.usage_in_context && (
                    <p className="text-xs text-slate-500 mt-0.5 italic">{entry.usage_in_context}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {explanation.grammar_points.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Grammar Points</p>
            <div className="space-y-2">
              {explanation.grammar_points.map((gp, i) => (
                <div key={i} className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm font-semibold text-purple-900">{gp.pattern}</p>
                  <p className="text-xs text-slate-700 mt-0.5">{gp.explanation}</p>
                  {gp.example && (
                    <p className="text-xs text-slate-500 mt-0.5 italic">{gp.example}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {explanation.reading_tips && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Reading Tips</p>
            <p className="text-sm text-slate-700">{explanation.reading_tips}</p>
          </div>
        )}
      </div>
    </div>
  );
}
