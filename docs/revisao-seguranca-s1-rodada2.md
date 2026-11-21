# Revisão de segurança S1 — rodada 2 (SMTP no painel, identidade por e-mail, endurecimento do admin, migrações 0010–0016)

Auditor: Órion. Data: 2026-11-21. Escopo: código ainda não commitado em `apps/api` e `apps/admin` (git status da sessão).
Rodada anterior: `docs/revisao-seguranca-s1.md` (1 ALTO, 5 MÉDIOS, 6 BAIXOS). Nesta rodada a severidade usa a escala do protocolo: CRÍTICO / IMPORTANTE / SUGESTÃO (equivalência com a rodada 1: ALTO e MÉDIO viram IMPORTANTE, BAIXO vira SUGESTÃO).
Base: OWASP Top 10 (2021) e OWASP API Security Top 10 (2023).

## Como cada coisa foi provada (nível, conforme `quem-valida-o-que`)

| Verificação | Nível | Como |
|---|---|---|
| Leitura do código e das migrações do escopo | lido | arquivos citados em cada achado |
| Guarda SSRF contra hosts de teste (loopback, 10/8, metadados 169.254, `::ffff:`, `localhost`, DNS que aponta para loopback, formas numéricas) | executado isolado | módulo real `smtp-host-guard.ts` rodado com `tsx` num script fora do projeto; resultado transcrito em S-1 |
| `BlockList` do Node com IPv4 mapeado em IPv6 e faixas de transição | executado isolado | mesmo script |
| Sanitização de cabeçalhos do nodemailer (CRLF no nome, ` `, NUL, caracteres raros no destinatário) | executado isolado | `nodemailer` 10.6.1 do repositório com `streamTransport` |
| `trustProxy` por saltos (1 salto devolve o IP acrescentado pelo proxy, não o forjado) | executado isolado | `fastify` 5.12.8 do repositório com `inject()` |
| `npm audit --omit=dev` em `apps/api` e `apps/admin` | executado | 0 vulnerabilidades nos dois |
| Funções SQL (`issue_email_code`, `consume_email_code`, `reset_password_with_code`, `rotate_refresh_token`), concorrência e papel `vuumbora_api` | lido | NÃO executei contra Postgres (ver "Não foi possível verificar") |
| Suíte `apps/api/test/*.test.ts` | NÃO executada | exige Postgres; o CI (`.github/workflows/ci.yml`) é quem roda |

## Veredito

Nenhum CRÍTICO. Os pontos da rodada 1 que eram corrigíveis em código foram de fato corrigidos (tabela abaixo) e a guarda de SSRF do SMTP está bem construída. Há 8 IMPORTANTES e 12 SUGESTÕES.
Liberação: pode ir para produção **depois de corrigir I-1 e I-2** (o dono do painel ou uma sessão de dono roubada vira o meio de tomar contas dos apps e de vazar a senha SMTP do servidor) e de confirmar em produção os itens de infraestrutura listados em "Não foi possível verificar" (principalmente `TRUST_PROXY`, IPv6 e onde o stdout dos scripts é gravado). I-3 a I-8 podem ir na sequência, na ordem de prioridade indicada.

---

## Conferência da rodada 1 — achado por achado, contra o código atual

