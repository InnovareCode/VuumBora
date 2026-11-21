# Veredito da Íris (QA) — S1 e Fechar Admin v0

Data: 21/11/2026. Quem escreveu não é quem prova: tudo abaixo foi refeito de forma independente, com
Postgres 18 real, Node 22 (o do CI) e navegador real. Nenhum código de produção foi alterado; as mutações
rodaram numa cópia limpa fora do repositório.

**Duas passadas.** A 1ª foi na árvore de ~10:10 (migrações 0010–0016, antes das correções I-1..I-7). A 2ª, de
10:57 a 11:10, foi no código que a Vega entregou (migrações até a 0019); o que ainda se mexia nessa hora está
dito na última seção. Os vereditos abaixo valem para o código da 2ª passada, **não para o que mudar depois**.

## Veredito por frente

| # | Frente | Veredito |
|---|--------|----------|
| 1 | `apps/api`: suíte completa, repetida, banco limpo; flakes | **APROVADO** (ressalvas de higiene de teste, abaixo) |
| 2 | CI: job `api` simulado / `npm run check` | job `api` **APROVADO**; `npm run check` **REPROVADO** (Lyra: HEX no QrCode; Vulcano/Lyra: `expo-env.d.ts`) |
| 3 | Mutações nas regras críticas | **APROVADO** (5 mutações sobreviveram à suíte; testes novos as matam; 3 refeitas no código final) |
| 4 | Concorrência real (funções SQL, runner de migração, teto da 0018) | **APROVADO** |
| 5 | `apps/admin` no navegador, API real, SMTP falso | login + 2FA + ativação **APROVADO** (Chromium, WebKit, Firefox; 390 px e desktop). Tela de e-mail: **APROVADA no contrato antigo, NÃO VALIDÁVEL no atual** (UI em migração para o step-up; ver "Segunda passada"). Defeito menor aberto: fonte 14 px |

## 1. Suíte da API e as falhas intermitentes

- 135 testes verdes em **7 execuções completas seguidas** (4 em banco recriado do zero, 3 reaproveitado), Node 26.
- 24 execuções de `admin-hardening` + `two-factor` com **3 processos em paralelo** (carga de CPU), bancos separados: 24/24.
- Node 22 em cópia limpa (sem `.env`, `npm ci`): 152/152 (já com testes novos meus).
- O trigger de `admin_audit_log` nunca foi desligado; os testes novos provam UPDATE/DELETE/TRUNCATE recusados com 42501.

**As duas falhas intermitentes que a Vega relatou NÃO se reproduziram.** Achei três mecanismos que as explicariam; os dois primeiros foram provados:

1. **Virada do passo TOTP (30 s) no teste de replay** (`two-factor.test.ts`, "replay: o mesmo código TOTP não vale duas vezes"). Se a virada cai entre o código gasto no enrolamento e o `codeAt(secret, 0)` do teste, o "replay" é um código novo e vale: `200 !== 401`. Forcei a virada numa cópia: falha com 140 ms de antecedência. Probabilidade natural ~0,2% por execução. **Conserto (Vega):** montar o código do replay a partir de `admin_totp.last_used_step` lido do banco (`hotp(secret, last_used_step)`), não do relógio. Não está em `admin-hardening`, mas é o mesmo tipo de coisa.
2. **`.env` mandando nos testes.** `test/helpers/setup.ts` faz `import 'dotenv/config'` e só depois `process.env[...] ??= valor`. Um `.env` copiado do `.env.example` traz `ADMIN_TOTP_ENCRYPTION_KEY=` (vazio, que `??=` não troca) e `ADMIN_LOGIN_RATE_LIMIT_MAX=5`: **42 de 135 testes falham** (todo o 2FA, e-mail do painel, papéis). No CI não há `.env`, então passa lá e quebra na máquina de quem seguiu o README. **Conserto (Vega):** o setup define os valores de teste de forma incondicional ANTES de qualquer `dotenv`, ou trata `''` como ausente.
3. Duas execuções sobre o MESMO banco ao mesmo tempo (a Vega mencionou trabalho paralelo de outra frente): não testei; cada execução minha usou o próprio banco.

