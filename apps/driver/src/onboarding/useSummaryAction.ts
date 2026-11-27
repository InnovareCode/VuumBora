import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { openWhatsAppSupport } from '../support/openSupportChannel';
import { useSession } from '../session/SessionProvider';
import { refreshOnboarding } from './onboardingStore';
import type { SummaryTarget } from './verificationModel';

/** Mensagem pronta do suporte sobre o cadastro (sem dado pessoal: quem atende pergunta o que precisar). */
const SUPPORT_MESSAGE = 'Olá! Sou motorista e preciso de ajuda com o meu cadastro de motorista no app VuumBora.';

/**
 * Traduz o destino de um cartão do cadastro (`SummaryTarget`, do modelo puro) em ação: navegação, suporte, nova
 * leitura ou sair. "Falar com o suporte" tenta o WhatsApp; sem WhatsApp (ou no navegador sem o app), cai na tela de
 * suporte (M14), que mostra os canais — nunca um toque sem resposta.
 */
export function useSummaryAction(): { readonly run: (target: SummaryTarget) => void; readonly busy: boolean } {
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    (target: SummaryTarget) => {
      switch (target.to) {
        case 'checklist':
          router.push('/cadastro');
          return;
        case 'analysis':
          router.push('/cadastro/analise');
          return;
        case 'profile':
          router.push('/cadastro/dados');
          return;
        case 'vehicle':
          router.push('/cadastro/veiculo');
          return;
        case 'document':
          router.push({ pathname: '/cadastro/documento', params: { tipo: target.typeCode } });
          return;
        case 'home':
          router.replace('/');
          return;
        case 'retry':
          void refreshOnboarding();
          return;
        case 'sign_in':
          void signOut();
          return;
        case 'support':
          setBusy(true);
          void openWhatsAppSupport(SUPPORT_MESSAGE).then((result) => {
            setBusy(false);
            if (!result.ok) router.push('/suporte');
          });
          return;
      }
    },
    [signOut],
  );

  return { run, busy };
}
