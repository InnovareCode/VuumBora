# Revisão de segurança S1 — rodada 3 (Órion, 21/11/2026)

Escopo: código COMMITADO em `HEAD ff7af13`. Foco no que a rodada 2 nunca viu: a função `reclaim_unverified_account` (0020), `insertOrReclaimAccount`, a trilha `account_consents` e a idade mínima (0019), e a situação real, no código, de I-8, S-3 e I-6 residual. Rodadas anteriores: `docs/revisao-seguranca-s1.md` e `docs/revisao-seguranca-s1-rodada2.md`.

Severidades (as quatro pedidas): CRÍTICO = corrigir antes de qualquer deploy; ALTO = corrigir antes de abrir ao público (equivale a "IMPORTANTE" das rodadas anteriores); MÉDIO = corrigir em breve; BAIXO = melhoria.

Método e honestidade sobre a prova: leitura de migração e código; nenhum banco foi usado (o da Íris está sendo recriado). O comportamento de gatilho, função e concorrência abaixo vem da leitura e dos testes que já existem em `apps/api/test/` (`identity-age-consent.test.ts`, `identity-hardening.test.ts`, `runtime-role.test.ts`), que eu NÃO executei. Uma única coisa foi medida: o custo do `bcryptjs` (A-1), rodando o módulo real fora do projeto.

## Veredito

**0 críticos · 1 alto · 5 médios · 7 baixos.**

A função 0020, o laço de recadastro, a trilha de aceite e o gatilho de idade estão bem desenhados: não achei jeito de tomar conta alheia, nem de enumerar e-mail pela função, nem laço sem fim, nem de apagar aceite de conta verificada. Os achados novos são de disponibilidade e de qualidade da prova de consentimento, não de tomada de conta.

Liberação: pode seguir para o ambiente de produção FECHADO (sem divulgar o cadastro). Antes de abrir o cadastro ao público: A-1 (CPU do bcrypt), M-4 (HSTS) e a decisão do dono sobre M-2/M-5. M-3 precisa ser resolvido antes de os textos jurídicos entrarem em vigor (hoje o aceite fica indisponível por desenho, 503, até haver versão configurada).

---

## ALTO

### A-1. Nenhum teto global nem de concorrência para o bcrypt: cerca de 70 IPs, a baixa taxa, derrubam a API inteira
- Onde: `bcryptjs` (JS puro, uma thread) em `services/account-recovery-service.ts:144` (`verifyEmail`: compara SEMPRE, antes de qualquer limite por chave), `:158` (`resetPassword`: `bcrypt.hash` é a PRIMEIRA linha, antes de `findCodeTarget`) e `services/identity-service.ts:231` (login: o portão por par vem antes, mas o par é (identificador + IP) e o atacante troca o identificador a cada tentativa). Os limites que sobram nessas rotas são só por IP: `auth-route.ts:47` + `lib/auth-config.ts:63-64` (30 por 15 min por balde) e o global de `app.ts:129-141` (100/min por balde), ambos EM MEMÓRIA do processo. Custo bcrypt: `auth-config.ts:22` (12).
- Medido nesta máquina (`bcryptjs` custo 12, comparação assíncrona): média de 429 ms por comparação; 10 em paralelo levaram 4,3 s no total, ou seja, a fila é serial (uma thread). Capacidade ≈ 2,3 comparações por segundo por processo. Em produção o número muda com a CPU do servidor (estimativa, não medido lá).
- Cenário: 30 requisições por 15 min por IP = 0,033/s por IP. Cerca de 70 endereços IPv4 (proxy residencial, nuvem) já somam 2,3/s e mantêm a fila do processo cheia: login, verificação, redefinição, e também `/healthz` e o login do admin (mesmo processo) passam a responder em dezenas de segundos; o health check falha e o Easypanel pode reiniciar a API. Com IPv6 é pior: o balde é o /64 (`lib/ip-bucket.ts:49-62`), e quem tem um /48 (tunnel broker gratuito) tem 65 536 baldes a partir de UMA máquina.
- Correção (sem reescrever aqui): (1) semáforo global de concorrência para hash/compare (poucas vagas, fila curta, excesso responde 503/429 na hora) — é o que de fato protege o processo; (2) `verify-email` e `reset-password` fazerem a reserva por chave (identificador + balde de IP, como o login) ANTES do bcrypt; (3) trocar para bcrypt nativo ou argon2 fora da thread principal (é o B-5 da rodada 1, que agora tem justificativa de disponibilidade); (4) camada de borda: middleware de rate limit do Traefik por IP e, para IPv6, um segundo balde mais grosso (/48); (5) teste de carga com a lista de espera de requisições medida, não deduzida.

