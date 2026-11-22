---
name: project-s1-passada-3-qa
description: Passada 3 de QA no SHA 1707546 (22/11/2026) — REPROVADO por CI vermelho e testes de concorrência frágeis por construção (A-1); achados do B1 (Mostrar senha cortado no Firefox/WebKit); receitas novas
metadata:
  type: project
---

Veredito completo: `docs/veredito-iris-s1-passada-3.md`. Complementa [[project-s1-passada-2-qa]] e [[project-s1-ambiente-de-teste-e-ferramentas]].

**Resultado:** REPROVADO. Suíte da API 323/323 em 6 execuções locais (banco novo, 2x no mesmo banco, 3x presa a 2 CPUs) e M-3 ponta a ponta 108/108 + 11/11 + canário, MAS o CI do SHA está vermelho (job `api`, teste de tempo do pool, 4 de 4 execuções depois do "ajuste" de 250 ms) e achei teste de concorrência frágil por construção.

**Causa raiz nova (A-1 quebrou o determinismo dos testes):** a pista de bcrypt tem capacidade = vagas + fila = 9 (<=3 CPUs) ou 10 (>=4). Teste com 12 requisições simultâneas que usam bcrypt (`identity-email.test.ts` "CONCORRÊNCIA: 12 chutes", `identity.test.ts:294`) passa a depender de quanto as requisições se agrupam: o excedente vira 503 `server_busy` e a contagem exata quebra. Reproduzido local: 2 de 20 execuções falham com 2 CPUs presas + 2 hogs (4 !== 7 em `code_expired`); com pista forçada (`AUTH_BCRYPT_CONCURRENCY=1 AUTH_BCRYPT_QUEUE_MAX=2`) falha sempre. Já caiu uma vez no CI (856e399). **How to apply:** ao mexer em teto/pista, grep `Array.from({ length: >=10` nos testes e fixar a fila do ambiente de teste (`auth-env.ts`) acima do maior disparo.

**Achado: 503 gasta tentativa.** Rajada simultânea de 30 verify-email: as 20 recusadas (503) gravaram tentativa em `login_attempts` (30 linhas para 10 atendidas), porque a pré-checagem `assertAppBcryptCapacity` passa quando todas chegam juntas. Login não sofre (LB2). Baixa; o comentário do código admite a janela mas não o custo.

**CI do SHA, sem login:** a API anônima do GitHub dá 403 depois de ~60 chamadas/h por IP. Alternativa: `curl -L https://github.com/InnovareCode/VuumBora/actions` e `.../actions/runs/<id>` (HTML renderizado no servidor): lista de runs com conclusão no JSON embutido e o painel "Annotations" no texto da página (nomes dos testes que falham). `aria-label="failed:"/"completed successfully:"` na ordem dos jobs dá o status por job. Log do job continua exigindo login.

**B1 (Lyra) no export web:** guardas OK (55/55), códigos naturais do mock fiéis ao contrato (19/19), 208/210 estados forçados. Achados: (1) `InputCore` sem `minWidth:0` — o botão "Mostrar senha" sai da tela no Firefox (<=373 px) e WebKit (<=365 px); medido + screenshot; Chromium OK. (2) foco vai para o `<body>` depois de todo envio com erro e não vai ao campo do código ao chegar. (3) `/_sitemap` e "Unmatched Route" padrão em inglês no export de produção. (4) termos/privacidade só abrem deslogado (guarda do grupo `(auth)`): o reaceite do M-3 vai precisar de rota logada.

**Receitas novas:**
- `start /affinity` no Git Bash PENDURA o shell. Equivalente que funciona: PowerShell `-File` que faz `[Process]::GetCurrentProcess().ProcessorAffinity = [IntPtr]<máscara>` e depois roda o comando (filhos herdam; `availableParallelism()` do Node passa a refletir). Provado: máscara 3 -> 2.
- PowerShell 5 `*>` grava o log em UTF-16LE: ler com `iconv -f UTF-16LE` ou `buf.toString('utf16le')`.
- Rodar Chromium/API presos às CPUs 4+ enquanto o teste de tempo roda preso a 0-3, para eu não contaminar a medida. Subshell `( a; b ) &` mata-se com taskkill no PowerShell pai, mas o `;` seguinte ainda dispara: matar em laço até não sobrar `aff-loop` na lista.
- Corrida determinística "publicaram no meio do cadastro": dono segura `LOCK TABLE account_consents IN SHARE MODE` (bloqueia só o INSERT, não os SELECT da conferência), espera `pg_stat_activity` com `wait_event_type='Lock'` e `query ilike '%INSERT INTO account_consents%'`, publica, solta. `ACCESS EXCLUSIVE` bloqueia cedo demais (antes da conferência) e o 409 vem da API, não da rede do banco. Canário: `ALTER TABLE ... DISABLE TRIGGER account_consents_append_only` faz o cadastro em voo virar 201 (o gatilho se chama `account_consents_append_only`, a função `account_consents_guard`).
- WSL2 (Ubuntu) existe nesta máquina: Node 22 Linux em `/tmp/iris3-node`, rodar `dist/` compilado com `taskset -c`. O bloqueio de segurança do harness recusa `rm -rf` dentro de `wsl bash -c`: usar diretório novo em `/tmp`.
- `expo export --dev` NÃO serve (recarrega em laço procurando o HMR). Para o gancho `__vuumboraIdentity` use `expo start --web --port N --offline` (CI=1), 16 s até a 1ª tela.
- Playwright: instalar o relógio ANTES do `goto` (`page.clock.install({time})`), não `setFixedTime` depois.

**Falsos FAIL do meu harness (calibrar antes de reprovar):** regex casando o eco da URL ("/catalogo") no texto de "Unmatched Route"; `/s+/` sem barra num heredoc de `node -` (some todo "s" do texto); `autocomplete` por propriedade no Firefox volta vazio (usar `getAttribute`); detecção de anel de foco com `blur()` síncrono falha no WebKit (o React atualiza depois; esperar ~350 ms); texto de ajuda fixo "18 anos ou mais" casando o regex de erro de idade; e-mail com maiúscula não casa com o destinatário (a API baixa a caixa).
