/**
 * Candidatura de motorista — etapa 1 de 2 (`docs/decisoes-do-dono.md` →
 * "DECISÃO: duas etapas", 19/11/2026). Campos: nome, telefone, e-mail,
 * cidade, UF (obrigatórios) + já dirige por aplicativo / tem veículo
 * próprio (opcionais). Nada de endereço, CEP ou documento — isso é a etapa
 * 2, só depois da aprovação.
 *
 * Tom: é CANDIDATURA, não inscrição automática — o dono avalia cada uma.
 * Ver `docs/conteudo-site.md` §10 (glossário): "quem dirige"/"motorista",
 * nunca "parceiro"; nada de "garantimos".
 */
export const DRIVER_APPLICATION_CONTENT = {
  eyebrow: 'Candidatura para motoristas',
  title: 'Candidate-se para dirigir',
  description:
    'Etapa 1 de 2. Avaliamos cada candidatura antes de confirmar a vaga. Se a sua for aprovada, pedimos endereço e documentos na etapa 2 — não agora.',
  fields: {
    name: { label: 'Nome completo', placeholder: 'Seu nome e sobrenome' },
    phone: { label: 'Telefone (WhatsApp)', placeholder: '(84) 9XXXX-XXXX' },
    email: { label: 'E-mail', placeholder: 'voce@exemplo.com' },
    city: { label: 'Cidade onde dirige', placeholder: 'Ex.: Natal, Parnamirim…' },
    state: { label: 'UF' },
  },
  eligibility: {
    alreadyDrivesForApp: { legend: 'Já dirige por aplicativo? (opcional)' },
    hasOwnVehicle: { legend: 'Tem veículo próprio? (opcional)' },
    yes: 'Sim',
    no: 'Não',
  },
  submitLabel: 'Enviar candidatura',
  submitLoadingLabel: 'Enviando candidatura…',
  successTitle: 'Candidatura recebida.',
  successMessage:
    'Vamos avaliar e avisar pelo e-mail ou pelo WhatsApp que você informou. Se for aprovada, a etapa 2 pede endereço e documentos.',
  errors: {
    invalidName: 'Digite seu nome completo.',
    invalidPhone: 'Digite um telefone com DDD, só números.',
    invalidEmail: 'Digite um e-mail válido.',
    invalidCity: 'Digite a cidade onde você dirige.',
    invalidState: 'Selecione o estado (UF).',
    rateLimited: 'Muitas tentativas. Tente novamente em alguns minutos.',
    unavailable: 'Não foi possível agora. Tente novamente em alguns instantes.',
    generic: 'Algo deu errado. Tente novamente — o que você digitou continua aqui.',
  },
  /** Aviso de privacidade mínimo (LGPD), citando os campos de verdade —
   * pedido do dono em 19/11/2026 ao ampliar o formulário além do e-mail. */
  privacyNotice:
    'Usamos nome, telefone, e-mail, cidade e UF só para avaliar sua candidatura e avisar o resultado. Se você responder sobre já dirigir por aplicativo ou ter veículo próprio, usamos isso só para a mesma avaliação. Controlado por Innovare Code (CNPJ 09.813.446/0001-00). Não vendemos nem repassamos seus dados a ninguém. Para remover seus dados, escreva para contato@vuumbora.com.br.',
  notConfiguredNotice: 'Ainda não estamos recebendo candidaturas aqui — volte em breve.',
} as const;

/** Compromisso público já aprovado pelo dono (`docs/decisoes-do-dono.md`,
 * 18/11/2026) — reaparece logo abaixo da candidatura, como reforço de que
 * a avaliação tem regra escrita, não é arbitrária. */
export const DRIVER_COMMITMENT = {
  label: 'Compromisso público',
  text: 'As regras de taxa da plataforma e de repasse ao motorista serão publicadas antes de o cadastro de motoristas ser aberto.',
};

/** As 27 unidades federativas, sigla + nome — `<select>`, nunca texto
 * livre (pedido do dono: "UF como seleção e não texto livre"). RN vem
 * pré-selecionado porque é a região de lançamento. */
export const BRAZIL_STATES: ReadonlyArray<{ readonly uf: string; readonly name: string }> = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
];

export const DEFAULT_STATE = 'RN';