---

## MÉDIO

### M-1. I-6 residual (botnet): o freio por par não limita a adivinhação de senha de UMA conta, e a senha não tem lista de bloqueio
- Onde: `lib/progressive-delay.ts:12-18` (o próprio comentário registra o custo: 13 tentativas na 1ª hora e 105 em 24 h POR PAR; N IPs = N vezes), `identity-service.ts:215-227` (chave = tipo + identificador + IP), `domain/auth.ts:18-21` (senha: mínimo 8, sem lista de senhas comuns).
- Situação real: o desenho da decisão do dono (21/11, atraso progressivo, nunca trancar o titular) está implementado e correto no código, para apps (`identity-repository.ts:301-337`) e para o admin (`admin-login-failure-repository.ts`). O que continua sem resposta é o botnet. Conta: 1 000 IPs × 105 = 105 mil tentativas por dia contra uma conta; o teto real vira a CPU do servidor (≈ 2,3/s medido em A-1, cerca de 200 mil por dia por processo). Qualquer conta com senha entre as 100 mil mais comuns cai em um dia. Para o admin isso é contido pelo 2FA (bloqueio de 15 min do TOTP); os apps não têm 2FA.
- Cenário concreto: atacante sabe o e-mail de um motorista, roda 200 IPs durante um dia contra `/v1/auth/login` e acerta uma senha comum; a conta tem sessão de 90 dias (teto absoluto) e, no futuro, dados de pagamento/repasse.
- Correção: (a) lista de bloqueio de senhas comuns/vazadas no cadastro e na redefinição (NIST 800-63B §5.1.1.2) — é a defesa que o próprio comentário do `progressive-delay.ts` ("a força da senha faz o resto") assume e que não existe no código; (b) detector sem trancar: contar quantos baldes de IP DISTINTOS erraram para o mesmo identificador na última hora (hoje só existe o hash do par, então falta guardar um hash só do identificador); acima de um limiar, exigir dispositivo já conhecido (`installationId` de um login anterior) ou CAPTCHA e avisar o titular por e-mail. Isso não tranca o titular que usa o aparelho dele. (c) Se o dono aceitar o risco como está, registrar em `decisoes-do-dono.md` com o número (105 por par por dia).

