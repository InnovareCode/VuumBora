import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AdminRole } from '../api/types';
import type { NavItem } from '../nav/types';

/** Rótulo em português de cada papel — só para mensagem de tela, não é lógica de negócio. */
const ROLE_LABEL: Record<AdminRole, string> = {
  dono: 'Dono',
  operacao: 'Operação',
  revisor_documentos: 'Revisor de documentos',
  financeiro: 'Financeiro',
  suporte: 'Suporte',
};

/**
 * Tela mostrada quando o papel logado digita/acessa direto a URL de uma área
 * que seu papel não vê no menu. Não existe sem querer: quem protege de
 * verdade é o backend (403 de `requireAdminRole`) — isto é só não deixar a
 * pessoa achar que clicou errado ou ver um erro cru.
 */
export function NoAccessPage({ item, role }: { readonly item: NavItem; readonly role: AdminRole | null | undefined }) {
  const navigate = useNavigate();
  const roleLabel = role ? ROLE_LABEL[role] : 'desconhecido';

  return (
    <section role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xxl bg-danger/10 text-danger" aria-hidden="true">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="text-title font-black tracking-tight text-text">Você não tem acesso a esta área</h1>
      <p className="text-small font-medium text-text-secondary">
        "{item.label}" não está disponível para o papel atual, <strong className="font-bold text-text">{roleLabel}</strong>. Se
        acha que isto está errado, fale com o dono do painel.
      </p>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mt-2 rounded-pill bg-cta px-5 py-2.5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
      >
        Voltar
      </button>
    </section>
  );
}
