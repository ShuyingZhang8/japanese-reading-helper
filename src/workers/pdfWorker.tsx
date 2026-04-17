/**
 * PDF generation Web Worker — runs @react-pdf/renderer off the main thread.
 *
 * WHY dynamic import:
 * Static ES module imports are evaluated BEFORE any module-level code runs,
 * so a top-level polyfill like `globalThis.window = globalThis` would be set
 * too late. Dynamic import() is a runtime call, so the polyfill executes first.
 */

// Polyfill window → must be set BEFORE react-pdf is imported
if (typeof window === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
}

import type { SentenceExplanationResponse } from '../services/sentenceApi';
import type { QuizQuestion, OptionId } from '../services/quizApi';
import type { TokenInfo } from '../services/tokenizer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportData {
  jlptLevel: string;
  date: string;
  tokens: TokenInfo[];
  unknownWords: { word: string; reading: string; part_of_speech: string; meaning: string }[];
  sentenceAnalyses: SentenceExplanationResponse[];
  quizQuestions: QuizQuestion[] | null;
  quizAnswers: Record<number, OptionId>;
}

// ── Font (fetched once, cached) ───────────────────────────────────────────────

let _fontDataUrl: string | null = null;

async function getFontDataUrl(): Promise<string> {
  if (_fontDataUrl) return _fontDataUrl;
  const r = await fetch('/fonts/NotoSansJP-Regular.woff');
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  _fontDataUrl = `data:font/woff;base64,${btoa(binary)}`;
  return _fontDataUrl;
}

// ── POS translation ───────────────────────────────────────────────────────────

const POS_JA_TO_EN: Record<string, string> = {
  '名詞': 'Noun', '動詞': 'Verb', '形容詞': 'Adj (i)', '形容動詞': 'Adj (na)',
  '副詞': 'Adverb', '代名詞': 'Pronoun', '接続詞': 'Conj', '感動詞': 'Interj',
  '助詞': 'Particle', '助動詞': 'Aux verb', '接頭辞': 'Prefix', '接尾辞': 'Suffix',
};
const posEn = (p: string) => POS_JA_TO_EN[p] ?? p;

