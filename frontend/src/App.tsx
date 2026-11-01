import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './context/AuthContext';
import type { Role } from './lib/types';
import { ArticlePage } from './pages/ArticlePage';
import { DashboardPage } from './pages/DashboardPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { LoginPage } from './pages/LoginPage';
import { NewTicketPage } from './pages/NewTicketPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { TicketsPage } from './pages/TicketsPage';
import { UsersPage } from './pages/UsersPage';

/** Protege rutas: exige sesión y, opcionalmente, uno de los roles indicados. */
function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Verificando sesión…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/tickets" replace />;
  return <>{children}</>;
}

/** El usuario final no tiene dashboard de métricas: su inicio es "Mis tickets". */
function Home() {
  const { user } = useAuth();
  return user?.role === 'usuario' ? <Navigate to="/tickets" replace /> : <DashboardPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/nuevo" element={<NewTicketPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="kb" element={<KnowledgeBasePage />} />
        <Route path="kb/nuevo" element={<RequireAuth roles={['admin', 'tecnico']}><ArticlePage /></RequireAuth>} />
        <Route path="kb/:id" element={<ArticlePage />} />
        <Route path="usuarios" element={<RequireAuth roles={['admin']}><UsersPage /></RequireAuth>} />
        <Route path="configuracion" element={<RequireAuth roles={['admin']}><SettingsPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
