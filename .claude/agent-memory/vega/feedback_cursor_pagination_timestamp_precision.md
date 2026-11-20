---
name: feedback-cursor-pagination-timestamp-precision
description: Bug real em paginação por cursor (keyset) com (created_at, id) — JS Date trunca timestamptz do Postgres de microssegundo para milissegundo, perdendo linha quando duas datam no mesmo milissegundo. Checar sempre que o cursor de paginação incluir um timestamp.
metadata:
  type: feedback
---

**Causa raiz:** paginação keyset por `(created_at, id) DESC` com cursor
codificado a partir do campo `created_at` já convertido para `Date` do JS
(`new Date(row.created_at).toISOString()`). `Date` do JS só guarda
milissegundo; o Postgres `timestamptz` guarda microssegundo. Quando duas (ou
mais) linhas nascem no mesmo `INSERT`/mesma transação — `now()` é avaliado
uma vez por statement, não por linha — elas ficam com `created_at`
IDÊNTICO até o microssegundo. O cursor, truncado para milissegundo, vira
numericamente MENOR que o valor real armazenado para essas linhas. A
condição SQL `(created_at, id) < ($1::timestamptz, $2::uuid)` então falha
para TODAS elas (porque `created_at_real > created_at_do_cursor`,
independente do `id`) — a página seguinte vem vazia mesmo havendo linha
para mostrar. Provado direto no Postgres (não só lendo o código): 3 linhas
com `created_at` igual ao microssegundo, paginando de 2 em 2 — a segunda
página voltava `{"items":[]}` no lugar da 1 linha que faltava.

**Correção:** nunca deixar o timestamp do cursor passar por `Date` do JS.
A query agora também seleciona
`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS
created_at_cursor` (precisão de microssegundo, como TEXTO) só para montar o
próximo cursor — nunca exposto no item público da API (que continua com
`createdAt` em milissegundo, convenção `IsoDateTime` do projeto). A
validação do formato do cursor decodificado também parou de usar
`Date.parse` (que não documenta bem mais de 3 dígitos de fração) e passou a
usar uma regex (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/`) que
aceita qualquer precisão de fração de segundo.

**Como evitar a próxima vez:** em qualquer paginação keyset cujo cursor
inclua um timestamp do Postgres, nunca fazer o round-trip valor → `Date` do
JS → string → de volta pro SQL. Ou (a) manter o valor como string de
precisão total do banco o tempo todo (como aqui), ou (b) usar só colunas
sem perda de precisão no round-trip (ex.: sequência inteira, UUID
monotônico). E sempre TESTAR keyset pagination inserindo propositalmente
duas+ linhas na MESMA transação/`INSERT` antes de confiar — é exatamente o
caso que não aparece testando uma linha por vez com `sleep` entre elas.
Ver `apps/api/src/repositories/admin-driver-application-repository.ts`
(coluna `created_at_cursor`) e `apps/api/src/domain/pagination.ts`.
