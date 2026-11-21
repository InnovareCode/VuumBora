# Revisão de segurança S1 — identidade dos apps, 2FA do admin, migrações 0010–0013, serializer do log

Auditor: Órion. Data: 2026-11-21. Escopo: código ainda não commitado em `apps/api`.
Método: leitura de código e SQL, mais `npm audit --omit=dev` (0 vulnerabilidades). Nada foi executado contra banco real e nenhum teste foi rodado (ver "Não verificado").
Base: OWASP Top 10 (2021) e OWASP API Security Top 10 (2023).

## Veredito

Nenhum achado CRÍTICO. Os controles centrais estão bem desenhados: JWT com algoritmo fixo e verificação em tempo constante, refresh com rotação atômica no banco, 2FA com `FOR UPDATE` e replay protection, TOTP cifrado com AES-GCM amarrado ao admin, fail-closed sem chave, trilha de auditoria blindada por trigger.
Há 1 ALTO (condicional, depende de como o proxy de borda trata `X-Forwarded-For`), 5 MÉDIOS e 6 BAIXOS/sugestões.
Liberação: dá para liberar a identidade dos apps e o 2FA **depois de confirmar o ALTO-1 em produção** (teste de 1 minuto, descrito abaixo). Os MÉDIOS podem ir na sequência, exceto o M-2 se o dono for enrolar o 2FA só depois do deploy (ver cenário).

Regressão da rodada 3 anterior: o gap de CSRF via CORS com `credentials` na origem pública está FECHADO (`app.ts:153-198`, dois contextos encapsulados, `credentials:false` nas rotas públicas e `/v1/auth/*`, lista `ADMIN_ALLOWED_ORIGINS` separada). A pendência "audit_log adulterável" está resolvida em duas camadas (migração 0012) e a pendência "sem 2FA" está atendida para dono/financeiro. Falta provar a camada 2 (papel restrito) em produção.

---

## ALTO

### A-1. `TRUST_PROXY` confia em qualquer `X-Forwarded-For` — todo rate limit por IP pode ser contornado (condicional)
- Onde: `apps/api/src/env.ts:73-77` (`value !== 'false'` vira `trustProxy: true`), usado em `app.ts:63`. Afeta `request.ip` em `auth-route.ts:28` (ipHash), nos limites `ipLimit` de `/v1/auth/*` e nos limites do login admin e de `/auth/2fa/*` (`admin-two-factor-route.ts:25-32`).
- Por que é problema: no Fastify, `trustProxy: true` aceita todos os saltos e `request.ip` passa a ser a entrada mais à esquerda do `X-Forwarded-For`. Se o proxy de borda (Traefik do Easypanel, talvez atrás de outro CDN) apenas ACRESCENTA ao cabeçalho que o cliente mandou, o atacante escolhe o próprio IP a cada requisição.
- Cenário: o login admin tem **só** limite por IP (5 por 15 min, `env.ts:115`) — não existe contador por conta na etapa da senha. Com IP forjado, o atacante faz password spraying/brute force sem limite contra `operacao`, `revisor_documentos` e `suporte` (que NÃO exigem 2FA). Nos apps, o limite por identificador (HMAC, no banco) continua valendo, mas o limite por IP e o `ip_hash` do access_log passam a ser falsificáveis (trilha forense contaminada).
- Correção sugerida: `trustProxy` com número de saltos (ex.: `1`) ou lista de CIDR do proxy, não `true`; e acrescentar contador por conta no login admin (tabela de tentativas, como na identidade dos apps).
- Como confirmar em 1 minuto: em produção, `curl -H "X-Forwarded-For: 1.2.3.4" https://api.vuumbora.com.br/...` e ver qual IP a API registra (o log do admin grava `remoteAddress`). Se aparecer 1.2.3.4, o achado é real.

---

## MÉDIO

### M-1. Bloqueio de login por identificador permite negar acesso a qualquer conta conhecida (DoS de conta)
- Onde: `identity-repository.ts:153-178` (`reserveLoginAttempt`) e `identity-service.ts:133-142`.
- Cenário: quem sabe o e-mail (ou o ID público) da vítima manda 5 logins errados a cada 15 min e a vítima nunca consegue entrar (429). A chave do bloqueio é só o identificador, sem o IP. O limite por IP (30/15 min) não impede, pois 5 por janela basta. Custo do atacante: desprezível.
- Correção sugerida: chavear também por (identificador + IP/dispositivo) e/ou atraso progressivo em vez de bloqueio duro; manter o bloqueio duro só como teto alto (ex.: 20) e confiar em atraso/CAPTCHA entre 5 e 20. Registrar métrica de contas bloqueadas.
- Contraponto honesto: o desenho atual protege bem contra brute force dirigido; o custo é essa troca por disponibilidade. É decisão de produto, mas precisa ser consciente.

