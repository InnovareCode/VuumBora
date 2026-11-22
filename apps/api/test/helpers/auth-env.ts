/** Importar ANTES de `setup.ts`: segredos e custos da identidade dos apps, só para teste. */
process.env['AUTH_PEPPER'] = 'pepper-de-teste-0123456789-0123456789-abcdef';
process.env['AUTH_JWT_SECRET'] = 'jwt-de-teste-0123456789-0123456789-abcdefghi';
process.env['AUTH_BCRYPT_COST'] = '4';
// Fila da pista do bcrypt GRANDE nos testes (64, acima do maior disparo simultâneo da suíte, que é 16): desde o A-1 a pista recusa o
// excedente com 503 `server_busy` e, desde a rodada 3b, o lugar é tomado ANTES do banco, então a capacidade limita as requisições
// de identidade em voo. O padrão (tamanho = CPUs - 1, no máximo 2, mais 8 de fila = 9 ou 10 lugares) varia com a máquina e um teste
// de corrida com 12 ou 16 requisições simultâneas, que confere contagens exatas, passaria a receber 503 só por causa disso (caiu no
// CI e em 2 de 20 execuções com 2 CPUs). Os testes da própria pista (bcrypt-ceiling, bcrypt-pool) fixam a pista pequena que provam.
process.env['AUTH_BCRYPT_QUEUE_MAX'] = '64';
process.env['AUTH_IP_RATE_LIMIT_MAX'] = '1000';
// Tetos por /48 também altos: a suíte não os exercita fora de ip-rate-limits.test.ts, que fixa os valores baixos que prova.
process.env['AUTH_IP_RATE_LIMIT_BLOCK_MAX'] = '100000';
process.env['AUTH_SESSION_BLOCK_RATE_LIMIT_MAX'] = '100000';
// Teto global de e-mails por hora: alto de propósito (os testes cadastram dezenas de contas); os testes do
// teto (identity-hardening.test.ts) fixam um valor baixo ANTES de montar o app.
process.env['AUTH_EMAIL_GLOBAL_MAX_PER_HOUR'] = '100000';
// Onde os textos legais são servidos (só de teste; a API apenas monta o endereço, nada é baixado). A VERSÃO vigente não
// é configuração: vem do catálogo do banco (helpers/legal-kit.ts publica a versão baseline).
process.env['LEGAL_DOCUMENTS_BASE_URL'] = 'https://textos.teste.vuumbora.dev/legal';
