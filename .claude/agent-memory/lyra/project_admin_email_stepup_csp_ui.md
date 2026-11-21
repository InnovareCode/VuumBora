---
name: project_admin_email_stepup_csp_ui
description: apps/admin rodada 2 (21/11/2026) — step-up (senha+TOTP) na tela E-mail, "unidade de origem" servidor/porta/usuário/senha, CSP no nginx do painel e COMO foi medido (nginx real, API/banco próprios). Leia antes de mexer em /email, no nginx.conf ou em diálogo de reautenticação.
metadata:
  type: project
---

**Step-up na tela E-mail** (`docs/contrato-admin-email.md`): salvar e "remover senha salva" levam
`stepUp {password, code}` (TOTP; recuperação NÃO vale). Peça única reutilizável:
`components/security/StepUpDialog.tsx` (genérico, `run`/`onDone`/`onRejected`). O diálogo trata
`password_invalid`, `invalid_second_factor`, `account_locked`, `two_factor_locked`, rede e
`two_factor_unavailable` DENTRO dele (nenhum derruba a sessão); erros que são do FORMULÁRIO (campo
400, `smtp_host_blocked`, `encryption_unavailable`) voltam por `onRejected`, que fecha o diálogo.
- Diálogos ficam FORA do `<form>` da tela (cada um tem o próprio `<form>`; aninhar é HTML inválido).
- Foco depois de fechar: `useFocusTrap` devolve ao botão que abriu; para ir a OUTRO campo use o padrão
  `focusNext` (estado + efeito que roda depois do desmonte do diálogo).
- Senha errada NÃO gasta o TOTP (medido na API real) -> mantém o código, apaga só a senha.
- Pré-valida "servidor sem porta" no cliente: não gasta o TOTP numa tentativa que o servidor recusaria.

**Unidade de origem (I-1):** `FormState` guarda o digitado, mas a TELA e o envio usam `normalize()`:
sem servidor, porta/usuário/senha aparecem e vão em branco e desabilitados (voltar a digitar o servidor
traz o digitado de volta). Hints dizem que `SMTP_PORT/USER/PASS` nunca valem com servidor do painel.
Se mostrasse `form.port` cru, o servidor em branco exibiria porta antiga (bug pego pelo teste).
Resíduo conhecido: o selo de origem ("Definido aqui") reflete o valor SALVO, então com o servidor
apagado e ainda não salvo ele contradiz o campo ("Vem do ambiente") até salvar.

**CSP no `apps/admin/nginx.conf`** (achado I-8): `default-src 'self'; script-src 'self';
style-src 'self' fonts.googleapis; font-src 'self' fonts.gstatic; img-src 'self' data:; connect-src
'self' <API>; object-src/base-uri 'none'; form-action 'self'; frame-ancestors 'none'` + nosniff,
Referrer-Policy no-referrer, Permissions-Policy, X-Frame-Options. Google Fonts está permitido porque
`global.css` faz `@import` dele (auto-hospedar tiraria os 2 hosts). `connect-src` TEM de ser igual a
`VITE_API_BASE_URL` do build (padrão `https://api.vuumbora.com.br`); build com outra API exige trocar
a linha (o Dockerfile NÃO faz isso — pendência para Vulcano). HSTS não está no nginx (TLS termina no Traefik).
Armadilha: [[bug_nginx_add_header_location_zera_heranca]].

**Como foi medido (reaproveite):** sem Docker/nginx na máquina -> `nginx-1.27.5.zip` de nginx.org extraído
numa pasta isolada do scratchpad, `nginx.conf` de teste gerado por script que troca SÓ `listen`, `root` e
o `connect-src` (e FALHA se o trecho não existir exatamente 1 vez); `nginx -t` + curl dos cabeçalhos em
`/`, rota SPA, asset, healthz; Playwright (`playwright-core` 1.60 casa com o Chromium em cache) com
`securitypolicyviolation` capturado via `addInitScript`, e CONTROLES NEGATIVOS (script inline, fetch
externo, iframe) para provar que a CSP barra de verdade. Banco: `initdb`+`pg_ctl` próprios em porta
própria (NÃO usar o cluster de outro agente: `vuumbora_api` é papel do cluster inteiro). API: env exportado
no shell (vence o `.env` de outros). SMTP falso em porta PERMITIDA pelo painel (25; 2525/587 podem estar
ocupadas): o painel só aceita 25/465/587/2525 para host digitado. `smtp-server` importado por URL `file:///`
(import `C:/` quebra em ESM). TOTP persistido em arquivo para não repetir passo de 30 s entre execuções.
429 global da API: 100 req/min por IP — estourar de verdade com GET `/v1/admin/me` (`/healthz` não conta).
Não provado: Dockerfile/imagem real (sem Docker); HSTS no proxy; fonte do Google com rede de produção.