## 2. CI (`.github/workflows/ci.yml`)

Simulado numa cópia sem `.env`, `npm ci` com Node 22.23, PG 18.1 com o papel `vuumbora` e o banco `vuumbora_test` do serviço do CI:

- `npm ci` ok (lockfile em sincronia) · `build` ok · `migrate` aplica as 16 do zero · API sobe e `/healthz` responde `ok` na 1ª tentativa · `npm test` agora existe e roda: 152/152. **Job `api`: APROVADO.**
- `npm run check`: **REPROVADO**, por dois motivos, nenhum visível no meu ambiente de dev:
  - `check-boundaries`: `apps/admin/src/components/auth/QrCode.tsx:54` tem `fill="#0C111B"` (HEX solto). **Lyra:** usar token (`currentColor` + classe de texto escura, ou o token navy).
  - `typecheck` de `passenger` e `driver` falha em checkout limpo (`mapbox-gl/dist/mapbox-gl.css`, TS2882). Causa: `expo-env.d.ts` está no `.gitignore`, existe só onde alguém rodou o Expo. Com o arquivo copiado, os dois passam. Anterior à S1; **Vulcano/Lyra:** gerar o arquivo no job (`npx expo customize tsconfig.json` ou criar `expo-env.d.ts` com `/// <reference types="expo/types" />`) ou parar de ignorá-lo.
  - `api` e `admin` passam no typecheck em ambiente limpo (inclui o `tsc` dos testes: `npm run typecheck:test` ok).
- Observação: o job de CI não define `AUTH_PEPPER`/`AUTH_JWT_SECRET`; com `NODE_ENV=test` a API sobe sem a identidade (503) e o `/healthz` passa. É o desejado para teste, mas **em produção essas variáveis têm de existir** (o boot não falha sem elas).

## 3. Mutações por amostragem (cópia limpa; cada uma num banco recriado)

| Regra | Mutação | Suíte da Vega | Depois dos meus testes |
|-------|---------|---------------|------------------------|
| Reuso de refresh revoga a família | UPDATE de revogação trocado por `NULL` | morta (4 testes) | morta |
| Idem, trava da rotação | `rotate_refresh_token` sem `FOR UPDATE` | **sobreviveu** (os testes de concorrência por `inject` passam) | morta (4) |
| 6ª tentativa = 429 (apps) | padrão 5 → 6 | morta (4) | morta |
| Contador por conta do admin | 10 → 11 | morta (7) | morta |
| Código de e-mail trava no 5º erro | `max_attempts` 5 → 6 | morta (8) | morta |
| TOTP trava no 5º erro | zeragem do contador `>=` → `>` | **sobreviveu** | morta |
| Default de produção do TOTP | `ADMIN_TOTP_MAX_ATTEMPTS` 5 → 8 | **sobreviveu** (o setup força 5) | morta |
| Código de e-mail nunca no log | `request.log.info({ body })` na verificação | morta (2) | morta |
| Código de e-mail nunca na tabela | `hashEmailCode` devolve o código com zeros à esquerda | **sobreviveu** (teste importava a função de produção) | morta |
| E-mail não verificado sem sessão | checagem do serviço removida | morta (2) | morta |
| Idem, 2ª camada | gatilho do banco removido (serviço mantido) | **sobreviveu** (ninguém testava o gatilho) | morta |
| Idem, as duas camadas | ambas removidas | morta | morta |
| Redefinir senha revoga sessões | UPDATE das famílias removido | morta (2) | morta |
| Redefinir senha, trava do código | `consume_email_code` sem `FOR UPDATE` | morta (9 incl. os meus) | morta |
| TOTP replay | trava de `last_used_step` removida | morta (2) | morta |
| Token de enrolamento de uso único | `used_at IS NULL` removido do consumo atômico | **sobreviveu** | morta |
| TOTP em repouso | segredo sem cifra | morta (28) | morta |
| Runner de migração | `pg_advisory_lock` removido | — | morta: "duplicate key ... pg_extension" e "pg_proc" com réplicas simultâneas |