| Item | Situação | Evidência |
|---|---|---|
| A-1 `TRUST_PROXY` confia em tudo | **Corrigido** (código). Depende de infra, ver S-8 | `lib/trust-proxy.ts:40-56` nunca devolve `true` (ausente/`true` = 1 salto); `app.ts:70`. Simulação: com 1 salto e `X-Forwarded-For: 1.2.3.4, 203.0.113.7` o `request.ip` é `203.0.113.7` (o acrescentado pelo proxy). Com `true` antigo seria `1.2.3.4`. Contador por conta no login admin criado: `admin-login-failure-repository.ts:26-65`, migração 0016 |
| M-1 DoS de conta por identificador (apps) | **Parcial** | Chave por (identificador + IP) com 5 falhas (`identity-service.ts:180,185`) resolve o caso de 1 atacante. O teto global de 20 (`:186`, `auth-config.ts:25`) reabre o DoS: ver I-6 |
| M-2 sequestro do 1º enrolamento de 2FA | **Corrigido** | Token de uso único fora de banda exigido em `enroll/start` e `enroll/confirm` (`admin-two-factor-service.ts:250-259,310`); `getOrCreatePendingSecret` não sobrescreve segredo pendente válido (`admin-two-factor-repository.ts:70-113`). Resíduos em S-6 |
| M-3 enrolar com sessão sem senha nem revogar sessões | **Corrigido** | `startEnrollment` exige senha (`admin-two-factor-service.ts:243-247`, mesmo contador por conta); confirmar/desativar apagam as outras sessões (`:313`, `:419`); regenerar e desativar exigem senha + código (`:370-390`, `:399-429`) |
| M-4 bloqueio de 15 min do 2FA | **Aceito e documentado** | `docs/break-glass-admin.md` (§1, §2). O custo (travar admin conhecido) segue: ver I-6 |
| M-5 retenção prometida e ausente | **Corrigido para a identidade** (código e script). Lacunas em S-7 | `lib/identity-retention.ts:54-69`, `scripts/retention-identity.mjs`. O cron em si não é verificável |
| B-1 enumeração/reserva de e-mail no cadastro | **Decisão do dono mantida** (409 explícito, com teto). A parte "reservar e-mail de terceiro" ficou pior sem a verificação prévia: ver I-4 | `auth-route.ts:75-77` |
| B-2 papel `driver` autoatribuível | **Aberto** (aceitável hoje) | `domain/auth.ts:6-7,28`: qualquer um cria conta `driver`. Regra de negócio para quem implementar corridas/repasse: o tipo `driver` só vale após `driver_applications` aprovada |
| B-3 segredos só por comprimento | **Corrigido** | `auth-config.ts:68-96`: entropia mínima, 12 caracteres distintos, pepper diferente do JWT. A chave AES do TOTP segue permissiva: S-2 |
| B-4 refresh com reuso derruba sessão em retry legítimo | **Aberto** (decisão de produto) | `rotate_refresh_token()` inalterada |
| B-5 bcryptjs no event loop, hash dummy preguiçoso | **Aberto** | `identity-service.ts:165-168` ainda gera o dummy na 1ª requisição; as rotas novas (`register`, `reset-password`) adicionam mais bcrypt de 250 ms+ no mesmo processo |
| B-6a senha do papel no histórico do psql | **Aberto** | `docs/sql/ativar-papel-api.sql:6` ainda manda `ALTER ROLE ... PASSWORD '<...>'` |
| B-6b grants por padrão em tabelas futuras / `CREATE` do PUBLIC | **Aberto** | `0012:69-77`; sem `REVOKE CREATE ON SCHEMA public FROM PUBLIC`. O CI usa Postgres 18 (sem o problema); a versão de produção não é verificável |
| B-6c sem `kid` nem rotação da chave | **Aberto** | e agora a mesma chave cobre a senha SMTP (S-2) |
| B-6d `Cache-Control: no-store` nas respostas com segredo | **Corrigido** | `admin-auth-http.ts:18-21`, `admin-two-factor-route.ts:47-55` |
| B-6e sessões de quem é promovido a dono mantêm sessão sem 2FA | **Aberto** (só por SQL, sem rota de troca de papel) | S-11 |
| B-6f falhas de senha do admin sem auditoria | **Corrigido** | `admin-auth-service.ts:131-135` (`admin.login_failed`, `admin.login_locked`) |

---

## CRÍTICO

Nenhum.

---

## IMPORTANTE

### I-1. A senha SMTP do AMBIENTE é enviada para um servidor digitado no painel (exfiltração de credencial)
- Onde: `apps/api/src/services/mailer.ts:99-110` (senha do ambiente quando `password.source === 'env'`) combinado com `:146-163` (host do painel só passa pela trava de SSRF, e a conexão autentica com `config.user`/`config.password`); composição campo a campo em `domain/email-settings.ts:129-138` e `:141-148` (`missingFields` considera a senha "salva" também quando ela vem do ambiente).
- Cenário: o dono (ou uma sessão de dono roubada) grava no painel `host = smtp.dominio-do-atacante.com`, porta 587, e NÃO grava senha. O servidor resolve para IP público, passa pela trava, o STARTTLS valida (o atacante tem certificado válido do próprio domínio) e o nodemailer envia `AUTH` com `SMTP_USER`/`SMTP_PASS` do ambiente para o servidor do atacante. Um único "enviar teste" basta (o limite de 5/h não ajuda). `SMTP_PASS` é segredo de infraestrutura que o dono do painel não precisa conhecer.
- Correção: credenciais seguem a origem do host. Se o host efetivo vem do painel, usuário e senha só podem vir do painel (nunca do ambiente); se o host vem do ambiente, aceitar painel só para o remetente. Tornar a quádrupla host/porta/usuário/senha uma unidade atômica de origem e recusar na gravação a combinação mista. Incluir teste que prove que `SMTP_PASS` nunca é enviado a host vindo do painel.

