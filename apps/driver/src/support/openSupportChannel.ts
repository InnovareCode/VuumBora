import { Linking } from 'react-native';

/**
 * Canal de suporte do motorista (M14) — decidido pelo dono: WhatsApp com atendimento por pessoas de
 * Natal, (84) 3113-2584 (`docs/plano-apps-execucao.md:253-254`, confirmado na onda 5). Porta LOCAL
 * deste app: a ficha pedia "uma porta só" (`openSupportChannel`) compartilhada com o passageiro
 * (P14), mas isso viraria mudança em `packages/ui` ou import cruzado entre apps — os dois fora da
 * zona desta fatia (`apps/driver/**` e `tools/qualidade-tela/screens.config.mjs`). Pendência
 * registrada para quem construir a P14: promover esta porta (ou escrever a dela) para `packages/ui`
 * quando os dois apps precisarem da mesma coisa de verdade.
 */
const WHATSAPP_DIGITS = '5584931132584';

export type SupportChannelResult = { readonly ok: true } | { readonly ok: false };

async function openExternal(url: string): Promise<SupportChannelResult> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return { ok: false };
    await Linking.openURL(url);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Abre o WhatsApp com uma mensagem PRONTA (nunca dado do passageiro — PP-14/LGPD): código público da
 * corrida e data, quando houver; senão o texto genérico. `ok:false` cobre tanto "WhatsApp não
 * instalado" (nativo) quanto qualquer falha ao abrir (web sem o app, `canOpenURL` sem suporte
 * confiável no navegador — não verificado em aparelho).
 */
export function openWhatsAppSupport(message: string): Promise<SupportChannelResult> {
  const url = `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent(message)}`;
  return openExternal(url);
}

/** "Ligar 190" (PP-11): discagem real, sem nenhum aviso de que a VuumBora é avisada. */
export function openEmergencyCall(): Promise<SupportChannelResult> {
  return openExternal('tel:190');
}

export function buildSupportMessage(trip?: { readonly code: string; readonly dateLabel: string }): string {
  if (!trip) return 'Olá! Sou motorista e preciso de ajuda com o app VuumBora.';
  return `Olá! Sou motorista e preciso de ajuda com a corrida ${trip.code} de ${trip.dateLabel}.`;
}