Todos os sobreviventes eram **lacunas de teste, não defeitos do código**: a regra estava certa e nada a vigiava.

## 4. Concorrência real

`test/sql-concurrency.test.ts` (conexões `pg.Client` independentes, não o pool do app):

- ESTRESSE por rodadas repetidas: 12 conexões no mesmo token de refresh ⇒ exatamente 1 `rotated`, 1 `reuse_detected`, o resto `revoked`, zero exceção; 10/20 conexões em `consume_email_code` ⇒ 1 `ok`, 4 `invalid` + 1 `locked`, `attempts = 5`; 8 redefinições ⇒ 1 troca, a senha gravada é a do vencedor e todas as famílias caem; teto de 5 envios/h de `issue_email_code`.
- DETERMINÍSTICO (o que de fato prova o lock; só estresse não prova — a Vega já tinha medido): A segura a transação, B tem de aparecer **esperando lock em `pg_stat_activity`**, A confirma, B tem de ver o estado de A. Sem `FOR UPDATE` falham.
- Atomicidade: `reset_password_with_code` com hash inválido desfaz tudo (código vivo, sem tentativa gasta, sessões intactas).
- Observação de projeto: duas renovações simultâneas legítimas com o MESMO refresh token (duplo clique, duas abas) derrubam a família inteira — é o desenho (reuso = roubo), não bug, mas o app móvel precisa serializar o refresh.

`test/migration-runner.test.ts` (processos Node de verdade chamando `prepararBanco`, o mesmo caminho do boot):

- Do zero (o banco nem existe, 6 processos): cada uma das 16 migrações entra **uma vez**, ninguém falha, trilha de auditoria nasce com os 2 gatilhos.
- Sobre banco já migrado (6 processos): 0 aplicadas, `applied_at` intacto.
- **Upgrade de produção com dados:** banco parado na 0009 (o que está no ar) com admins, sessões, auditoria, fila e candidaturas; 4 processos aplicam 0010..0016; dados intactos, sessões de dono/financeiro apagadas pela 0013 e só elas, gatilho de auditoria vale sobre as linhas antigas.

## 5. `apps/admin` no navegador (API real, SMTP falso, teclado real)

Chromium em 1280 px e 390 px (`isMobile`, toque); fluxo de login+2FA também em **WebKit 26.5 (390 px)** e **Firefox 153 (desktop)**. Tudo digitado com `keyboard.type`.

- **Ativação do dono/financeiro:** login ⇒ pede o código de ativação; errado ⇒ alerta sem avançar; certo (inclusive minúsculo e com espaços) ⇒ QR + chave. O QR foi **decodificado da captura de tela** e o `secret=` bate com a chave exibida. TOTP errado ⇒ alerta; certo (digitado "123 456") ⇒ 10 códigos de recuperação; "Continuar" fica desabilitado até marcar "guardei". Chega ao painel; recarregar mantém a sessão; cookie `vb_admin_session` httpOnly, SameSite=Lax; nada em localStorage/sessionStorage.
- **Segundo fator:** o mesmo código na hora (replay) é recusado; 5 dígitos é recusado; o do passo seguinte entra; "Sair" derruba a sessão no servidor (`/me` volta 401); código de recuperação entra uma vez e a 2ª vez é recusada.
- **Tela de e-mail (dono):** salva servidor/porta/usuário/remetente/senha; ao recarregar a senha nunca volta (nem no HTML nem em nenhuma resposta da API) e aparece "Senha salva"; teste de envio chega no SMTP falso com o login `envio` correto e para o destinatário digitado (em branco ⇒ o e-mail do próprio dono); senha errada ⇒ erro exato do servidor (535 EAUTH) sem eco da senha; servidor que recusa destinatário ⇒ 550 exato; o 6º teste da hora ⇒ "Limite de 5 testes por hora" (UI e API 429); diálogo de remover senha: foco entra, **Tab e Shift+Tab não saem**, Escape fecha e devolve o foco ao botão.
- **Outros papéis:** operação, suporte, revisor e financeiro (este depois de ativar o 2FA em 390 px): menu sem "E-mail", `/email` mostra "Você não tem acesso a esta área" **sem chamar a API**, e a API direta (sessão e CSRF válidos) devolve **403 forbidden** em GET/POST/teste/remover senha. Dono sem CSRF ⇒ 403 `csrf_token_invalid`; porta 3306, host com porta e remetente com quebra de linha ⇒ 400.
- Sem rolagem horizontal em nenhuma tela medida (390 e 1280).

