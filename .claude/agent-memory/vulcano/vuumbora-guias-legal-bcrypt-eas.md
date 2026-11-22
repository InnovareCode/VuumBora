---
name: vuumbora-guias-legal-bcrypt-eas
description: Armadilhas de infra do S1 (22/11/2026) — textos legais atrás do nginx do site, pista de bcrypt vs cota de CPU, chave do 2FA que também cifra o SMTP, eas.json e como validar sem conta Expo.
metadata:
  type: project
---

Fechei B-7 e B-5 da Órion (rodada 3b) em `docs/publicar-o-backend.md` (seção 3, 5 subseções novas) e
`docs/producao-passo-a-passo-dono.md` (passos 9 e 10), e criei `apps/{passenger,driver}/eas.json`.

**Armadilhas que não aparecem lendo só o código da API:**
- **O nginx do site (`try_files ... /index.html`) responde 200 com a home para arquivo inexistente.** Os textos legais
  hospedados em `<LEGAL_DOCUMENTS_BASE_URL>/<doc>/<perfil>/<versão>` (sem extensão) nunca dão 404: versão errada = home.
  Conferir sempre pelo **hash dos bytes que o endereço devolve** (`curl -o` + `sha256sum`), não pelo status nem pelo arquivo
  local (CRLF muda o hash). `legal:publish` é imutável: errou, publica a versão seguinte.
- **`AUTH_BCRYPT_CONCURRENCY`/`QUEUE_MAX` inválidos voltam ao padrão sem erro** (`.catch` do zod em `bcrypt-pool.ts`). O padrão usa
  `availableParallelism()`, que pode ver os núcleos do servidor e não a cota do contêiner (não medido). Regra adotada: vagas =
  cota − 1, mínimo 1, máximo 2, sempre explícita em produção.
- **`ADMIN_TOTP_ENCRYPTION_KEY` cifra o 2FA E a senha do SMTP do painel.** Chave trocada = e-mail dos apps falha sem aviso
  (`mailer.ts` → `password_unreadable`). Recuperação: break-glass seção 3 (refazer 2FA) → entrar → salvar a senha SMTP de novo.
- Medir `/healthz` sob rajada **dentro do contêiner** com `node -e` + `fetch` (30 logins simultâneos, IP loopback, não gasta a
  cota de IP dos usuários). De Git Bash no Windows o `xargs -P` não é simultâneo de verdade (curl demora a nascer), teste fraco.
- Usuário SMTP em claro em `admin_audit_log` (`before->>'user'`) existe só se a API rodou entre 40d78cb e 16c147a com SMTP salvo.

**eas.json — como validei sem conta Expo:** `npm pack @expo/eas-json` NÃO serve para rodar (precisa das deps); instalar em
diretório isolado (`npm i @expo/eas-json --ignore-scripts`) e chamar `EasJsonAccessor`/`EasJsonUtils.getBuildProfileAsync` por
perfil x plataforma valida o schema oficial offline. `https://json.schemastore.org/eas.json` não existe (404). eas.json aceita
JSON5 (comentários), mas o aceite pedia JSON estrito, então o lembrete de `EXPO_PUBLIC_*` mora no guia, não no arquivo.
Nunca pôr `EXPO_PUBLIC_X: ""` no `env` do eas.json: sobrescreveria o valor do EAS.
`metro.config.js` lê `VUUMBORA_BUILD_PROFILE` e `EAS_BUILD_PROFILE`; o valor do `env` tem de ser igual ao nome do perfil.
Não resolvido: `expo-dev-client` ausente (perfil `development`), `projectId` do EAS, versão de EAS CLI da máquina do dono.
