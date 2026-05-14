import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { JoinPage } from './pages/JoinPage';
import { ScriptView } from './pages/ScriptView';
import { OperatorPage } from './pages/OperatorPage';
import { QRPage } from './pages/QRPage';
import { ScriptsPage } from './pages/ScriptsPage';
import { ScriptEditorPage } from './pages/ScriptEditorPage';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './components/RequireAuth';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RequireAuth><OperatorPage /></RequireAuth>} />
        <Route path="/scripts" element={<RequireAuth><ScriptsPage /></RequireAuth>} />
        <Route path="/scripts/:id" element={<RequireAuth><ScriptEditorPage /></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/script/:code" element={<ScriptView />} />
        <Route path="/qr/:code" element={<QRPage />} />
        <Route path="*" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