### M-2. Enrolamento do 2FA por desafio: quem tem só a senha "sequestra" o 2FA de dono/financeiro ainda não enrolado
- Onde: `admin-two-factor-service.ts:225-234` (`startEnrollmentFromChallenge`), `admin-two-factor-repository.ts:56-67` (`upsertPendingSecret` sobrescreve segredo PENDENTE), `admin-auth-service.ts` (login devolve `enrollment_required` com a senha certa).
- Cenário: logo após o deploy, dono e financeiro ainda não têm TOTP. Quem tiver a senha (vazada, reutilizada, phishing) faz login, recebe o desafio, enrola o PRÓPRIO app autenticador, confirma, recebe sessão + códigos de recuperação. O dono legítimo passa a ser quem fica de fora (o próximo login pede um código que ele não tem). É exatamente o ataque que o 2FA deveria impedir, só que na janela do primeiro enrolamento. Além disso, durante o enrolamento legítimo, um terceiro com a senha pode chamar `enroll/start` e trocar o segredo pendente, quebrando o QR já escaneado (DoS pontual).
- Correção sugerida: (a) operacional, imediato: o dono enrola no mesmo dia do deploy e alguém confere o `admin.2fa.enrolled` no audit; (b) estrutural: primeiro enrolamento exige token de uso único entregue fora de banda (gerado pelo script `create-admin`/operador com acesso ao servidor) ou aprovação por outro dono; `upsertPendingSecret` não deve sobrescrever segredo pendente ainda válido.

### M-3. Enrolar 2FA com sessão (papéis opcionais) não pede senha nem revoga outras sessões
- Onde: `admin-two-factor-route.ts:107-122` (`/2fa/enroll/start` e `/confirm` só com `requireAdmin` + CSRF) e `admin-two-factor-service.ts:315-360`.
- Cenário: cookie de sessão roubado (a sessão vale até 7 dias) em conta `operacao`/`suporte`/`revisor`: o atacante, que lê o CSRF em `/me`, enrola o próprio TOTP. Ganha persistência (exige o código dele daí em diante) e tranca o usuário legítimo para fora. Também: ao ligar ou desligar o 2FA, as OUTRAS sessões da conta continuam vivas.
- Correção sugerida: exigir a senha atual (reautenticação) para iniciar/confirmar enrolamento, desativar e regenerar códigos; ao confirmar ou desativar, apagar as demais sessões do admin (manter a atual).

### M-4. Bloqueio de 15 min do 2FA nega acesso ao admin a quem já tem a senha
- Onde: `admin-two-factor-service.ts:89-92` e `admin-two-factor-repository.ts:87-106`.
- Cenário: atacante com a senha de um admin (mesmo sem o segundo fator) erra 5 códigos e trava a conta por 15 min, repetidamente; dono/financeiro ficam sem acesso. Sem a senha ele não consegue (precisa do desafio), então a gravidade é média.
- Correção sugerida: não há conserto sem custo (é o trade-off do lockout); mitigar com alerta (o `admin.2fa.locked` já é auditado — ligar notificação) e um procedimento de "break-glass" documentado para destravar via banco (`UPDATE admin_totp SET locked_until=NULL`). Aceitar o risco de forma explícita.

### M-5. Retenção prometida mas não implementada (dados pessoais e crescimento ilimitado)
- Onde: comentários de `0011_create_auth_tokens_and_logs.sql:159-161` ("a aplicação apaga o que passou da janela") e `:184-186` ("retenção de 90 dias por rotina"). Não existe nenhum `DELETE` sobre `login_attempts`, `access_log` ou famílias de refresh expiradas no código (busca em `src` e `scripts`). `admin_audit_log` guarda `ip_address` em claro e o trigger impede apagar, sem procedimento de retenção.
- Por que é problema: LGPD (minimização/retenção; apps terão dados de passageiros e motoristas), e `login_attempts` cresce sem limite (cada tentativa errada grava uma linha; combinado com A-1, vira vetor de inchaço do banco).
- Correção sugerida: job de retenção (cron do Easypanel) rodando com a credencial dona: `login_attempts` > janela, `access_log` > 90 dias, `refresh_token_families` vencidas, `admin_login_challenges` vencidos; e documentar o procedimento (desabilitar trigger dentro de transação auditada) para a retenção do `admin_audit_log`.

---

## BAIXO / SUGESTÃO

