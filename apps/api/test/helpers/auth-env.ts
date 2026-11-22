/** Importar ANTES de `setup.ts`: segredos e custos da identidade dos apps, só para teste. */
process.env['AUTH_PEPPER'] = 'pepper-de-teste-0123456789-0123456789-abcdef';
process.env['AUTH_JWT_SECRET'] = 'jwt-de-teste-0123456789-0123456789-abcdefghi';
process.env['AUTH_BCRYPT_COST'] = '4';
process.env['AUTH_IP_RATE_LIMIT_MAX'] = '1000';
// Teto global de e-mails por hora: alto de propósito (os testes cadastram dezenas de contas); os testes do
// teto (identity-hardening.test.ts) fixam um valor baixo ANTES de montar o app.
process.env['AUTH_EMAIL_GLOBAL_MAX_PER_HOUR'] = '100000';
// Onde os textos legais são servidos (só de teste; a API apenas monta o endereço, nada é baixado). A VERSÃO vigente não
// é configuração: vem do catálogo do banco (helpers/legal-kit.ts publica a versão baseline).
process.env['LEGAL_DOCUMENTS_BASE_URL'] = 'https://textos.teste.vuumbora.dev/legal';
