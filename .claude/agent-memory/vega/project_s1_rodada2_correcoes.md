---
name: project-s1-rodada2-correcoes
description: Correções da revisão S1 rodada 2 (I-1..I-7, I-6 atraso progressivo, idade 18+/aceite) em apps/api — decisões não óbvias, limites conhecidos e onde cada prova mora
metadata:
  type: project
---

Feito em 21/11/2026 (migrações 0017 e 0018 são minhas; a 0019 de idade/aceite é do Cronos). Contratos: `docs/contrato-admin-email.md`,
`docs/contrato-identidade-apps.md`, `docs/contrato-admin-2fa.md`. Relatório do Órion: `docs/revisao-seguranca-s1-rodada2.md`.

- **I-1** servidor+porta+usuário+senha = UMA origem, decidida pelo servidor (`resolveEffective` + `credentialOriginViolation` no envio). Remetente é à parte.
  Salvar sem host apaga a senha do painel junto (senão fica órfã). Prova: SMTP falso que não recebe `AUTH` com SMTP_PASS do ambiente.
- **I-2** `stepUp: {password, code}` (nome `stepUp` porque `password` já é a do SMTP) em salvar e remover senha; código TOTP, não recuperação.
  Step-up roda ANTES do DNS/gravação. Alerta = auditoria (`changedFields`, só nomes) + log `email_settings_changed`.
- **I-3** 0017 faz REVOKE do que a API não escreve; `test/runtime-role.test.ts` roda o APP COMO `vuumbora_api` (opção de conexão `-c role=`) e tem uma
  matriz tabela→privilégios (tabela nova sem linha reprova). Scripts de operador leem `MIGRATION_DATABASE_URL` (`scripts/lib/owner-db-url.mjs`).
- **I-4** recadastro SUBSTITUI a conta pendente (NÃO edita): função SECURITY DEFINER `reclaim_unverified_account` (0020) apaga a antiga (aceite cai em CASCATA — única exceção do gatilho de account_consents) e a API insere uma nova; aceite final = o do último cadastro. Por isso o id/publicId mudam e não há mais "too_soon" no recadastro (teto = 5 por e-mail canonical/h do cadastro). Laço de até 6 tentativas cobre corrida de substituições. Retenção purga não verificadas > 7 dias.
- **I-4b** `verify-email` exige `password` do cadastro; senha errada = código errado (gasta tentativa com hash "nunca-um-código", mesma resposta, sem oráculo). bcrypt roda sempre (dummy p/ conta inexistente). Ordem de risco coberta por teste de corrida + mutação.
- **I-5** e-mail canonical só na chave de limite; `ipBucket` (/64) no HMAC do IP e no `keyGenerator` do rate-limit (global + rota: DOIS lugares redundantes,
  mutar um só não derruba o teste); teto global em 2 baldes (verificação/redefinição) dentro da MESMA reserva atômica (`AttemptKey` com scope/janela próprios).
- **I-7** 0018: soma de `attempts` dos códigos `password_reset` das últimas 24 h, lida DEPOIS do `FOR UPDATE` (mutação "antes do lock" derruba o teste de corrida).
  Nova assinatura das funções = `DROP FUNCTION` das antigas antes (CREATE OR REPLACE criaria sobrecarga sem teto). `issue` também suprime o e-mail.
- **I-6** (decisão do dono) atraso progressivo por PAR 1 s,2 s,4 s… teto 900 s, memória 24 h; 429 recusado NÃO grava falha. Conta por par: 13 tentativas na 1ª hora,
  105 em 24 h (`lib/progressive-delay.ts`, testado). Sem teto global por conta → risco residual com botnet (aceito). Nome `account_locked` do admin mantido por compat.
  2FA: bloqueio de 15 min do CÓDIGO não mudou.
- **Idade/aceite**: `birthDate` 'AAAA-MM-DD' validada no servidor (fuso Natal, 29/02→01/03) + rede do banco mapeada (23514/23502 → 403 underage / 400 invalid);
  `termsAccepted/privacyAccepted` literais `true`; versões vêm de `AUTH_TERMS_VERSION`/`AUTH_PRIVACY_VERSION` SEM padrão (sem elas: 503 consent_unavailable).
  Aceite na MESMA transação da conta. Data nunca lida/logada/devolvida.
- **Boot sem segredos** (`lib/boot-secrets.ts`): padrão continua "sobe e avisa alto" (o CI sobe a API sem AUTH_* p/ checar /healthz e derrubar o formulário/painel no ar seria pior); `REQUIRE_SECRETS=true` faz o boot FALHAR. Proposta ao Atlas/Vulcano: ligar a flag em produção depois de provisionar AUTH_PEPPER, AUTH_JWT_SECRET e ADMIN_TOTP_ENCRYPTION_KEY.
- **test/helpers/setup.ts**: valores de teste NUNCA vêm do .env (antes `??=` depois do dotenv: um .env copiado de .env.example derrubava dezenas de testes). Preâmbulos (no-key.ts, ip-limit-env.ts) continuam vencendo porque são lidos ANTES do dotenv. Reproduzir com `DOTENV_CONFIG_PATH=<copia do .env.example>`.