### I-2. Trocar o servidor SMTP não exige reautenticação — quem muda o SMTP recebe os códigos de verificação e de redefinição de senha dos apps
- Onde: `routes/admin-email-settings-route.ts:22,38-50` (só `requireAdminRole('dono')` + CSRF); o mesmo SMTP envia os códigos de `/v1/auth/*` (`app.ts:171`, `services/code-delivery.ts`).
- Cenário: cookie de sessão de dono roubado (a sessão vale até 7 dias) e `csrfToken` lido de `/me` por XSS no painel ou malware no navegador. O atacante aponta o SMTP para o próprio servidor, pede "esqueci a senha" de qualquer passageiro ou motorista, recebe o código de 6 dígitos no servidor dele e redefine a senha. O 2FA do dono protege o login, não uma sessão já aberta, e a regra "senha atual para ação sensível" (M-3) foi aplicada ao 2FA mas não aqui.
- Correção: step-up (senha atual + código TOTP) para alterar host, porta, usuário ou remetente e para remover a senha; considerar espera curta (ex.: 10 min) antes de a nova configuração valer, ou aprovação de um segundo `dono`; manter a auditoria (já existe). Alerta fora do SMTP (a notificação pelo próprio SMTP alterado não serve).

### I-3. O papel restrito `vuumbora_api` protege menos do que parece (credencial dona no mesmo contêiner e DML total em tabelas que a API só lê)
- Onde: `docs/sql/ativar-papel-api.sql:9-10` manda pôr `MIGRATION_DATABASE_URL` (credencial DONA) no serviço da API; `src/migrate.ts:262` lê de `process.env` e `src/server.ts` nunca a remove; `scripts/retention-identity.mjs:37` também a usa no mesmo contêiner. `0012:69-77` dá `SELECT, INSERT, UPDATE, DELETE` em todas as tabelas, inclusive `admin_users` e `admin_enrollment_tokens`, embora `repositories/admin-repository.ts:1` declare que a API só lê `admin_users` e o único emissor de token de ativação seja script.
- Cenário: vazamento de variáveis de ambiente do contêiner da API (log de diagnóstico, dependência comprometida, RCE) entrega a credencial dona: o atacante desliga o trigger de `admin_audit_log` e apaga rastros. Mesmo só com a credencial `vuumbora_api`, ele faz `INSERT INTO admin_users` (hash bcrypt próprio, papel `dono`) e `INSERT INTO admin_enrollment_tokens` (hash conhecido): cria um dono com 2FA dele. A camada 2 da migração 0012 só vale contra SQL injection ou vazamento isolado da credencial de runtime, e a segunda hipótese é perdida pela primeira.
- Correção: (a) migrar e rodar retenção como tarefa separada do Easypanel (serviço/comando único com a credencial dona), e a API de runtime sem `MIGRATION_DATABASE_URL`; se for inevitável migrar no boot, `delete process.env.MIGRATION_DATABASE_URL` logo depois; (b) `REVOKE INSERT, UPDATE, DELETE ON admin_users FROM vuumbora_api` e `REVOKE INSERT ON admin_enrollment_tokens` (a API só consome e lê; `create-admin` e `reissue-2fa-enrollment` passam a usar a credencial dona, o que também corrige o comentário do script que diz "credencial dona" mas lê `DATABASE_URL`); (c) migração nova com `REVOKE` para cada tabela que for só leitura para a API. A decisão sobre (a) é da Vulcano.

