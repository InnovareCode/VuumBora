/**
 * `docs/conteudo-site.md` §7 "Versão B" (libera quando houver canal de lista
 * de espera) + aviso de privacidade exigido pela LGPD (`docs/decisoes-do-dono.md`
 * → "Lista de espera: aprovada em 18/11/2026, com condições", resolvida em
 * 19/11/2026: controlador Innovare Code/CNPJ e canal de exclusão
 * contato@vuumbora.com.br).
 *
 * Um único formulário atende os dois públicos (campo "perfil" é opcional no
 * contrato — `packages/api-client/src/waitlist`): o rótulo do botão e o
 * texto de apoio trocam conforme a pessoa escolhe "passageiro" ou
 * "motorista", usando as frases exatas do Apolo para cada caso. Sem
 * nenhuma seleção, mostra uma versão neutra (não prevista no documento,
 * porque ele assumia dois botões separados — aqui é um só formulário).
 */
export const WAITLIST_CONTENT = {
  emailLabel: 'Seu e-mail',
  emailPlaceholder: 'voce@exemplo.com',
  profileLabel: 'Você é…',
  profileOptions: [
    { value: 'passenger' as const, label: 'Passageiro' },
    { value: 'driver' as const, label: 'Motorista' },
  ],
  submitLabel: {
    none: 'Entrar na lista de espera',
    passenger: 'Quero saber quando lançar',
    driver: 'Quero ser avisado quando abrir o cadastro',
  },
  supportText: {
    none: 'Avisamos só quando tiver novidade real. Nada além disso.',
    passenger: 'Avisamos uma vez, quando o app estiver nas lojas da sua cidade. Nada além disso.',
    driver: 'Você recebe as regras de taxa e repasse assim que forem publicadas, antes de qualquer cadastro.',
  },
  submitLoadingLabel: 'Enviando…',
  successTitle: 'Pronto, você está na lista.',
  successMessage: 'Vamos avisar neste e-mail quando tiver novidade real.',
  errors: {
    invalidEmail: 'Digite um e-mail válido.',
    rateLimited: 'Muitas tentativas. Tente novamente em alguns minutos.',
    unavailable: 'Não foi possível agora. Tente novamente em alguns instantes.',
    generic: 'Algo deu errado. Tente novamente.',
  },
  /** Aviso de privacidade mínimo (LGPD): finalidade, controlador, "não
   * vende/repassa" e canal de exclusão — nas quatro frases exigidas pelo
   * dono, nenhuma a mais. */
  privacyNotice:
    'Usamos seu e-mail só para avisar quando o app lançar. Controlado por Innovare Code (CNPJ 09.813.446/0001-00). Não vendemos nem repassamos seu e-mail para ninguém. Para remover seu e-mail da lista, escreva para contato@vuumbora.com.br.',
  /** Mostrado no lugar do formulário quando a variável de ambiente do
   * backend não está configurada — honesto em vez de simular um envio que
   * não vai a lugar nenhum (ver `src/lib/waitlist-client.ts`). */
  notConfiguredNotice: 'Ainda não está pronto para receber inscrições aqui — volte em breve.',
} as const;
