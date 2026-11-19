/**
 * Lista de espera do passageiro — único público que ainda usa este
 * formulário simples (só e-mail). O motorista passou a ter o seu próprio
 * formulário, mais completo: `DriverApplicationForm`/`content/driverApplication.ts`
 * (`docs/decisoes-do-dono.md` → "Campos do pré-cadastro de motorista",
 * 19/11/2026). Perfil sempre `'passenger'` aqui — sem seletor, porque não há
 * mais um segundo público para este componente escolher.
 */
export const WAITLIST_CONTENT = {
  emailLabel: 'Seu e-mail',
  emailPlaceholder: 'voce@exemplo.com',
  submitLabel: 'Quero saber quando lançar',
  submitLoadingLabel: 'Enviando…',
  supportText: 'Avisamos uma vez, quando o app estiver disponível para passageiros na sua região. Nada além disso.',
  successTitle: 'Pronto, você está na lista.',
  successMessage: 'Vamos avisar neste e-mail quando tiver novidade real.',
  errors: {
    invalidEmail: 'Digite um e-mail válido.',
    rateLimited: 'Muitas tentativas. Tente novamente em alguns minutos.',
    unavailable: 'Não foi possível agora. Tente novamente em alguns instantes.',
    generic: 'Algo deu errado. Tente novamente.',
  },
  /** Aviso de privacidade mínimo (LGPD): finalidade, controlador, "não
   * vende/repassa" e canal de exclusão. */
  privacyNotice:
    'Usamos seu e-mail só para avisar quando o app lançar. Controlado por Innovare Code (CNPJ 09.813.446/0001-00). Não vendemos nem repassamos seu e-mail para ninguém. Para remover seu e-mail da lista, escreva para contato@vuumbora.com.br.',
  notConfiguredNotice: 'Ainda não está pronto para receber inscrições aqui — volte em breve.',
} as const;