### B-1. Enumeração de e-mail no cadastro (`409 email_taken`)
`auth-route.ts:75-77`. O hash do bcrypt roda antes do INSERT (sem diferença de tempo), mas a resposta diferente revela se o e-mail tem conta. Mitigado só pelo limite de 30/15 min por IP (que cai junto com A-1). Também não há verificação de posse do e-mail (`email_verified_at` nunca é preenchido): alguém pode "reservar" o e-mail de terceiro. Correção: aceitar o risco conscientemente para o MVP, ou resposta genérica + verificação por e-mail antes de ativar.

### B-2. Papel `driver` é autoatribuível no cadastro
`domain/auth.ts:21-22` e `identity-repository.ts:30`. Hoje não concede nada, mas quando existirem recursos de motorista (corridas, repasse), o papel não pode valer sem passar pela aprovação de `driver_applications`. Registrar como regra de negócio para quem implementar a próxima fatia (Vega).

### B-3. Segredos do JWT/pepper: só comprimento, sem checagem de entropia nem de serem diferentes
`auth-config.ts:11-13`. `min(32)` aceita 32 letras iguais, e nada impede `AUTH_PEPPER === AUTH_JWT_SECRET` (o `.env.example` pede "diferentes entre si", o código não confere). Correção: exigir que sejam distintos e, de preferência, base64 de 32 bytes. Sem suporte a rotação (`kid`) — aceitável hoje porque o access token dura 15 min.

### B-4. Refresh com reuso detectado derruba a sessão em retry legítimo
`identity-service.ts:174-177` + `rotate_refresh_token()` (0011:111-117). Se o app mandar o refresh, perder a resposta e repetir, a família inteira é revogada e o usuário é deslogado. É seguro, mas ruim na rede móvel. Considerar janela de tolerância curta (ex.: 10 s) para o mesmo token de substituição.

### B-5. Custo de CPU do bcryptjs (JS puro) com pool de 5 conexões
`identity-service.ts:96,146` e `db.ts` (`max: 5`). Cada login/cadastro ocupa CPU do event loop por centenas de ms; com A-1 aberto, um flood degrada a API toda (inclusive o painel). Correção: bcrypt nativo/argon2 ou limite de concorrência; revisar o tamanho do pool. Também gerar o hash "dummy" no boot (`getDummyHash`, linha 117-122), não na primeira requisição.

### B-6. Higiene operacional do papel restrito e do 2FA
- `docs/sql/ativar-papel-api.sql:8`: `ALTER ROLE ... PASSWORD '<...>'` deixa a senha no histórico do psql e pode ir para o log do servidor; preferir `\password vuumbora_api`.
- `0012_...sql:69-76`: o papel recebe UPDATE/DELETE por padrão em tabelas futuras; toda nova tabela append-only precisa do próprio `REVOKE` (hoje só `admin_audit_log` e `access_log`). Em Postgres < 15, o `PUBLIC` ainda tem `CREATE` no schema `public`; confirmar a versão ou fazer `REVOKE CREATE ON SCHEMA public FROM PUBLIC`.
- O papel restrito protege a TRILHA, não o sistema: com a credencial de runtime vazada, o atacante ainda faz `DELETE FROM admin_totp`, `UPDATE admin_users`, `INSERT INTO admin_sessions` (hash conhecido). Isso é inerente ao desenho (a API precisa dessas escritas) — só registrar que 2FA não defende contra roubo de `DATABASE_URL`.
- Chave `ADMIN_TOTP_ENCRYPTION_KEY`: sem `kid` e sem plano de rotação; perder/trocar invalida todos os segredos (documentado no `env.ts`) e deixa dono/financeiro sem entrar. Guardar backup da chave fora do banco e documentar o procedimento de rotação e de break-glass. A validação `Buffer.from(v,'base64').length === 32` (`env.ts`) é permissiva com caracteres inválidos.
- Respostas com segredo/códigos de recuperação (`/2fa/enroll/*`, `/auth/2fa/enroll/confirm`) deveriam enviar `Cache-Control: no-store`.
- Migração 0013 apaga sessões de dono/financeiro uma única vez: numa implantação com réplica antiga ainda no ar, essa réplica pode emitir sessão sem 2FA depois da limpeza, e um rollback de versão remove a exigência. Quem for promovido a dono depois mantém a sessão antiga sem 2FA.
- Login admin não registra tentativas falhas no `admin_audit_log` (só em log de aplicação); considerar auditar falhas de senha por conta para detecção.

---

## O que foi verificado e está correto