### M-2. Terceiro que sabe o e-mail apaga o cadastro pendente da pessoa e queima o código dela (griefing de onboarding)
- Onde: `identity-repository.ts:56-90` (cada recadastro do mesmo e-mail apaga a conta pendente anterior via `0020:38-51` e cria outra: vence quem chegou por último); `account-recovery-service.ts:142-147` (senha errada = código errado: consome uma das 5 tentativas do código VIVO de qualquer conta, sem exigir nenhuma prova de quem chama; `0018:167-177` fecha o código na 5ª); `auth-config.ts:31` e `identity-service.ts:116` (5 cadastros por hora por (tipo + e-mail canonical), contando também as tentativas da vítima).
- Confirmação por teste existente: `identity-hardening.test.ts` ("5 senhas erradas queimam o código como 5 códigos errados").
- Cenário: a vítima começa o cadastro (conta pendente, código no e-mail). O atacante, que só precisa do e-mail: (1) recadastra o mesmo e-mail e a conta e a senha da vítima somem (a vítima ainda recebe um e-mail com código novo, que não serve para a senha dela); ou (2) manda 5 verificações erradas e o código da vítima morre; a vítima pede outro (mínimo 60 s entre pedidos, 5 por hora) e o atacante queima de novo. Com 25 requisições por hora de UM IP o atacante mantém a pessoa fora do cadastro, e as 5 tentativas por hora dele esgotam a cota de cadastro da vítima (429 para ela por 1 h).
- Sem tomada de conta: o I-4b (verificar exige a senha do cadastro) impede que a vítima verifique a conta do atacante, confirmado em `account-recovery-service.ts:144-147`. É uma falha de disponibilidade direcionada, o mesmo padrão do I-6 que o dono já escolheu não aceitar para o login.
- Correção (decisão de produto, trade-off com I-4): (a) não substituir cadastro pendente enquanto o código dele ainda estiver vivo (últimos ~15 min) — a "ocupação" volta, mas só por 15 min, não para sempre; (b) contar as falhas de verificação por (conta + balde de IP) em vez de só por código, para um IP não queimar o código dos outros, com um teto global maior como rede; (c) manter o teto por e-mail canonical mas sem contar as tentativas da própria vítima (ou separar chave por IP).

### M-3. O aceite registra "a versão vigente do servidor", não a versão que a pessoa viu; a versão é só um rótulo
- Onde: `domain/auth.ts:27-41` (o cliente manda só `termsAccepted`/`privacyAccepted` = `true`; a versão não vem dele), `lib/auth-config.ts:55-56,122-125` (versão = variável de ambiente), `identity-service.ts:152`, `identity-repository.ts:110-119`, `0019:158,163` (coluna `version`: texto livre com CHECK de formato).
- Cenário: o app (ou a página) publicado mostra os Termos v1; o servidor sobe com `AUTH_TERMS_VERSION=v2` antes de o app novo chegar às lojas. Quem cadastra com o app antigo fica registrado como "aceitou v2" sem ter visto v2. Também não há hash do texto: o rótulo "v1" pode ser reaproveitado com texto editado, e não existe histórico de quando a "versão vigente" mudou (só a variável de ambiente). Em disputa (LGPD art. 8º §2º: o ônus de provar é do controlador) a linha prova que a API gravou um rótulo, não que aquele texto foi apresentado.
- O que está certo: a versão não é decidida pelo cliente (um cliente malicioso não escolhe), a data é do banco (`0019:182`), cadastro sem versão configurada fica indisponível (503, fail-closed, `identity-service.ts:134`).
- Correção: tabela de versões publicadas (`documento`, `versão`, `sha-256 do texto`, `publicada em`) e o aceite referenciando-a; o cliente envia a versão que exibiu e o servidor recusa se divergir da vigente (409 `consent_outdated`), com o app recarregando o texto; definir o fluxo de reaceite para contas antigas quando a versão mudar (hoje não existe consulta "esta conta aceitou a vigente?"). Como os textos ainda não existem, isto cabe antes deles, sem migração de dados.

