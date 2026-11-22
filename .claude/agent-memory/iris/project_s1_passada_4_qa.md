---
name: project-s1-passada-4-qa
description: Passada 4 de QA no SHA 33b2401 (22/11/2026) — REPROVADO só por 2 defeitos de teste em bcrypt-ceiling (healthz 200 ms flaky, não repete no mesmo banco); o resto liberado; receitas novas
metadata:
  type: project
---

Veredito completo: `docs/veredito-iris-s1-passada-4.md`. Complementa [[project-s1-passada-3-qa]] e [[project-s1-ambiente-de-teste-e-ferramentas]].

**Resultado: REPROVADO**, mas o código de produção está provado. Liberados: CI verde (run 44993615428, 4 jobs); F3 (36/36 x3 motores, canário reproduz os números da passada 3), F5/F6/F7/F8/F12 (35/35 x9); M-1 medido contra cópia do 1707546 (titular recusado 21-68% antes, 0% depois; controle "muitos /48" segue 53-68%, limite do desenho); B-1/F4 (29/30, o 1 é artefato meu: 429 de espera progressiva não grava linha); B-3 20/20 + canário com 8 falhas; B-4 17/17 + 4 canários; B-5 36/36; api-client 216/216 x3 e 15 de 17 mutantes mortos (2 vivos equivalentes); B3 passageiro 30/30 x3 motores. Mutação na API: 26 de 30 mortos (vivos: ttl-0 equivalente + 3 lacunas do B-2).

**Defeito 1 (bloqueia): `bcrypt-ceiling.test.ts:124` `/healthz < 200 ms` é flaky**: 3 falhas em ~107 execuções (223, 228, 233 ms; típico 16-34 ms), nas 3 condições, inclusive sem afinidade e máquina quieta. Causa não provada (parada única ~0,2 s do laço). Mesma classe da reprovação da passada 3 (limite absoluto de tempo). **How to apply:** ao ver teste de tempo, medir a distribuição com banco novo a cada execução e rodar sem afinidade também; limite absoluto de 200 ms a ~25 ms dos outliers não presta.

**Defeito 2 (bloqueia): o mesmo arquivo não repete no mesmo banco** (passa em banco novo, falha da 2ª em diante, sem afinidade e sem carga). Causa: `uniqueEmail()` (identity-kit) = `${label}${contador}` com contador por processo; `prepareDatabase()` não zera `accounts`; e-mail repetido recebe o mesmo 201 (anti-enumeração) sem criar conta. A suíte inteira repete porque um arquivo posterior zera `accounts`; o CI usa banco novo. **How to apply:** ao repetir UM arquivo 20x, recriar o banco a cada execução (`loopfresh.ps1`); senão o loop acusa estado, não timing; e mutação deve recriar o banco a cada execução também (senão as contagens de mortos inflam).

**Lacunas do teste B-2 (consent-gate-coverage):** a detecção é por NOME em `route.preHandler`. Rota autenticada por `onRequest`, por `preHandler` anônimo ou por `addHook` de contexto, declarada `public`, passa. Rota nova sem classificação cai (funciona).

**O HEAD andou de novo** (33b2401 -> d7e21e1, B2 do motorista, mexeu em `packages/ui/src/InputCore.tsx` e `InlineAlert.tsx`, os pontos do F3 e F5): conferir `git rev-parse HEAD` no fim e dizer no veredito o que não foi validado.

**Receitas novas:**
- `pin.ps1 -Mask m -Line "cmd com redirecionamento" [-Cwd d]`: PowerShell prende as CPUs e roda por `cmd /c` (saída UTF-8 crua, sem UTF-16). Grupos de CPU: loops 0-3, API real 4-7 (mask 240), navegadores 12-23 (mask 16773120).
- `pg_stat_*` atrasa até 10 s em conexão ociosa: para contar consultas da API use `ALTER ROLE vuumbora_api SET log_statement='all'` (só esse papel) e conte no `pg.log`.
- Nunca matar por `CommandLine like '*padrao*'`: mata o próprio shell e os `bash` dos meus outros jobs (matei o loop do M-1 e quase os pares). Filtrar por `Name -eq 'node.exe'` e por PID de pai, `taskkill /T`.
- `bash start-api.sh ... | tail` pendura (o PS filho segura o pipe): redirecionar para arquivo com `< /dev/null`. Heredoc com `python3 -` pendura no Windows; escrever scripts com Write.
- Mutante B-4 que desliga o vigia pendura o runner (sem timeout): dar `timeout` ao spawn do harness (150 s).
- `uniqueEmail` do titular: o M-1 precisa de N contas e 1 IP por requisição (o par conta+IP bloqueia em 10 por 15 min); titular com 1 conta só dá 429 e engana.
- Export de produção do passageiro agora aborta sem `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1` (guarda M-3 funcionando).
- Junção para economizar `npm ci`: `mklink /J repo-old\node_modules repo\node_modules` (lockfile igual) e remover com `rmdir`, nunca `rm -rf`.
