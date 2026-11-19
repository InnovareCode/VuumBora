/**
 * Redes sociais do rodapé. Endereços confirmados pelo dono em 19/11/2026
 * (WhatsApp Business em número fixo de Natal — não é erro, não acrescentar
 * o "9" de celular, o link quebraria). `href` vazio = o ícone correspondente
 * não renderiza (ver `Footer.tsx`) — nunca aponta para lugar nenhum.
 */
export const SOCIAL_LINKS = {
  whatsapp: {
    href: 'https://wa.me/558431132584',
    label: '(84) 3113-2584',
    ariaLabel: 'WhatsApp da VuumBora',
  },
  instagram: {
    href: 'https://instagram.com/vuumbora.oficial',
    label: '@vuumbora.oficial',
    ariaLabel: 'Instagram da VuumBora',
  },
} as const;