### Defeito aberto (menor) — Lyra

- Os campos **código de ativação** e **código de recuperação** têm `font-size: 14px` (classe `text-small`); o de 2º fator tem 18 px e e-mail/senha 16 px. No iOS/Safari, campo com fonte < 16 px dá zoom automático ao focar. Medido, não deduzido (não tenho iPhone). Corrigir para ≥ 16 px em `components/auth/CodeField.tsx`.

### Observações (não bloqueiam)

- Depois de entrar com código de recuperação a UI não avisa quantos restam (a API devolve `recoveryCodesRemaining`).
- A mensagem de código de recuperação errado diz "Confira o código no app autenticador" (texto único para os dois tipos).
- Se `GET /me` devolver 429 (limite global de 100 req/min por IP, que atingi com várias execuções), a UI cai na tela de login como se a sessão tivesse acabado. Vários admins atrás do mesmo NAT podem esbarrar nisso.
- O Vite do admin escuta só em `[::1]:4310`; o Firefox falhou a 1ª navegação (só em dev).

## Testes novos (em `apps/api/test`)

`sql-concurrency.test.ts` (14), `migration-runner.test.ts` (3, com `helpers/run-migrate.ts`), `db-invariants.test.ts` (5), `email-code-at-rest.test.ts` (2), `env-defaults.test.ts` (1), `reset-cap-concurrency.test.ts` (4) — 29 no total. Outros agentes ajustaram minhas fixtures de conta para a coluna `birth_date` da 0019. Todos determinísticos; os de estresse repetem rodadas e afirmam invariantes, os de lock usam `pg_stat_activity`.

## O que NÃO consegui provar

- **SMTP real** (Gmail/SES/provedor), STARTTLS/TLS direto, SPF/DKIM: só servidor falso sem TLS (`SMTP_ALLOW_INSECURE_DEV`).
- **Safari/iOS de verdade** (WebKit do Playwright não é o iOS: o zoom por fonte < 16 px é inferido da medição) e **Firefox/WebKit na tela de e-mail** (só login+2FA).
- **Leitor de tela** (VoiceOver, NVDA, TalkBack): só conferi a semântica no DOM (`role=status/alert`, `aria-live="polite"` no resultado do teste).
- Produção: o papel `vuumbora_api` com LOGIN, `MIGRATION_DATABASE_URL`, Traefik/`TRUST_PROXY`, Redis (a API não usa) — nada disso existe aqui.
- Execuções simultâneas sobre o MESMO banco de teste.
- Só Windows.

## Segunda passada (código da Vega: migrações 0010–0019)

O código não parou de mudar durante a passada (a Vega fechava I-1..I-7 e abriu idade/consentimento na identidade; a Lyra
migrava o painel para o step-up). Esperei 80 s sem alteração em `apps/api` e rodei:

