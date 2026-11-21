---
name: project-admin-email-smtp
description: Config SMTP no painel (migração 0015, mailer nodemailer) — decisões, trava SSRF, armadilhas de teste. Contrato em docs/contrato-admin-email.md.
metadata:
  type: project
---

Feito em 21/11/2026. Painel > ambiente (SMTP_HOST/PORT/USER/PASS, EMAIL_FROM) > nada, por campo; só papel `dono`.

- **Mailer** (`services/mailer.ts`) relê a config a cada envio; host do painel passa por `lib/smtp-host-guard.ts`
  (BlockList, conecta ao IP aprovado); host do ambiente é confiável. `SMTP_ALLOW_INSECURE_DEV` libera rede privada + sem TLS
  e é ignorada com NODE_ENV=production. Lê `process.env` direto (não `env.ts`) por serem todas opcionais.
- **Senha** cifrada com a mesma `ADMIN_TOTP_ENCRYPTION_KEY`, AAD `email_settings:smtp_password` (domínio separado do TOTP).
- **Limite de 5 testes/h** conta linhas `email_settings.test_requested` em `admin_audit_log` sob `pg_advisory_xact_lock` por admin.
- **Armadilha de teste:** remover o lock NÃO fez o teste de 40 requisições paralelas falhar (a corrida não aparece no inject).
  Prova de verdade = segurar o mesmo advisory lock na transação do teste e checar que a rota fica pendente.
- **CORS admin só GET/POST** (app.ts): por isso "salvar" é POST, não PUT.
- Porta do painel restrita a 25/465/587/2525; o servidor SMTP falso dos testes usa 2525.
- Heredoc `<<'EOF'` com texto longo travou o shell duas vezes aqui; usar a ferramenta Write para arquivos grandes.
- `identity.test.ts` falhava na época por trabalho em andamento do Cronos/identidade (tsc de `auth-route.ts`), não por este módulo.
