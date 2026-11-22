---
name: feedback-corrida-sem-sleep-e-ferramentas
description: Teste de corrida com sleep mata mutante so as vezes (SF4 sobreviveu na suite da Iris); gates deterministicos; armadilhas do Bash/Windows (escape em heredoc, python3, API do HEAD com arvore suja)
metadata:
  type: feedback
---

- **Teste de corrida com `sleep` deixa mutante vivo "so as vezes".** O teste antigo do SF4 (`login que chega enquanto o refresh é GRAVADO`) matava o mutante em ~7 de 8 rodadas e sobrevivia nas demais, em especial na 1ª execução logo depois de copiar a árvore (antivírus/carga). A Íris viu "SOBREVIVEU"; eu, rodando só aquele teste, vi "MORTO". Causa raiz: a ordem dos eventos dependia de `sleep(5/20/40)`; sob carga o cenário se desfaz e o código mutado passa.
  **Why:** nenhuma assertão estava errada — o cenário é que não acontecia.
  **How to apply:** corrida = promessas controladas (`deferred`), `waitFor(condição)` e portão de gravação (`spy.holdWrites(chave)`, em `packages/api-client/test/helpers/session-kit.ts`); cada teste afirma a PRÉ-CONDIÇÃO (o refresh está em voo / a gravação está presa) antes de provocar a corrida. Meça com `REPEAT=3` no harness de mutação: `KILLED` só vale se falhou em TODAS as rodadas, `FLAKY` é tão ruim quanto `SURVIVED`. Negativo ("nada chamou X") em ponto síncrono pode checar logo após o `await`; senão `sleep` curto só como segundo cinto.
- **Mutar sempre em cópia fresca, com o trecho achado EXATAMENTE 1 vez** (senão `INVALID`), com `\r\n` normalizado (a árvore é CRLF por `autocrlf`) e copiando também `docs/contrato-identidade-apps.md` (o teste "mock x contrato" lê esse arquivo por caminho relativo; sem ele o baseline já falha e tudo "morre"). Harness: junção `node_modules` -> raiz (`fs.symlinkSync(alvo, caminho, 'junction')`).
- **Bash tool no Windows:** sequências com barra invertida dentro de heredoc (`\\r\\n`, `\\x1b`) chegam diferentes do que foram escritas, e um script com muitas aspas/crases falhou com "unexpected EOF". Script com escape ou template literal: grave com `Write` e rode com `node arquivo`. `python3` é o atalho da Loja no Windows e PENDURA o shell (nem `taskkill` foi permitido): não invocar, usar `node`. `mklink` com caminho com espaço falha: usar o `fs.symlinkSync`.
- **"API real do HEAD" com a árvore suja de outro agente:** `git archive HEAD apps/api | tar -x -C <pasta>` + junção de `node_modules` da raiz; rodar `tsx` com cwd nessa pasta. HEAD mudou durante a tarefa (Atlas commitou), então registre `git rev-parse --short HEAD` no relatório.