### M-4. I-8 (HSTS) segue aberto: não está no código nem em nenhum guia de operação; o site público não tem nenhum cabeçalho de segurança
- Onde: `apps/admin/nginx.conf:79-80` (comentário: "HSTS não está aqui de propósito... quem deve enviá-lo é o Traefik"), `apps/site/nginx.conf:1-39` (nenhum `add_header` de segurança). Busca em `docs/` e nos Dockerfiles: HSTS só aparece nesse comentário e no relatório da rodada 2; `docs/producao-passo-a-passo-dono.md` não tem o passo nem a conferência (`curl -sI ... | grep -i strict`).
- O que foi resolvido (confirmado no código): CSP completa, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` no admin, todos no nível do `server` (nenhum `location` tem `add_header`, então a herança do nginx não os zera), com `always`. A API manda HSTS pelo Helmet 7.2 (`app.ts:115`, padrão de 180 dias com `includeSubDomains`), só para o host `api.`.
- Cenário: o dono digita `admin.vuumbora.com.br` sem `https://`; numa rede hostil (wi-fi público) o primeiro pedido é HTTP e quem está no caminho faz SSL strip e entrega um painel falso que repassa senha e TOTP em tempo real. O cookie `Secure` não ajuda, porque o navegador nunca chega a HTTPS.
- Correção: no mesmo `nginx.conf` do admin (e do site), `add_header Strict-Transport-Security ... always` — funciona atrás do Traefik porque o navegador ignora o cabeçalho em HTTP —, começando por `max-age` curto e subindo (5 min, 1 semana, 1 ano), `includeSubDomains` só depois de confirmar que `painel.`, `api.`, `admin.` e `www.` são todos HTTPS. Acrescentar a conferência ao guia do dono. Para o site: pelo menos `X-Content-Type-Options`, `Referrer-Policy` e `frame-ancestors` (CSP precisa de teste com o conteúdo real).

### M-5. O teto global de e-mails de verificação (100 por hora) é um interruptor: 4 IPs desligam todo cadastro e reenvio
- Onde: `lib/email-budget.ts:21-29`, `auth-config.ts:48`, `identity-service.ts:117` (a mesma chave global vale para cadastro e reenvio); por IP: `auth-config.ts:32` (30 cadastros/h) e `:63-64`.
- Cenário: 4 IPs fazendo 30 cadastros/h cada (com e-mails descartáveis, qualquer um) consomem os 100 do balde; a partir daí TODO cadastro e reenvio de código de qualquer pessoa responde 429 até o atacante parar. Login, redefinição (balde separado) e contas já verificadas seguem. Custo do ataque: ~100 requisições por hora.
- É o trade-off declarado no código ("protege a cota do provedor"), mas o custo do ataque (4 IPs) provavelmente não consta da decisão do dono; vale registrar. Proporcional ao I-5, que o dono já decidiu não resolver com CAPTCHA.
- Correção: sub-teto por balde de IP dentro do global (um IP não consome mais que, por exemplo, 10% do balde); CAPTCHA só quando o balde passar de 50% (não "sempre"); alerta ao operador quando o balde encosta no teto; e o dono precisa saber que a cota real do provedor SMTP é o que define o 100.

---

## BAIXO

### B-1. S-3 (usuário SMTP em claro na trilha imutável) continua exatamente como estava
- Onde: `services/admin-email-settings-service.ts:156` (`before.user`) e `:160` (`after.user`) gravam o usuário em `admin_audit_log`, que o banco não deixa apagar (0012). O resto da auditoria está certo (senha nunca; só `changedFields` e `passwordChange`).
- Cenário: provedores que usam o token como usuário (alguns relays transacionais) deixam um segredo para sempre numa tabela que nem o dono apaga.
- Correção: gravar `userChanged: true/false` (ou o usuário mascarado). Fazer antes do primeiro uso real: depois, não há como limpar.

### B-2. `account_consents.ip_hash`: a minimização prometida não existe, e o hash de IPv4 é reversível se o pepper vazar
- Onde: o gatilho permite zerar o `ip_hash` (`0019:186-193`) e o comentário promete "apagar depois de um prazo" (`0019:56-60`), mas `lib/identity-retention.ts:61-84` não tem esse passo e a API não tem UPDATE (`0019:224-225`); só o operador com a credencial dona poderia. O `access_log` guarda o IP por 90 dias; o aceite guarda o hash para sempre. O hash é HMAC com pepper de 32+ caracteres (`auth-http.ts:25`), mas IPv4 tem só 2^32 valores: com o pepper, o espaço inteiro se reverte em minutos.
- Correção: passo na retenção (credencial dona) que zera `ip_hash` após um prazo decidido pelo dono (ex.: 12 meses), ou declarar o prazo na Política de Privacidade; tratar o pepper como segredo de privacidade, não só de limite de taxa.

