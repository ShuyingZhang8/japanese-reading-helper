import type { SentenceExplanationResponse } from './sentenceApi';
import type { QuizQuestion, OptionId } from './quizApi';
import type { TokenInfo } from './tokenizer';

export interface ReportData {
  jlptLevel: string;
  date: string;
  tokens: TokenInfo[];
  unknownWords: { word: string; reading: string; part_of_speech: string; meaning: string }[];
  sentenceAnalyses: SentenceExplanationResponse[];
  quizQuestions: QuizQuestion[] | null;
  quizAnswers: Record<number, OptionId>;
}

/**
 * Generate a PDF report in a Web Worker (off the main thread) and trigger
 * a browser download. The main thread stays responsive throughout.
 */
export function downloadReport(data: ReportData): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/pdfWorker.tsx', import.meta.url),
      { type: 'module' },
    );

    // Safety valve: if the worker hangs (e.g. module init crash that doesn't fire onerror),
    // reject after 60 s so the loading state always clears.
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('PDF worker timed out after 60 s'));
    }, 60_000);

    const cleanup = () => { clearTimeout(timeout); worker.terminate(); };

    worker.onmessage = (e: MessageEvent<{ ok: true; buffer: ArrayBuffer } | { ok: false; error: string }>) => {
      cleanup();
      if (!e.data.ok) {
        reject(new Error(e.data.error));
        return;
      }
      const blob = new Blob([e.data.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reading-report-${data.date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    };

    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || 'PDF worker error'));
    };

    worker.postMessage(data);
  });
}
