import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import ScoresPage from './pages/ScoresPage.tsx';
import DataPage from './pages/DataPage.tsx';
import ChartDetailsPage from './pages/ChartDetailsPage.tsx';
import GameDetailsPage from './pages/GameDetailsPage.tsx';
import ConfigsPage from './pages/ConfigsPage.tsx';
import BoxEditorPage from './pages/BoxEditorPage.tsx';
import ImportPage from './pages/ImportPage.tsx';
import DebugPage from './pages/DebugPage.tsx';

export default function App() {
  return (
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
  );
}