### B-3. Ordem de travas invertida entre o recadastro e a verificação (deadlock raro) e nenhum `lock_timeout`
- Onde: `0020:38-51` trava `accounts` (FOR UPDATE) e depois apaga os códigos em cascata; `0018:143-147,181-185` (`consume_email_code`) trava o código e depois dá UPDATE em `accounts`. Duas transações na mesma conta, no mesmo instante, formam ciclo: o Postgres aborta uma (40P01) e a rota devolve 503 (`auth-http.ts:34`). Janela de microssegundos; não provado em banco. `issue_email_code` trava na ordem da 0020 (conta, depois códigos), só `consume` é invertida. `db.ts:5-10`: pool de 5 conexões e sem `lock_timeout`/`statement_timeout`.
- Correção: em `consume_email_code`, travar `accounts` antes do código (a ordem de `issue_email_code` e da função 0020); definir `lock_timeout` e `statement_timeout` na conexão (ou como atributo da função 0020).

### B-4. Recadastro não deixa trilha durável
- Onde: `identity-repository.ts:8-11` (lista de eventos) e `0011:238-243` (CHECK de `event`): não existe evento de substituição; só `auth-route.ts:87` loga `reclaimed: true` no stdout. A conta substituída vira `access_log.account_id = NULL` (`ON DELETE SET NULL`). Um abuso em massa de M-2 só aparece em log efêmero.
- Correção: evento `register_reclaimed` (exige migração nova no CHECK) com o `account_id` da conta nova e o `ip_hash`.

### B-5. Endurecimento da função SECURITY DEFINER
- O desenho está certo e foi provado por teste (`runtime-role.test.ts:219-224`: `PUBLIC` sem EXECUTE, API com): corpo fixo sem SQL dinâmico, `search_path = public, pg_temp` (`0020:33`; `pg_catalog` vem implícito primeiro), só conta ativa, nunca verificada, do (tipo, e-mail) exato, EXECUTE só para `vuumbora_api` e dono, e `email_verified_at` nunca volta a NULL (nada no código o zera), então conta verificada jamais vira alvo.
- Restos: (a) o dono da função é quem migra; se for superusuário (padrão do banco gerenciado do Easypanel), a função roda como superusuário. Recomendar dono não-superusuário. (b) Qualificar `public.accounts` ou fixar `pg_catalog, public`. (c) `REVOKE CREATE ON SCHEMA public FROM PUBLIC` (S-9 da rodada 2, ainda aberto: em Postgres ≤ 14 qualquer papel cria objeto em `public`; o CI usa 18, produção não verificável).

### B-6. Verificação de e-mail sem teto cumulativo, e o oráculo de "cadastro pendente"
- Onde: o teto cumulativo da 0018 só vale para `password_reset` (`0018:89-90,155-159`). Para `verify_email`, o limite por e-mail canonical (5 cadastros + 5 reenvios por hora, por tipo) dá até ~50 palpites por hora por tipo, ou ~72 mil por mês nos dois tipos: ≈ 7% de chance de acertar um código de 6 dígitos em 30 dias de ataque contínuo ao mesmo e-mail (a vítima recebe 10 e-mails por hora). Ganho do atacante: uma conta VERIFICADA no e-mail da vítima com a senha dele; a vítima recupera pelo "esqueci a senha" (a redefinição revoga as sessões). Impacto limitado, por isso baixo.
- Oráculo: `verify-email` responde `invalid` + `attemptsLeft` só para conta pendente com código vivo, e `expired` para o resto (`account-recovery-service.ts:142-149`). A premissa de S-5 da rodada 2 ("o cadastro entrega a mesma informação") deixou de valer para contas PENDENTES: o cadastro agora responde 201 igual para e-mail livre e pendente, e quem sonda por `verify-email` descobre quem está no meio de um cadastro (e queima uma tentativa, ver M-2).
- Correção: estender o teto cumulativo a `verify_email`; resposta idêntica de `verify-email` para conta pendente e inexistente (a contagem de tentativas pode continuar internamente).

