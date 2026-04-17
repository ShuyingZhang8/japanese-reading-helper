import { useState } from 'react';
import SetupPage from './pages/SetupPage';
import PreAnalysisPage from './pages/PreAnalysisPage';
import ReadingPage from './pages/ReadingPage';

export type PageType = 'setup' | 'pre-analysis' | 'reading';

export interface AppState {
  jlptLevel: string;
  articleContent: string;
  tokenizedData: any;
  unknownWords: any[];
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('setup');
  const [appState, setAppState] = useState<AppState>({
    jlptLevel: 'N3',
    articleContent: '',
    tokenizedData: null,
    unknownWords: [],
  });

  const updateAppState = (updates: Partial<AppState>) => {
    setAppState(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {currentPage === 'setup' && (
        <SetupPage
          onNext={(jlptLevel, articleContent) => {
            updateAppState({ jlptLevel, articleContent });
            setCurrentPage('pre-analysis');
          }}
        />
      )}

      {currentPage === 'pre-analysis' && (
        <PreAnalysisPage
          jlptLevel={appState.jlptLevel}
          articleContent={appState.articleContent}
          onBack={() => setCurrentPage('setup')}
          onStart={(tokenizedData, unknownWords) => {
            updateAppState({ tokenizedData, unknownWords });
            setCurrentPage('reading');
          }}
          unknownWords={appState.unknownWords}
        />
      )}

      {currentPage === 'reading' && (
        <ReadingPage
          articleContent={appState.articleContent}
          tokenizedData={appState.tokenizedData}
          unknownWords={appState.unknownWords}
          jlptLevel={appState.jlptLevel}
          onBack={() => setCurrentPage('pre-analysis')}
          onNewArticle={() => setCurrentPage('setup')}
        />
      )}
    </div>
  );
}

export default App;
