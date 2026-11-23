import { Linking } from 'react-native';

/**
 * Canais de ajuda (P14, `docs/fichas-de-tela/P14-ajuda-e-seguranca.md`) — decisão do dono nesta
 * missão: WhatsApp (84) 3113-2584, o mesmo número do site. `Linking.openURL` já tem
 * implementação real no `react-native-web` (abre o WhatsApp Web/nova guia) — diferente de
 * `MapView`/câmera, não precisa de uma porta própria com adaptador nativo×web.
 */
export const WHATSAPP_DIGITS = '558431132584';
export const WHATSAPP_DISPLAY = '(84) 3113-2584';
export const SUPPORT_EMAIL = 'contato@vuumbora.com.br';
export const EMERGENCY_PHONE = '190';

/**
 * Texto pré-preenchido do WhatsApp (ficha §2): NUNCA nome, endereço nem telefone — só o que
 * identifica a corrida de forma genérica. Sem código público de corrida no contrato ainda (ficha
 * §10), por isso usa a data em vez do código quando há uma corrida de referência.
 */
export function buildHelpMessage(tripDateLabel?: string): string {
  return tripDateLabel ? `Olá! Preciso de ajuda com a corrida de ${tripDateLabel}.` : 'Olá! Preciso de ajuda com o app VuumBora.';
}

function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent(message)}`;
}

/** `true`: abriu (ou tentou abrir) o canal. `false`: falhou — quem chama mostra o retorno manual. */
export async function openWhatsApp(message: string): Promise<boolean> {
  try {
    await Linking.openURL(buildWhatsAppUrl(message));
    return true;
  } catch {
    return false;
  }
}

export async function openSupportEmail(): Promise<boolean> {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    return true;
  } catch {
    return false;
  }
}

export async function openEmergencyDialer(): Promise<boolean> {
  try {
    await Linking.openURL(`tel:${EMERGENCY_PHONE}`);
    return true;
  } catch {
    return false;
  }
}
