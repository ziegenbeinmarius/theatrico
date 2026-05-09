import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { JoinPage } from './pages/JoinPage';
import { ScriptView } from './pages/ScriptView';
import { OperatorPage } from './pages/OperatorPage';
import { QRPage } from './pages/QRPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OperatorPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/script/:code" element={<ScriptView />} />
        <Route path="/qr/:code" element={<QRPage />} />
        <Route path="*" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