- **Node 26, árvore real, banco recriado:** 2 execuções completas, **236/236** cada.
- **Node 22 em cópia limpa (CI simulado) com o código final:** build, `migrate` aplica as **19**, `/healthz` ok, **240/240**.
- `typecheck:test` ok. `check-docker-context` ok. `check-boundaries` **ainda vermelho** (QrCode.tsx:54).
- **Mutações refeitas no código final** (a 0018 redefine `consume_email_code`, então mutar a 0014 já não vale): `consume_email_code` sem `FOR UPDATE` ⇒ 10 testes falham; teto cumulativo da 0018 desligado ⇒ 5 falham (inclui os da Vega); `rotate_refresh_token` sem trava ⇒ só os meus 4 falham (a suíte anterior continua passando sem a trava).
- **Teto cumulativo de falhas do código de redefinição (I-7, 0018)** — novo `test/reset-cap-concurrency.test.ts` (4): com o teto atingido nem o código certo passa e nenhuma tentativa é gasta; falhas com mais de 24 h não contam; **com 9 falhas no dia, 12 chutes simultâneos gastam exatamente 1 tentativa e 11 voltam `account_locked`**; vale só para redefinição.
- **Step-up do SMTP (I-2) pela API real:** sem `stepUp` ⇒ 400; senha errada ⇒ 403 `password_invalid`; TOTP errado ⇒ 401; senha + TOTP certos ⇒ 200; o mesmo TOTP de novo ⇒ 401 (replay); remover a senha salva sem `stepUp` ⇒ 400; o GET nunca devolve a senha. Atenção: um TOTP do MESMO passo do login é replay — quem faz login e logo altera o SMTP precisa esperar o próximo passo (30 s); a UI precisa dizer isso.
- Espera progressiva do login (nova): depois de uma falha, a tentativa seguinte imediata volta 429 `account_locked` mesmo com a credencial certa (cada falha dobra a espera). Quem testar à mão ou em script precisa respeitar o `retryAfterSeconds`.
- **Login + 2FA + ativação** repetidos contra a API final (Chromium, desktop, dono novo): tudo igual à 1ª passada.

### O que NÃO pude fechar nesta passada (código em mudança, não é reprovação)

- **Tela de e-mail do painel contra a API final.** O cliente do admin já manda `stepUp` (`api/emailSettings.ts`), mas o formulário ainda não o fornece: clicar em Salvar não envia nada e a página lança `TypeError: Cannot read properties of undefined (reading 'password')`. `components/security/StepUpDialog.tsx` apareceu enquanto eu testava, então a Lyra está no meio. **Gate para o Atlas:** depois que a Lyra terminar, refazer a tela de e-mail inteira (salvar com step-up, senha nunca volta, teste de envio, remover senha, foco do diálogo de step-up, 390 px e desktop, 403 dos outros papéis). Os roteiros que usei estão em `scratchpad/iris/e2e/` (`flowD.mjs`, `flowC.mjs`, `flowA.mjs`, `stepup-api.mjs`) e precisam do acréscimo do diálogo.
- Mudanças em `identity-service`/`identity-repository` (idade e consentimento, 0019) caíram depois do meu último ciclo completo; os testes novos da Vega para elas passam na árvore em que rodei, mas qualquer alteração posterior precisa de nova rodada (`npm test` + `npm run typecheck:test`).

### Defeitos e lacunas de teste a corrigir (resumo para o Atlas)

| # | Onde | Dono | O quê |
|---|------|------|-------|
| 1 | `apps/admin/src/components/auth/QrCode.tsx:54` | Lyra | HEX solto `#0C111B` derruba o job `check` do CI |
| 2 | `.gitignore` / CI | Vulcano ou Lyra | `expo-env.d.ts` ignorado: typecheck de passenger/driver quebra em checkout limpo |
| 3 | `apps/admin/src/components/auth/CodeField.tsx` | Lyra | campos de ativação e de recuperação com 14 px (zoom no iOS); subir para ≥ 16 px |
| 4 | `test/two-factor.test.ts` "replay" | Vega | vira 200 se a virada do passo TOTP cair no meio; ler `last_used_step` do banco |
| 5 | `test/helpers/setup.ts` | Vega | `??=` depois de `dotenv`: `.env` copiado do exemplo derruba 42 testes localmente |
| 6 | formulário de e-mail do painel | Lyra | integrar o step-up (item acima) e avisar que o TOTP do passo do login é replay |
