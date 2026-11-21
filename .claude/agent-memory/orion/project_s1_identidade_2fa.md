---
name: project-s1-identidade-2fa
description: Auditoria S1 (rodadas 1 e 2, 2026-11-21) de identidade dos apps, 2FA do admin, SMTP no painel e migrações 0010-0016 — o que foi corrigido, o que segue aberto e padrões recorrentes
metadata:
  type: project
---

Relatórios: `docs/revisao-seguranca-s1.md` (rodada 1) e `docs/revisao-seguranca-s1-rodada2.md` (rodada 2). Sem CRÍTICO em nenhuma. Rodada 2 usou CRÍTICO/IMPORTANTE/SUGESTÃO.

**Corrigido e reconferido no código (rodada 2):** trustProxy por saltos (`lib/trust-proxy.ts`, provado por simulação com fastify), contador de falhas por conta no login admin (0016), token de ativação do 2FA fora de banda, reautenticação por senha + derrubar sessões ao ligar/desligar 2FA, retenção da identidade (`identity-retention.ts`), entropia dos segredos AUTH_*, no-store nas respostas com segredo, auditoria de falha de login admin. Guarda de SSRF do SMTP (`lib/smtp-host-guard.ts`) é sólida (testada com o módulo real).

**Abertos na rodada 2 (reconferir se foram corrigidos):**
- I-1 senha SMTP do ambiente é enviada a host digitado no painel (credencial deve seguir a origem do host).
- I-2 trocar SMTP no painel sem reautenticação = redirecionar códigos de verificação/redefinição dos apps.
- I-3 `MIGRATION_DATABASE_URL` (dono) no env do contêiner da API e `vuumbora_api` com DML total em `admin_users`/`admin_enrollment_tokens` (a API só lê admin_users).
- I-4 e-mail de terceiro "reservado" por conta não verificada (pre-hijack); I-5 spam/cota SMTP sem teto global nem CAPTCHA, plus-address e IPv6 /64 driblam limites; I-6 tetos por conta (20 apps, 10 admin) travam a vítima; I-7 código de reset de 6 dígitos sem teto cumulativo (~1,8%/30 dias por conta); I-8 nginx do admin sem CSP/frame-ancestors.
- Antigos ainda abertos: B-2 papel driver autoatribuível, B-4, B-5 (bcryptjs), ativar-papel-api.sql com senha no psql, rotação/kid da chave AES.

**Why:** padrões recorrentes deste projeto: (1) proteção afirmada em comentário/doc que o código não faz, ou faz só em parte (retenção, "chaves diferentes"); (2) premissa que depende de infra que o código não prova (proxy, papel de banco, onde o stdout vai); (3) lockout por chave única vira DoS; (4) valor de uma "origem de confiança" (ambiente) misturado com entrada do usuário (painel) — credencial vaza para host escolhido pelo usuário; (5) ação sensível nova esquece o step-up que outra ação equivalente já tem.

**How to apply:** em toda revisão: grep se a rotina citada em comentário existe; checar IP real/proxy; para cada lockout perguntar "quem consegue travar a vítima?"; para cada config editável no painel perguntar "para onde vão os segredos se eu mudar o destino?" e "exige senha/TOTP?"; verificar quais tabelas a API realmente escreve antes de aceitar DML total no papel de runtime.