### I-4. Cadastro sem verificação prévia permite "reservar" o e-mail de terceiro e preparar sequestro da conta (pre-account takeover)
- Onde: `repositories/identity-repository.ts:21-43` (qualquer e-mail livre vira conta; `UNIQUE (account_type, email)` devolve 409 para o dono verdadeiro), `migrations/0014_create_email_codes.sql:111-114` (`password_reset` em conta não verificada devolve `email_not_verified` e a rota responde 200 sem enviar nada), `identity-retention.ts:54-69` (conta não verificada nunca é apagada).
- Cenário 1 (ocupação): o atacante cadastra `vitima@gmail.com` como passageiro e como motorista; quando a pessoa tenta se cadastrar recebe 409, o "esqueci a senha" responde 200 e não envia nada (conta não verificada), e ela só sai disso se descobrir o "reenviar verificação". Cenário 2 (pre-hijack): se a pessoa então verifica o e-mail pelo reenvio, a conta passa a "verificada" com a SENHA DO ATACANTE; ele entra e a conta vive com a pessoa dentro. O texto do e-mail ("se não foi você que criou a conta, ignore") mitiga o 2, mas o 1 independe de qualquer ação da vítima.
- Correção: (a) cadastro sobre conta NÃO verificada do mesmo (tipo, e-mail) substitui nome, senha e telefone e reemite o código (a ocupação deixa de existir); (b) ao verificar o e-mail de conta criada por senha, exigir que quem verifica defina/confirme a senha na mesma chamada (ou invalidar a senha antiga e forçar `reset-password` após verificar); (c) apagar contas não verificadas após 3 a 7 dias na rotina de retenção (também resolve LGPD: e-mail, nome e telefone de terceiros coletados sem posse do e-mail).

### I-5. O cadastro e o "esqueci a senha" servem de canal de e-mail para terceiros e esgotam a cota do SMTP; os limites por e-mail e por IP são contornáveis
- Onde: `auth-config.ts:28-33,38` (5 por e-mail/h, 30 cadastros e 20 pedidos de código por IP/h); `identity-service.ts:102-106` (chave do limite = e-mail bruto); `routes/auth-http.ts:24` (a chave por IP usa o endereço completo); `lib/identity-mail.ts:5-14` (nome do usuário na saudação); não há limite global de e-mails nem CAPTCHA.
- Cenário: (1) alvo único: `vitima+1@gmail.com`, `+2`, ... passam como e-mails diferentes e driblam o teto por e-mail (só o de 30/h por IP restringe); com IPv6, um /64 dá 2^64 "IPs" para o teto por IP e para o `@fastify/rate-limit`; (2) cota global: sem teto de e-mails por hora/dia, poucas dezenas de IPs consomem a cota diária do provedor (planos gratuitos têm centenas por dia), o que derruba verificação e redefinição para todo mundo e pode suspender a conta do provedor; (3) conteúdo: o primeiro "nome" (até 120 caracteres, `identity-mail.ts:5-9`) é do atacante e vai dentro de um e-mail legítimo do domínio, ex.: `Olá, https://phishing.exemplo/x!`; só caracteres de controle ASCII são tirados.
- Correção: (a) teto global (e-mails/h e /dia) com disjuntor que pausa o envio de cadastro e deixa só a redefinição para contas verificadas; (b) CAPTCHA (ex.: Turnstile) em cadastro e "esqueci a senha"; (c) normalizar a chave do limite (remover `+tag`, pontos do Gmail) sem alterar o e-mail gravado; (d) agrupar IPv6 por /64 na chave do limite por IP e no `keyGenerator` do rate-limit; (e) saudação só com letras, hífen e apóstrofo, até 30 caracteres, senão "Olá!"; (f) SPF, DKIM e DMARC do domínio remetente (não verificável aqui).

### I-6. Bloqueios por conta continuam permitindo travar a vítima de propósito (apps: teto global de 20; admin: 10 em 15 min)
- Onde: `identity-service.ts:182-190` + `auth-config.ts:25` (a chave global bloqueia mesmo com a senha certa, porque a reserva vem antes do bcrypt); `admin-auth-service.ts:101,117-123` (10 falhas por e-mail, qualquer IP, também para e-mail inexistente).
- Cenário: quem sabe o e-mail ou o ID público da vítima manda 5 tentativas erradas de 4 IPs (ou de 1 só, se o endereço rodar por IPv6 /64) a cada 15 min: o chaveamento por (identificador + IP) não ajuda quando é o teto global que fecha. Custo do atacante: ~1,3 requisição por minuto. No admin, o dono pode ficar sem entrar enquanto o ataque durar, e o procedimento de destravar é SQL manual (`break-glass-admin.md`).
- Correção: trocar o bloqueio duro do teto global por atraso crescente e CAPTCHA entre 5 e N (N alto, ex.: 100), e/ou isentar do teto global o par (identificador + IP/instalação) que já teve login bem-sucedido nos últimos 30 dias (o hash já existe em `login_attempts`, só precisa de retenção maior para esse registro); alerta ao titular no bloqueio. Para o admin: mesma ideia (teto por e-mail alto + atraso; por IP continua baixo). Se o dono aceitar o risco, registrar como decisão em `decisoes-do-dono.md`.

