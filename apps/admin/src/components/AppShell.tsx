import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, Search, Shield, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../context/ApiContext';
import { useDriverApplicationsSummary } from '../hooks/useDriverApplicationsSummary';
import { DemoModeBanner } from './DemoModeBanner';
import { NavGroupCollapsible } from './nav/NavGroupCollapsible';
import { NavLink } from './nav/NavLink';
import { CommandPalette } from './nav/CommandPalette';
import { ADMIN_NAV, matchAdminNavItem, type AdminBadgeKey } from '../nav/adminNav';
import { useCollapsibleNavGroups } from '../nav/useCollapsibleNavGroups';
import { useFocusTrap } from '../nav/useFocusTrap';
import { filterNavForRole, isItemVisibleForRole, type NavItem } from '../nav/types';
import { NoAccessPage } from '../pages/NoAccessPage';

const NAV_COLLAPSE_STORAGE_KEY = 'vuumbora-admin-nav-collapsed';

function isActiveItem(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href || pathname === `${item.href}/` : pathname.startsWith(item.href);
}

/**
 * Casca do painel administrativo: sidebar escura (desktop) com grupos
 * recolhíveis, gaveta no celular, paleta de comandos (Ctrl+K) e cabeçalho de
 * área. Padrão portado do painel do ModaShop (ver docs do time) — paleta e
 * tipografia são as do VuumBora (navy/yellow, Plus Jakarta Sans), não teal.
 *
 * Renderiza `<Outlet/>`: é o elemento de uma rota de layout (ver App.tsx),
 * monta UMA vez por sessão autenticada — não a cada navegação — para o
 * estado do menu (grupos recolhidos, resumo de pendências) não resetar a
 * cada troca de tela.
 */
export function AppShell() {
  const { admin, logout } = useAuth();
  const api = useApi();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(drawerRef, drawerOpen, () => setDrawerOpen(false));

  // `current` casa com o mapa COMPLETO (não filtrado) — é como sabemos que a
  // pessoa chegou numa área que existe, mas que o próprio papel não abre
  // (ex. digitou a URL direto), para mostrar `NoAccessPage` em vez do
  // `<Outlet/>`. Esconder o item do menu não é a proteção real: o backend já
  // devolve 403 por papel (`requireAdminRole`); isto só evita a pessoa clicar
  // em algo e achar que quebrou algo.
  const current = matchAdminNavItem(location.pathname);
  const deniedItem = current && !isItemVisibleForRole(current, admin?.role) ? current : undefined;

  // O que sidebar, gaveta e paleta de comandos de fato OFERECEM — grupo que
  // fica vazio depois do filtro nem aparece (ver `filterNavForRole`).
  const visibleNav = useMemo(() => filterNavForRole(ADMIN_NAV, admin?.role), [admin?.role]);

  // Contador de pendência ao lado do item do menu — vem da mesma API que a
  // lista usa (resposta real em modo http, dado fictício em modo mock),
  // nunca fixo no código.
  const summary = useDriverApplicationsSummary();
  const badges: Partial<Record<AdminBadgeKey, number>> = {
    pendingDriverApplications: summary?.pending ?? 0,
  };

  // Ctrl+K / Cmd+K abre a paleta de qualquer tela do painel.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Grupo da rota atual: nunca recolhe (ver useCollapsibleNavGroups). Uma
  // única instância serve sidebar e gaveta — recolher num reflete no outro.
  const activeGroupTitle = visibleNav.find((group) => group.items.some((item) => isActiveItem(item, location.pathname)))?.title;
  const groupsState = useCollapsibleNavGroups(NAV_COLLAPSE_STORAGE_KEY, activeGroupTitle);

  function renderNavGroups(variant: 'sidebar' | 'drawer') {
    return visibleNav.map((group) => (
      <NavGroupCollapsible
        key={group.title}
        title={group.title}
        open={groupsState.isOpen(group.title)}
        locked={groupsState.isLocked(group.title)}
        onToggle={() => groupsState.toggle(group.title)}
        surface={variant === 'sidebar' ? 'dark' : 'light'}
      >
        {group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActiveItem(item, location.pathname)}
            badge={item.badge ? badges[item.badge as AdminBadgeKey] : undefined}
            variant={variant}
            onNavigate={variant === 'drawer' ? () => setDrawerOpen(false) : undefined}
          />
        ))}
      </NavGroupCollapsible>
    ));
  }

  return (
    <div className="flex min-h-screen flex-col bg-screen">
      {api.mode === 'mock' ? <DemoModeBanner /> : null}

      <div className="flex flex-1">
        {/* ── Sidebar desktop ────────────────────────────────────────── */}
        <aside className="sticky top-0 hidden max-h-screen w-[272px] shrink-0 flex-col overflow-y-auto bg-navy lg:flex">
          <div className="flex h-20 shrink-0 items-center gap-2 border-b border-white/10 px-6">
            <span className="text-xl" aria-hidden="true">
              ●
            </span>
            <span className="text-subtitle font-bold text-white">VuumBora Admin</span>
          </div>

          <div className="px-6 py-5">
            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white ring-1 ring-white/20">
              <Shield className="h-3 w-3" aria-hidden="true" />
              Administração
            </span>
          </div>

          <nav className="flex-1 px-4 pb-4" aria-label="Navegação do painel administrativo">
            {renderNavGroups('sidebar')}
          </nav>

          <div className="shrink-0 border-t border-white/10 p-4">
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-small font-black text-white"
                aria-hidden="true"
              >
                {(admin?.name ?? 'A').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-bold text-white">{admin?.name}</p>
                <p className="truncate text-[11px] text-white/50">{admin?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/60 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-info"
                aria-label="Sair do painel"
                title="Sair"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Conteúdo ───────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-screen/90 px-4 backdrop-blur-sm sm:px-6 lg:h-20 lg:px-8">
            <span className="text-xl lg:hidden" aria-hidden="true">
              ●
            </span>

            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Painel administrativo</p>
              <h2 className="truncate text-title font-black tracking-tight text-text">
                {deniedItem ? 'Acesso restrito' : current?.label ?? 'Administração'}
              </h2>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2 lg:flex-none">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-2 text-caption font-semibold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
                aria-label="Buscar área do painel"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Buscar</span>
                <kbd className="hidden rounded bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-muted md:inline">
                  Ctrl K
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-info lg:hidden"
                aria-label="Abrir menu"
                aria-expanded={drawerOpen}
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">{deniedItem ? <NoAccessPage item={deniedItem} role={admin?.role} /> : <Outlet />}</main>
        </div>
      </div>

      {/* ── Gaveta mobile ────────────────────────────────────────────────
          Depois de `header`+`main` no JSX (não antes) de propósito: o botão
          "Abrir menu" mora dentro do `header`, então ele vem ANTES disto na
          ordem do documento — sem essa ordem, dar Tab depois de abrir a
          gaveta ia primeiro para os controles da página de fundo, que o
          backdrop só cobre visualmente (achado da Íris, 20/11/2026). A
          posição em si não muda nada visual (`fixed`). */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="absolute inset-y-0 right-0 flex w-[280px] flex-col bg-surface shadow-2xl"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
              <span className="text-[10px] font-black uppercase tracking-widest text-text">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-info"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4" aria-label="Navegação do painel administrativo">
              {renderNavGroups('drawer')}
            </nav>
            <div className="shrink-0 border-t border-border p-4">
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-elevated px-4 py-3 text-small font-bold text-text-secondary outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-info"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sair do painel
              </button>
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <CommandPalette groups={visibleNav} label="Buscar área do painel administrativo" onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  );
}