- **JWT (`token-crypto.ts`)**: header comparado por igualdade exata com o nosso (barra `alg:none` e troca de algoritmo); HMAC-SHA256; `timingSafeEqual` com checagem prévia de tamanho; `iss`, `exp`, tipos de `sub`/`sid` exigidos; qualquer defeito vira o mesmo `null`. Sem dependência externa. `require-account.ts` ainda confere no banco que a família segue viva e a conta ativa, então logout/logout-all/reuso valem na hora.
- **Refresh**: só o sha256 vai ao banco; rotação atômica em `rotate_refresh_token()` com `FOR UPDATE`, índice único "um token vivo por família", teto absoluto de 90 dias, família revogada em reuso e em conta inativa.
- **Login dos apps**: mensagem única para conta inexistente/senha errada/conta não ativa; bcrypt sempre executado (hash dummy); reserva da tentativa sob `pg_advisory_xact_lock` (sem corrida entre requisições paralelas); `identifier_hash` e `ip_hash` são HMAC com pepper (não sha256 puro); limite de 72 bytes na senha contra truncamento do bcrypt; consultas todas parametrizadas (a única interpolação, `identity-repository.ts:48,53`, escolhe entre duas colunas fixas).
- **2FA**: transação com `SELECT ... FOR UPDATE` (50 palpites paralelos não driblam o contador); falha confirmada com COMMIT; replay barrado por `last_used_step`; TOTP comparado em tempo constante sobre os 3 passos; desafio de uso único (`deleteChallenge` na mesma transação do acerto, rollback se já usado); código de recuperação consumido por UPDATE atômico, 50 bits, só o hash guardado; regenerar códigos exige TOTP (não vale recuperação); papéis obrigatórios não desativam; sem chave o sistema falha fechado (503) em vez de entrar sem segundo fator; segredo AES-256-GCM com AAD = id do admin (cópia entre linhas não decifra); QR gerado localmente (`qrcode` no `apps/admin`, sem serviço externo); segredo/código/token nunca vão a log nem auditoria.
- **Serializer do pino e ordem dos handlers (`app.ts`)**: `setErrorHandler`/`setNotFoundHandler` agora antes de qualquer `register`, então os contextos encapsulados os herdam (corrige o vazamento de `err.message`/stack e o formato cru do Fastify); `err` serializer força `message`/`stack` a `[omitida]`; `req` serializer omite IP e porta em `/v1/auth/*` e corta a querystring; todos os `request.log.error` varridos usam `describeErrorForLog` (`waitlist-route.ts`, `driver-application-route.ts`, `auth-route.ts`). `request.ip` continua em claro nas rotas admin (aceitável: operadores internos, e o painel já grava IP na auditoria).
- **CORS/CSRF**: ver "Regressão da rodada 3" acima. `/v1/auth/*` usa Bearer (sem cookie), logo CSRF não se aplica, e o CORS público com `credentials:false` está correto.
- **Migrações**: `CHECK` de formato do hash na credencial, normalização de e-mail no banco, `public_id` aleatório (não sequencial), `REVOKE` em `schema_migrations`, triggers de append-only também contra TRUNCATE, rollback documentado para 0010-0012, e a 0012 não derruba o boot sem permissão de criar papel.
- **Dependências**: `npm audit --omit=dev` em `apps/api` sem vulnerabilidades conhecidas.

## Não foi possível verificar

1. O comportamento real do proxy de borda com `X-Forwarded-For` (A-1) — depende da infraestrutura em produção.
2. Se o papel `vuumbora_api` está de fato ativo e se `DATABASE_URL` da API já aponta para ele (a camada 2 só vale depois de rodar `ativar-papel-api.sql`); tampouco se a credencial que migra tem direito de criar papel no Postgres gerenciado.
3. Execução: não rodei a suíte (`apps/api/test/*.test.ts`) nem subi a API contra um Postgres; todas as conclusões são de leitura de código e SQL. Em particular, as corridas (advisory lock, `FOR UPDATE`, rotação) estão corretas no papel e precisam do teste concorrente da Íris para serem dadas como provadas.
4. A versão do Postgres de produção (afeta o `CREATE` do `PUBLIC` no schema `public`).
5. Frontend do admin (`apps/admin`) além da presença da lib `qrcode`: não auditei como guarda o `csrfToken`, nem se os códigos de recuperação ficam só em memória.
6. Workflows em `.github/` e `scripts/backup/`, `scripts/check-docker-context.mjs`, documentação de backup: fora do escopo pedido (backup contém dados pessoais — vale uma revisão própria: cifragem em repouso e acesso).
7. Apps `passenger`/`driver`/`site`: sem relação com este escopo.