### B-7. Idade é autodeclarada; formulários públicos não registram idade nem aceite
- Onde: `domain/birth-date.ts` (valida calendário e 18 anos, em paridade com o gatilho: confirmei por leitura que a conta do corte, a regra de 29/02 e o fuso de Natal batem entre JS e SQL). Quem mente a data passa; é limitação conhecida de qualquer cadastro sem documento. Já `routes/driver-application-route.ts:17-57` (candidatura de motorista) e a lista de espera coletam nome, telefone, e-mail e cidade sem idade e sem registro de aceite/versão (nem `account_consents`, que só existe para `accounts`).
- Correção: decisão do dono: se a regra de 18 anos vale também para quem se candidata, o formulário precisa de declaração + aceite com versão (mesma tabela de M-3); se não, registrar que o dado de menor eventualmente coletado ali segue o prazo de retenção do formulário. A idade de motorista só tem prova real quando a CNH for validada (fase de documentos).

---

## Respostas diretas às quatro perguntas

**a) Função 0020 (SECURITY DEFINER).** `search_path` fixo, sem SQL dinâmico, EXECUTE só para a API e o dono (`PUBLIC` revogado e testado), apaga só conta ativa e nunca verificada do (tipo, e-mail) exato. Tomar conta alheia: não. Para apagar a conta verificada de alguém seria preciso `email_verified_at` voltar a NULL, e nada no código faz isso. Enumerar e-mail pela função: não; devolve só um booleano e só é alcançável pelo SQL da API (que já tem SELECT em `accounts`). O que a função permite, indiretamente pela rota pública, é apagar o cadastro PENDENTE de alguém que o atacante conhece (M-2). Restos de endurecimento em B-5.

**b) `insertOrReclaimAccount`.** Laço limitado (6 voltas aqui e 3 no serviço, só em colisão de `public_id`); depois de 6 derrotas seguidas vira 503 com log (`identity-repository.ts:90`). Corrida: os ramos que examinei (vencedor insere, perdedor vê a linha sumida e tenta de novo; `consume` vencendo faz a função devolver FALSE porque o `FOR UPDATE` reavalia `email_verified_at` e então 409; `reclaim` vencendo faz o `consume` achar o código sumido e devolver `expired`) terminam certos, e o id novo impede que uma verificação em voo valide a conta nova. O teste de 4 cadastros simultâneos cobre o caso comum. A única fragilidade é a ordem de travas (B-3). Existência de conta: o HTTP NÃO revela cadastro pendente (201 igual a e-mail livre; `reclaimed` só vai ao log); revela conta verificada, bloqueada ou excluída com 409, por decisão do dono. Vazamentos laterais: oráculo de `verify-email` (B-6). Tempo: o 201 espera o envio do SMTP (`identity-service.ts:179-185`) e o 409 não, mas o status explícito já entrega a informação.

**c) Trilha de aceite e idade (0019).** Append-only: efetivo contra a API (privilégio, `0019:224-225`) e contra o dono em UPDATE/DELETE diretos (gatilho). A única mutação permitida (`ip_hash` para NULL) compara as 6 colunas (`0019:188-193`). `accepted_at` é sempre o relógio do banco (`0019:182`). O DELETE só passa em cascata (`pg_trigger_depth() > 1` e conta já inexistente); só duas rotinas apagam conta (a função 0020 e a retenção) e as duas só alcançam conta ativa nunca verificada, então aceite de conta verificada nunca some. NÃO barra: TRUNCATE (documentado), DROP/DISABLE do gatilho, `session_replication_role` e o `0019_down.sql` (que avisa que apaga a prova); a camada 2 só fecha se a API conectar como `vuumbora_api` e a credencial dona não estiver no contêiner (I-3: `server.ts:30-32` apaga a variável do `process.env` depois de migrar, o que não esconde de quem lê `/proc/self/environ`). Versão registrada: sim, mas só o rótulo da configuração (M-3). Bypass da idade: o gatilho cobre INSERT e mudança de data; as brechas são só `status = 'deleted'` (a API não cria assim), conta legada sem data (UPDATE passa; produção não tem, confirmar o NOTICE da 0019 no deploy) e `DISABLE TRIGGER` (dono).

