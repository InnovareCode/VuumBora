import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { ActivateAccountPage } from './pages/ActivateAccountPage';
import { DriverApplicationsListPage } from './pages/DriverApplicationsListPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoadingState } from './components/RequestState';
import { SessionUnavailable } from './components/SessionUnavailable';

// Detalhe é a tela mais pesada (grade de campos + botão de copiar) e não é a
// primeira coisa que o admin vê — lazy load por rota.
const DriverApplicationDetailPage = lazy(() =>
  import('./pages/DriverApplicationDetailPage').then((m) => ({ default: m.DriverApplicationDetailPage })),
);

const SecuritySettingsPage = lazy(() =>
  import('./pages/SecuritySettingsPage').then((m) => ({ default: m.SecuritySettingsPage })),
);

const EmailSettingsPage = lazy(() => import('./pages/EmailSettingsPage').then((m) => ({ default: m.EmailSettingsPage })));

// Gestão de usuários: só o papel `dono` abre, e não é a primeira tela de ninguém — lazy por rota.
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));

/**
 * Rota de layout: decide entre checando/deslogado/logado e, só quando
 * logado, monta `<AppShell/>` (que renderiza `<Outlet/>`). Por ser uma rota
 * de layout (e não um wrapper repetido por página), a casca monta UMA vez
 * por sessão autenticada — o estado do menu e o resumo de pendências não
 * resetam a cada troca de tela.
 */
function RequireAuth() {
  const { status, sessionProblem, retrySession } = useAuth();
  if (status === 'checking') return <LoadingState label="Verificando sessão…" />;
  // 429/rede/5xx em `GET /me` NÃO é "sessão caiu": não vai ao login, avisa e deixa tentar de novo.
  if (status === 'unavailable') return <SessionUnavailable problem={sessionProblem} onRetry={retrySession} />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <AppShell />;
}

export function App() {
  const { status, postLoginPath } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={status === 'signedIn' ? <Navigate to={postLoginPath ?? '/driver-applications'} replace /> : <LoginPage />} />
      {/* Pública, sem cookie (docs/contrato-admin-usuarios.md §6) — mas se a pessoa já está logada, não faz
          sentido oferecer "ativar conta" de novo; manda para a área de sempre, igual `/login` faz. */}
      <Route path="/activate" element={status === 'signedIn' ? <Navigate to="/" replace /> : <ActivateAccountPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/driver-applications" element={<DriverApplicationsListPage />} />
        <Route
          path="/users"
          element={
            <Suspense fallback={<LoadingState label="Carregando…" />}>
              <UsersPage />
            </Suspense>
          }
        />
        <Route
          path="/driver-applications/:id"
          element={
            <Suspense fallback={<LoadingState label="Carregando…" />}>
              <DriverApplicationDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/email"
          element={
            <Suspense fallback={<LoadingState label="Carregando…" />}>
              <EmailSettingsPage />
            </Suspense>
          }
        />
        <Route
          path="/security"
          element={
            <Suspense fallback={<LoadingState label="Carregando…" />}>
              <SecuritySettingsPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/driver-applications" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