// ── Worker message handler ────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<ReportData>) => {
  try {
    // Dynamic import runs AFTER the window polyfill above
    const { Document, Font, Page, StyleSheet, Text, View, pdf } =
      await import('@react-pdf/renderer');

    // Register font (idempotent)
    const fontDataUrl = await getFontDataUrl();
    Font.register({
      family: 'NotoSansJP',
      fonts: [
        { src: fontDataUrl, fontWeight: 400, fontStyle: 'normal' },
        { src: fontDataUrl, fontWeight: 400, fontStyle: 'italic' },
        { src: fontDataUrl, fontWeight: 700, fontStyle: 'normal' },
        { src: fontDataUrl, fontWeight: 700, fontStyle: 'italic' },
      ],
    });

    const JP = 'NotoSansJP';
    const S = StyleSheet.create({
      page:         { fontFamily: JP, fontSize: 10, padding: '2cm 2cm 2.5cm 2cm', color: '#1e293b', lineHeight: 1.6 },
      coverTitle:   { fontSize: 20, fontFamily: JP, color: '#1e3a8a', marginBottom: 6 },
      coverMeta:    { fontSize: 11, color: '#64748b', marginBottom: 4 },
      divider:      { borderBottom: '1px solid #e2e8f0', marginVertical: 12 },
      sectionTitle: { fontSize: 13, fontFamily: JP, color: '#1e3a8a', marginTop: 20, marginBottom: 8, borderBottom: '1px solid #bfdbfe', paddingBottom: 4 },
      articleWrap:  { flexDirection: 'row', flexWrap: 'wrap' },
      tokenNormal:  { fontFamily: JP, fontSize: 11, color: '#334155' },
      tokenUnknown: { fontFamily: JP, fontSize: 11, color: '#dc2626', fontWeight: 'bold' },
      tableHeader:  { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: '4px 6px', borderRadius: 3, marginBottom: 2 },
      tableRow:     { flexDirection: 'row', padding: '3px 6px', borderBottom: '0.5px solid #f1f5f9' },
      colWord:      { width: '18%', fontFamily: JP, fontSize: 10 },
      colReading:   { width: '18%', fontFamily: JP, fontSize: 9, color: '#64748b' },
      colPos:       { width: '14%', fontSize: 9, color: '#7c3aed' },
      colMeaning:   { width: '50%', fontSize: 9, color: '#475569' },
      headerText:   { fontSize: 9, color: '#64748b', fontWeight: 'bold' },
      sentBox:      { marginBottom: 12, padding: 8, backgroundColor: '#f8fafc', borderRadius: 4, border: '0.5px solid #e2e8f0' },
      sentJp:       { fontFamily: JP, fontSize: 11, color: '#1e293b', marginBottom: 3 },
      sentTrans:    { fontSize: 9, color: '#64748b', fontStyle: 'italic', marginBottom: 4 },
      wordRow:      { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 },
      wordForm:     { fontFamily: JP, fontSize: 10, color: '#1e40af', marginRight: 4 },
      wordReading:  { fontSize: 9, color: '#94a3b8', marginRight: 4 },
      wordPos:      { fontSize: 9, color: '#7c3aed', marginRight: 4 },
      wordMeaning:  { fontSize: 9, color: '#475569', marginRight: 8 },
      wordUsage:    { fontSize: 8, color: '#94a3b8', fontStyle: 'italic' },
      gramLabel:    { fontSize: 8, color: '#9333ea', fontWeight: 'bold', marginTop: 4, marginBottom: 1 },
      gramPattern:  { fontFamily: JP, fontSize: 10, color: '#581c87', marginBottom: 1 },
      gramExpl:     { fontSize: 9, color: '#475569' },
      qBox:         { marginBottom: 14, padding: 8, backgroundColor: '#f8fafc', borderRadius: 4, border: '0.5px solid #e2e8f0' },
      qType:        { fontSize: 8, color: '#7c3aed', marginBottom: 3, textTransform: 'uppercase' },
      qText:        { fontFamily: JP, fontSize: 11, color: '#1e293b', marginBottom: 6 },
      optRow:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
      optId:        { fontSize: 10, fontWeight: 'bold', width: 16, marginRight: 4 },
      optText:      { fontFamily: JP, fontSize: 10, flex: 1 },
      optCorrect:   { color: '#16a34a' },
      optWrong:     { color: '#dc2626' },
      optNeutral:   { color: '#64748b' },
      explLabel:    { fontSize: 8, color: '#64748b', marginTop: 5, marginBottom: 2 },
      explText:     { fontFamily: JP, fontSize: 9, color: '#475569' },
      sourceLabel:  { fontSize: 8, color: '#b45309', marginTop: 4, marginBottom: 1 },
      sourceText:   { fontFamily: JP, fontSize: 9, color: '#92400e' },
      pageNum:      { position: 'absolute', bottom: '1cm', right: '2cm', fontSize: 8, color: '#94a3b8' },
    });

    const data = e.data;

    // ── Document components (defined here so they close over S, Text, View, etc.) ──

    const unknownSet = new Set(data.unknownWords.map((w) => w.word));

    const doc = (
      <Document title={`Reading Report ${data.date}`} author="Japanese Reading Companion">
        <Page size="A4" style={S.page}>
          {/* Header */}
          <Text style={S.coverTitle}>Japanese Reading Companion</Text>
          <Text style={S.coverMeta}>JLPT Level: {data.jlptLevel}　　Date: {data.date}</Text>
          <View style={S.divider} />

          {/* Section 1: Article */}
          <Text style={S.sectionTitle}>Section 1 · Article</Text>
          <View style={S.articleWrap}>
            {data.tokens.map((t, i) => {
              const isUnknown = unknownSet.has(t.dictionary_form) || unknownSet.has(t.surface);
              return <Text key={i} style={isUnknown ? S.tokenUnknown : S.tokenNormal}>{t.surface}</Text>;
            })}
          </View>

          {/* Section 2: Unknown Vocabulary */}
          <Text style={S.sectionTitle}>Section 2 · Unknown Vocabulary ({data.unknownWords.length} words)</Text>
          <View style={S.tableHeader}>
            <Text style={[S.colWord, S.headerText]}>Word</Text>
            <Text style={[S.colReading, S.headerText]}>Reading</Text>
            <Text style={[S.colPos, S.headerText]}>POS</Text>
            <Text style={[S.colMeaning, S.headerText]}>Meaning</Text>
          </View>
          {data.unknownWords.map((w, i) => (
            <View key={i} style={S.tableRow}>
              <Text style={S.colWord}>{w.word}</Text>
              <Text style={S.colReading}>{w.reading}</Text>
              <Text style={S.colPos}>{posEn(w.part_of_speech)}</Text>
              <Text style={S.colMeaning}>{w.meaning}</Text>
            </View>
          ))}

          {/* Section 3: AI Analysis (only if user clicked sentences) */}
          {data.sentenceAnalyses.length > 0 && (
            <>
              <Text style={S.sectionTitle}>Section 3 · AI Vocabulary Analysis ({data.sentenceAnalyses.length} sentences)</Text>
              {data.sentenceAnalyses.map((analysis, i) => (
                <View key={i} style={S.sentBox} wrap={false}>
                  <Text style={S.sentJp}>{analysis.sentence}</Text>
                  {analysis.translation ? <Text style={S.sentTrans}>{analysis.translation}</Text> : null}
                  {Object.entries(analysis.words).map(([form, entry]) => (
                    <View key={form} style={{ marginBottom: 4 }}>
                      <View style={S.wordRow}>
                        <Text style={S.wordForm}>{form}</Text>
                        {entry.reading ? <Text style={S.wordReading}>{entry.reading}</Text> : null}
                        {entry.pos ? <Text style={S.wordPos}>[{entry.pos}]</Text> : null}
                        {entry.meaning ? <Text style={S.wordMeaning}>{entry.meaning}</Text> : null}
                      </View>
                      {entry.usage_in_context ? <Text style={S.wordUsage}>{entry.usage_in_context}</Text> : null}
                    </View>
                  ))}
                  {analysis.grammar_points.map((gp, j) => (
                    <View key={j}>
                      <Text style={S.gramLabel}>Grammar</Text>
                      <Text style={S.gramPattern}>{gp.pattern}</Text>
                      <Text style={S.gramExpl}>{gp.explanation}</Text>
                      {gp.example ? <Text style={S.gramExpl}>{gp.example}</Text> : null}
                    </View>
                  ))}
                  {analysis.reading_tips ? (
                    <View>
                      <Text style={S.gramLabel}>Reading Tips</Text>
                      <Text style={S.gramExpl}>{analysis.reading_tips}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          )}

          {/* Section 4: Quiz (only if user triggered Questions) */}
          {data.quizQuestions && data.quizQuestions.length > 0 && (
            <>
              <Text style={S.sectionTitle}>Section 4 · Comprehension Quiz</Text>
              {data.quizQuestions.map((q, qi) => {
                const chosen = data.quizAnswers[qi];
                const LABELS: Record<string, string> = { comprehension: 'Comprehension', vocabulary: 'Vocabulary', grammar: 'Grammar' };
                return (
                  <View key={qi} style={S.qBox} wrap={false}>
                    <Text style={S.qType}>{LABELS[q.type] ?? q.type}</Text>
                    <Text style={S.qText}>{q.question}</Text>
                    {q.options.map((opt) => {
                      const isCorrect = opt.id === q.correct_id;
                      const isChosen = opt.id === chosen;
                      const style = isCorrect ? S.optCorrect : (isChosen && !isCorrect) ? S.optWrong : S.optNeutral;
                      const prefix = isCorrect ? '✓ ' : (isChosen && !isCorrect) ? '✗ ' : '   ';
                      return (
                        <View key={opt.id} style={S.optRow}>
                          <Text style={[S.optId, style]}>{prefix}{opt.id}.</Text>
                          <Text style={[S.optText, style]}>{opt.text}</Text>
                        </View>
                      );
                    })}
                    <Text style={S.explLabel}>Explanation</Text>
                    <Text style={S.explText}>{q.explanation}</Text>
                    <Text style={S.sourceLabel}>Source Sentence</Text>
                    <Text style={S.sourceText}>{q.source_sentence}</Text>
                  </View>
                );
              })}
            </>
          )}

          <Text
            style={S.pageNum}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
        </Page>
      </Document>
    );

    const blob = await pdf(doc).toBlob();
    const buffer = await blob.arrayBuffer();
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (err) {
    console.error('[pdfWorker] generation failed:', err);
    self.postMessage({ ok: false, error: String(err) });
  }
};