**d) Achados abertos da rodada 2.** I-8: CSP e demais cabeçalhos RESOLVIDOS no admin; HSTS ABERTO (M-4). S-3: ABERTO, sem mudança (B-1). I-6: o atraso progressivo está implementado e correto; o residual de botnet segue (M-1) e há um irmão de disponibilidade que o desenho do atraso não alcança (A-1).

---

## Confirmado sem problema nesta rodada
- Gatilho de idade e `checkBirthDate` equivalentes (fuso `America/Fortaleza`, corte hoje menos 18 anos, 29/02); `birth_date` nunca lida de volta, nunca em resposta, e o log só leva o motivo; erros de domínio mapeados por `err.constraint` sem ecoar a data (`identity-repository.ts:93-100`); `safe-error.ts` evita o `detail` do `pg` (que traria a linha inteira).
- Aceite na MESMA transação da conta; versão nunca do cliente (`domain/auth.ts:30`); 503 fechado sem versão.
- Recadastro revertido por inteiro (ROLLBACK) se qualquer passo falha depois da exclusão (data inválida, código não emitido).
- Separação de CORS (`app.ts:143-197`) com `credentials:true` só em `/v1/admin/*` e lista própria (`ADMIN_ALLOWED_ORIGINS`): a pendência de CSRF da minha memória está resolvida (li o código, não testei no navegador).
- Retenção apaga conta nunca verificada em 7 dias com o aceite junto (`identity-retention.ts:66-73`).
- `saveEmailSettings` e `removeSavedPassword` exigem step-up (senha + TOTP) antes de qualquer coisa (`admin-email-settings-service.ts:121-122`, `:178-179`): I-2 aparenta resolvido (só li este trecho).

## O que NÃO foi revisado
- Execução real: nada rodado em banco (função, gatilhos, deadlock de B-3, concorrência), nem os testes existentes; só a leitura e a medição do `bcryptjs`.
- Produção: versão do Postgres, se o dono das tabelas é superusuário, se `api.vuumbora.com.br` tem AAAA (muda o peso de A-1 e M-1), `TRUST_PROXY` real, HSTS/cabeçalhos efetivos no Traefik, onde o stdout dos scripts é gravado.
- I-1 (credencial SMTP segue a origem do host), I-5e (saudação do e-mail), I-7 (só li as funções 0018), guarda de SSRF do SMTP, 2FA do admin, rotas de admin e de candidatura (autorização) — fora do foco pedido.
- Commit `062325e` inteiro: workflow do GitHub, backup cifrado e restauração (o backup carrega e-mail, nome, nascimento e aceites; vale uma rodada própria: onde fica a chave, retenção das cópias, se o aceite sobrevive a restauração parcial).
- Código-fonte de `apps/admin`, `apps/site`, `apps/passenger` e `apps/driver` (XSS, armazenamento de token no app), `mailer.ts` e `code-delivery.ts`, dependências (`npm audit` não rodado), segredos em `docs/` e em `.env.example`.
- Exclusão/anonimização de conta (não existe): quando for escrita, definir o destino do e-mail (hoje conta `blocked` ou `deleted` bloqueia o recadastro com 409 para sempre) e do `birth_date`.
- Reaceite quando a versão dos documentos mudar (não existe consulta nem fluxo).