### I-7. Código de 6 dígitos de redefinição sem teto cumulativo por conta
- Onde: `0014_create_email_codes.sql:36` (`max_attempts` = 5 por código), `:125-133` e `auth-config.ts:38` (até 5 códigos/h); `account-recovery-service.ts:122-136`.
- Cenário: 5 códigos por hora × 5 palpites = 25 palpites/h por conta; 600/dia; sobre 1.000.000 de possibilidades, ~0,06% por dia e ~1,8% por 30 dias de ataque contínuo contra UMA conta (que recebe 5 e-mails por hora, o que a faz notar, mas não impede). Com a rotação de IPs de I-5, atacar muitas contas em paralelo é viável. Resultado do acerto: troca de senha e tomada da conta.
- Correção: teto cumulativo de falhas por conta e finalidade em janela longa (ex.: 10 falhas em 24 h bloqueiam a redefinição por 24 h e avisam o titular) e/ou código de 8 dígitos para `password_reset`; e-mail "sua senha foi alterada" após `reset_password_with_code` (hoje não existe aviso).

### I-8. O painel `apps/admin` é servido sem cabeçalhos de segurança
- Onde: `apps/admin/nginx.conf:1-43` (nenhum `add_header` de segurança; o Helmet só cobre a API).
- Cenário: o `csrfToken` vive em memória JS (`api/csrf.ts:22-38`) e a sessão é cookie `httpOnly`; sem CSP, qualquer XSS no painel (dependência de terceiros comprometida, por exemplo) lê o token e dispara as mutações de dono, e a página pode ser embutida em quadro de outro site. Os códigos de recuperação do 2FA passam por esta página.
- Correção: no `nginx.conf` ou no Traefik: `Content-Security-Policy` (`default-src 'self'`; `connect-src 'self' https://api.vuumbora.com.br`; `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` mínima, e confirmar HSTS no proxy.

---

## SUGESTÃO

### S-1. Guarda de SSRF do SMTP: sólida; faltam faixas IPv6 de transição e o resto é higiene
- Provado (módulo real, `tsx`): `localhost`, `127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `169.254.169.254`, `10.0.0.1`, `localtest.me` (DNS apontando para loopback) → bloqueados; `smtp.gmail.com` e `1.1.1.1` → permitidos. O guarda checa os IPs resolvidos, não o texto digitado; todo endereço do nome precisa ser público (`smtp-host-guard.ts:79`); a conexão usa o IP aprovado (`mailer.ts:145-148`) e o nodemailer 10 não resolve de novo quando recebe IP (verificado em `smtp-connection/index.js`), então rebinding entre checagem e conexão não existe; o TLS valida o nome digitado via `tls.servername` (`mailer.ts:164`), inclusive no STARTTLS (`_upgradeConnection` copia `servername`). Formas como `2130706433`, `0x7f.1`, `127.1` ficaram "não resolve" no Windows desta máquina; em Linux/musl o `getaddrinfo` devolve `127.0.0.1` e a guarda bloqueia depois da resolução. Em ambos os casos o resultado é seguro.
- Lacuna 1: `::7f00:1` (IPv4-compatível) e `2002:7f00:1::` (6to4) passaram como PERMITIDOS no teste (`smtp-host-guard.ts:32-41`). Sem rota IPv4 embutida num host típico de Easypanel o risco prático é baixo, mas é barato fechar: `::/96`, `2002::/16`, `2001::/32` (Teredo), `64:ff9b:1::/48`, `fec0::/10`, `192.88.99.0/24`.
- Lacuna 2: a restrição de portas (25/465/587/2525, `email-settings.ts:35`) vale só na gravação; o envio não rechecha (a porta do ambiente é do operador, então o risco é só de defesa em profundidade). Se o host é do ambiente (isento da guarda, aceitável) e a porta vem do painel, o dono varre 4 portas do relé interno.
- Lacuna 3: `serverMessage` (`admin-email-settings-route.ts:80`) é texto de servidor controlado por quem digitou o host; o React escapa (`TestEmailPanel.tsx:37-43`), mas não há limite de tamanho nem de caracteres. Cortar em ~500 caracteres e remover controles. O `redact` (`mailer.ts:114-116`) só cobre a senha em texto puro, não em base64.
- Lacuna 4: se o 1º IP resolvido não responde (ex.: IPv6 sem rota), não há tentativa nos demais; é usabilidade, não segurança.

### S-2. Reuso da `ADMIN_TOTP_ENCRYPTION_KEY` para a senha SMTP: aceitável hoje, com ressalvas
- Resposta direta: sim, é aceitável. O AAD separa os domínios de verdade: o TOTP usa o UUID do admin (`admin-two-factor-service.ts:98,223`) e a senha SMTP usa a constante `email_settings:smtp_password` (`mailer.ts:71`); um texto cifrado copiado entre tabelas não decifra (GCM autentica o AAD), e um UUID nunca é igual à constante.
- Ressalvas: (1) o raio de dano de um vazamento da chave passa a incluir a senha do SMTP (e o acesso à caixa do remetente); (2) a rotação fica acoplada: trocar a chave para rodar o 2FA quebra a senha SMTP e, como o SMTP envia os códigos dos apps, derruba verificação e redefinição até o dono redigitar a senha (`password_unreadable`, `mailer.ts:93-97`); (3) um nome de variável `ADMIN_TOTP_*` para a senha do SMTP confunde quem opera. Sugestão: HKDF com contexto (`totp:v1`, `smtp:v1`) a partir de uma chave-mestra única, com prefixo de versão/`kid` no texto cifrado (o formato `v1.` já existe), ou uma segunda chave.
- Endurecimento em `decryptSecret` (`lib/secret-box.ts:27-34`): travar IV em 12 bytes e `authTagLength: 16` (hoje aceita tag curta) e validar o base64 da chave (`env.ts:154` aceita lixo: B-6c).

### S-3. O usuário SMTP vai em claro para a trilha de auditoria imutável
- `admin-email-settings-service.ts:112,116`. Alguns provedores usam o token da API como usuário (e senha). Como `admin_audit_log` não permite apagar (migração 0012), um segredo gravado ali fica para sempre. Gravar só `userChanged: true/false` ou o usuário truncado/mascarado.

### S-4. `SMTP_ALLOW_INSECURE_DEV` e `NODE_ENV` divergem entre módulos
- `lib/email-env.ts:36-38` trata `NODE_ENV` ausente como "não produção", enquanto `env.ts:15` usa `production` como padrão e o Dockerfile fixa `NODE_ENV=production` (`apps/api/Dockerfile:43`). Em produção atual não há exposição, mas basta uma imagem sem a variável. Usar `env.NODE_ENV` e aceitar a flag só em `development`/`test`.

### S-5. Enumeração por tempo no "esqueci a senha" e no reenvio: canal existe, mas não revela nada novo
- `account-recovery-service.ts:54-84`: para conta que existe, a resposta aguarda `issue_email_code` e `insertAccessLog` (2 consultas a mais); só o envio do e-mail vai para segundo plano. A diferença de poucos milissegundos é mensurável com amostras suficientes, mas o cadastro (409 explícito por decisão do dono, `auth-route.ts:75-77`) entrega a mesma informação de forma exata, com o mesmo teto. Se um dia o cadastro passar a responder de modo genérico, mover TODA a emissão (não só o envio) para `runInBackground`. `verify-email` também difere (`invalid` com `attemptsLeft` só para conta com código vivo, `expired` para o resto): mesma observação.

### S-6. Token de ativação do 2FA: desenho correto; endurecimentos operacionais
- Correto: 100 bits (`admin-enrollment-token-service.ts:22-25`), só o SHA-256 no banco, uso único por `UPDATE ... WHERE used_at IS NULL` (`admin-enrollment-token-repository.ts:27-35`), consumido na mesma transação do 2FA, reemitir apaga os anteriores, auditoria sem o token (`reissue-2fa-enrollment.mjs:78-81`).
- Stdout (`create-admin.mjs:147-153`, `reissue-2fa-enrollment.mjs:84-86`): se o script rodar fora de terminal interativo (tarefa agendada, `docker exec` sem TTY, "run command" do Easypanel), o token vai para o log do contêiner. Recusar imprimir quando `!process.stdout.isTTY` (salvo `--print-token`) e documentar onde NÃO rodar.
- TTL de 48 h é longo para uso único (a reemissão é trivial): 24 h ou menos.
- `--password=` em `create-admin.mjs:120` fica no histórico e em `ps`; o §5 do `break-glass-admin.md` manda a senha em `argv`. Trocar por entrada oculta/`stdin` e criar um `reset-admin-password.mjs`.
- `create-admin` não grava nada em `admin_audit_log` (criar um dono é o evento mais sensível do painel). Gravar `admin.created` (com `via: script`).

### S-7. Lacunas de retenção depois da correção de M-5
- `admin_sessions` (IP, user-agent e `csrf_token` em texto) nunca expira fisicamente: só é apagada em logout, em troca de 2FA ou por script (`admin-session-repository.ts:85-100`). `admin_login_failures` e `admin_login_challenges` só são limpas de forma oportunista no próximo login. Contas não verificadas: ver I-4. `admin_audit_log.ip_address` fica em claro sem prazo (decisão registrada como do dono). O cron do script de retenção não é verificável pelo código.
- Incluir na rotina: `admin_sessions` vencidas (`absolute_expires_at < now()`), `admin_enrollment_tokens` usados/vencidos, contas não verificadas.

### S-8. `trustProxy` por número de saltos: certo para Traefik com 1 salto; mais forte com CIDR
- `lib/trust-proxy.ts:23-25`: se a porta da API também ficar alcançável sem passar pelo Traefik (publicada no host, rede Docker compartilhada), o socket do atacante é "o salto confiável" e o `X-Forwarded-For` que ele manda vira o IP. Com a rede do Easypanel conhecida, preferir `TRUST_PROXY=<CIDR da rede do Traefik>`. Com CDN na frente seriam 2 saltos; com saltos errados o IP real muda para o do CDN e todos compartilham o mesmo balde do rate limit. Confirmar em produção (ver "Não foi possível verificar").

### S-9. Higiene do papel restrito (B-6a/b)
- Trocar `ALTER ROLE ... PASSWORD` por `\password vuumbora_api` em `docs/sql/ativar-papel-api.sql:6`; adicionar `REVOKE CREATE ON SCHEMA public FROM PUBLIC` e um `ALTER DEFAULT PRIVILEGES ... REVOKE` para tabelas só-leitura da API; `ALTER DEFAULT PRIVILEGES` só vale para tabelas criadas pelo MESMO usuário que o rodou (a migração): confirmar que o dono que migra é esse.

### S-10. O contêiner da API roda como root
- `apps/api/Dockerfile:41-55` não define `USER`. Adicionar `USER node` (a imagem `node:22-alpine` já o traz) depois de copiar os arquivos; os scripts do runtime não precisam de root.

### S-11. Promoção de papel mantém sessão antiga sem 2FA (B-6e)
- Não há rota de troca de papel (só SQL), então é risco de procedimento: quem promove alguém a `dono`/`financeiro` por SQL deve apagar as sessões dele na mesma operação, e o guia `break-glass-admin.md` deve dizer isso. Alternativa de código: `requireAdminRole` de papéis que exigem 2FA conferir que existe 2FA confirmado, não só o papel.

### S-12. Código de recuperação na área de transferência e no disco
- `RecoveryCodesPanel.tsx:54-77` copia/baixa os códigos em texto. É uma escolha de usabilidade razoável (o aviso na tela é claro e o texto diz "cofre ou impresso"); só registrar que histórico de área de transferência do Windows os retém.

---

## O que foi verificado e está correto (por área)

- **SMTP:** STARTTLS obrigatório com `requireTLS` fora de 465 e fora do modo dev, TLS ≥ 1.2, validação do certificado pelo nome (`mailer.ts:156-165`); injeção de cabeçalho: CRLF no nome do remetente sai codificado (RFC 2047), U+2028 e `\s` barrados por `ADDRESS` (`email-settings.ts:50`), `to` do teste validado; limite de 5/h por admin sob `pg_advisory_xact_lock`, contado na trilha imutável, falha de envio gasta tentativa (`admin-email-settings-service.ts:148-176`); senha nunca devolvida, nunca em log (`mailer.ts:11,183-187`), nem na auditoria; só `dono` (`:21`) com CSRF; portas do painel restritas; host em branco no painel volta ao ambiente.
- **Identidade:** códigos em HMAC com pepper amarrado a finalidade e conta; regras de uso único, expiração, 5 tentativas e reenvio no banco (0014); `reset_password_with_code` troca a senha e revoga TODAS as sessões na mesma transação; reenvio e "esqueci a senha" respondem igual para conta inexistente, não verificada ou fora do intervalo; bcrypt sempre executado na redefinição; nenhum código, e-mail ou senha nos logs (`auth-http.ts:41-44`, `safe-error.ts`); contas sem e-mail verificado não abrem sessão por trigger (0011), nem renovam, nem passam em `isSessionLive`.
- **Admin:** contador de falhas por conta reservado ANTES do bcrypt, sob lock por e-mail, devolvido no acerto, e-mail inexistente conta igual (`admin-login-failure-repository.ts`, `admin-auth-service.ts:117-137`); reautenticação por senha no mesmo contador; desafio de login de uso único; replay de TOTP barrado; códigos de recuperação com 50 bits e hash; `consumeEnrollmentToken` atômico.
- **Frontend `apps/admin`:** `csrfToken` só em variável de módulo (`api/csrf.ts:22-38`), limpo no logout e em 401, enviado no cabeçalho só fora de GET (`client.ts:116-119`); `challengeToken` só em estado de componente; códigos de recuperação só em props, sem storage (`RecoveryCodesPanel.tsx`); único uso de `sessionStorage` é a sessão do modo mock, que o `vite build` recusa em produção; `serverMessage` renderizado como texto; sem `dangerouslySetInnerHTML` nem `document.cookie` no código buscado.
- **Segredos:** sem chave privada, token ou senha hardcoded em arquivo versionável (busca por padrões em todo o repositório, fora de `node_modules`/`dist`); `.env` ignorado e nenhum `.env` versionado.
- **Dependências:** `npm audit --omit=dev` sem vulnerabilidade em `apps/api` e `apps/admin`; nodemailer 10.6.1.

---

## Não foi possível verificar

1. Se o Traefik do Easypanel REESCREVE ou ACRESCENTA ao `X-Forwarded-For` e quantos proxies há de fato em produção; se a porta da API é alcançável sem o proxy. Teste de 1 minuto: `curl -H "X-Forwarded-For: 1.2.3.4" https://api.vuumbora.com.br/healthz` e ver o IP que o log do admin grava (`remoteAddress`).
2. Se `api.vuumbora.com.br` tem registro AAAA (IPv6): muda o peso de I-5 e I-6.
3. Se o `vuumbora_api` está ativo e a `DATABASE_URL` aponta para ele; versão do Postgres de produção.
4. Onde o stdout dos scripts é gravado no Easypanel (S-6); se o cron do `identity:retention` foi criado.
5. Execução: não rodei a suíte (precisa de Postgres; o CI roda), não executei as funções SQL da 0014 nem a concorrência (advisory lock, `FOR UPDATE`). Rodei apenas as verificações isoladas da tabela do início. Em particular, a corrida de `issue_email_code` e `consume_email_code` e o limite de 5/h estão certos no papel, não provados em banco.
6. Comportamento do `getaddrinfo` do contêiner de produção (musl) com formas numéricas de IPv4 (S-1); medido só no Windows desta máquina.
7. SPF, DKIM e DMARC do domínio remetente e o provedor SMTP real (cota diária, política de suspensão).
8. Fora do escopo e não auditados: `.github/`, `scripts/backup/` (o backup contém dado pessoal: vale revisão própria de cifragem em repouso e acesso), apps `site`, `passenger` e `driver`, e os artefatos soltos na raiz (`VuumBora_Pre_Lancamento_Web.zip` e pasta homônima, `Imagens_Site/`): não devem entrar no commit sem revisão.
9. Menores de idade: `accounts` não tem data de nascimento nem consentimento (LGPD art. 14). Se passageiros menores de 18 puderem se cadastrar, é decisão do dono (idade mínima e consentimento do responsável); não avaliei porque está fora do código desta fatia.

## Ordem sugerida de correção

1. I-1 e I-2 (Vega; antes de qualquer deploy com SMTP no painel).
2. I-3 (Vulcano e Cronos; decisão do dono sobre onde mora a credencial dona).
3. I-4 e I-5 (Vega, com a decisão do dono sobre CAPTCHA e cota de e-mail), depois I-8 (Vulcano/Lyra).
4. I-6 e I-7 (decisão do dono: custo de disponibilidade contra risco de tomada de conta).
5. SUGESTÕES na ordem S-1, S-3, S-6, S-7, S-2, o resto.
