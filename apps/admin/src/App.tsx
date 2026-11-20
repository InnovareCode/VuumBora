import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DriverApplicationsListPage } from './pages/DriverApplicationsListPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoadingState } from './components/RequestState';

// Detalhe é a tela mais pesada (grade de campos + botão de copiar) e não é a
// primeira coisa que o admin vê — lazy load por rota.
const DriverApplicationDetailPage = lazy(() =>
  import('./pages/DriverApplicationDetailPage').then((m) => ({ default: m.DriverApplicationDetailPage })),
);

/**
 * Rota de layout: decide entre checando/deslogado/logado e, só quando
 * logado, monta `<AppShell/>` (que renderiza `<Outlet/>`). Por ser uma rota
 * de layout (e não um wrapper repetido por página), a casca monta UMA vez
 * por sessão autenticada — o estado do menu e o resumo de pendências não
 * resetam a cada troca de tela.
 */
function RequireAuth() {
  const { status } = useAuth();
  if (status === 'checking') return <LoadingState label="Verificando sessão…" />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <AppShell />;
}

export function App() {
  const { status } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={status === 'signedIn' ? <Navigate to="/driver-applications" replace /> : <LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/driver-applications" element={<DriverApplicationsListPage />} />
        <Route
          path="/driver-applications/:id"
          element={
            <Suspense fallback={<LoadingState label="Carregando…" />}>
              <DriverApplicationDetailPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/driver-applications" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
