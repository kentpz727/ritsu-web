import { lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { ToastProvider } from './components/Toast.tsx';

// P-07: every route is its own chunk, so the first paint does not ship the OCR
// path, charts, or the box editor. Import/Debug only download their OCR code
// when opened.
const ScoresPage = lazy(() => import('./pages/ScoresPage.tsx'));
const DataPage = lazy(() => import('./pages/DataPage.tsx'));
const ChartDetailsPage = lazy(() => import('./pages/ChartDetailsPage.tsx'));
const GameDetailsPage = lazy(() => import('./pages/GameDetailsPage.tsx'));
const ConfigsPage = lazy(() => import('./pages/ConfigsPage.tsx'));
const BoxEditorPage = lazy(() => import('./pages/BoxEditorPage.tsx'));
const ImportPage = lazy(() => import('./pages/ImportPage.tsx'));
const DebugPage = lazy(() => import('./pages/DebugPage.tsx'));

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ScoresPage />} />
            <Route path="data" element={<DataPage />} />
            <Route path="chart/:configId/:song/:diff/:val" element={<ChartDetailsPage />} />
            <Route path="game/:configId" element={<GameDetailsPage />} />
            <Route path="configs" element={<ConfigsPage />} />
            <Route path="editor/:configId?" element={<BoxEditorPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="debug" element={<DebugPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
