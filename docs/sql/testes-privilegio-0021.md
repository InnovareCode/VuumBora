# Testes de privilégio da migração 0021 (para a API do M-3)

Origem: relatório do Cronos de 21/11/2026, provado por SQL em Postgres 18 próprio. A Vega porta para a suíte da API
(`apps/api/test`). Desenho completo: seção "DESENHO" no fim de `docs/contrato-identidade-apps.md`.

## Objetos

`legal_document_versions` (catálogo), view `legal_current_versions`, função `legal_pending_for_account(uuid)` e as colunas
`account_consents.audience` e `account_consents.text_sha256`. No banco os documentos são `terms_of_use` e `privacy_policy`;
o JSON da API usa `terms` e `privacy` (o mapeamento é da API).

## Os 10 testes

| # | Conexão | O que provar |
|---|---|---|
| 1 | dono | `has_table_privilege('vuumbora_api', ...)` no catálogo e na view: SELECT true; INSERT, UPDATE, DELETE e TRUNCATE false. |
| 2 | dono | EXECUTE em `legal_pending_for_account` true para `vuumbora_api` e false para um papel NOLOGIN sem grants (via `SET ROLE`; o erro é 42501). |
| 3 | `vuumbora_api` (pool real) | INSERT, UPDATE, DELETE e TRUNCATE no catálogo dão 42501. |
| 4 | dono | UPDATE e DELETE no catálogo dão 42501 pelo gatilho. `TRUNCATE ... CASCADE` dá 42501. `TRUNCATE` simples dá 0A000, porque a FK recusa antes do gatilho. As linhas seguem intactas. |
| 5 | `vuumbora_api` | Aceite com `audience`, `text_sha256` e `accepted_at` forjados: o banco grava os do catálogo, da conta e do relógio. Versão não publicada dá 23503. Versão superada dá 23514. Motorista aceitando versão que só existe para passageiro dá 23503. |
| 6 | dono | UPDATE de aceite: só `ip_hash` para NULL passa. `ip_hash` NULL junto com troca de `text_sha256` ou `audience` dá 42501, e a troca sozinha também. |
| 7 | `vuumbora_api` | UPDATE, DELETE e TRUNCATE em `account_consents` dão 42501. Excluir a conta ainda leva o aceite em cascata. |
| 8 | dono | Publicação: `published_at` enviado é descartado. Mesma versão de novo dá 23505, ou 0 linhas com `ON CONFLICT DO NOTHING`, e o hash original não muda. Com 12 inserts simultâneos do mesmo par, `published_at` fica distinto e crescente e a view devolve 1 linha. |
| 9 | dono | Cenário da pendência, na ordem: v1 material, v2 editorial, v3 material, v4 editorial. Mais conta nova, conta legada, perfis independentes e nada publicado (zero pendência). |
| 10 | dono, em transação revertida | Com o gatilho do aceite desligado, hash errado dá 23503 na FK de 4 colunas, e `audience` e hash fora de par dá 23514. |

## Pontos de integração

- INSERT do aceite informa só `(account_id, document, version, ip_hash)`; `ON CONFLICT (account_id, document, version) DO NOTHING` continua valendo.
- `runtime-role.test.ts`: a matriz só olha `relkind = 'r'`. Acrescentar `legal_document_versions: []` e fazer asserções à parte para a view e a função.
- Remover `AUTH_TERMS_VERSION` e `AUTH_PRIVACY_VERSION` do código, do `.env.example` e dos testes. `url` e cache ficam por configuração da API.
- Script `legal:publish` com a credencial de migração: a API não tem INSERT no catálogo.
- Efeito medido na suíte atual: sem versão publicada no catálogo, o cadastro devolve 503 e 33 de 94 testes (nos 6 arquivos de identidade) passam; com `teste-2026-11` publicada nos 4 pares documento x perfil, 93 de 94 (a falha é a matriz do `runtime-role`).
- Fixtures: o catálogo não pode ser truncado nem apagado (nem pelo dono). Um teste que publica versão nova muda a vigente para todos os arquivos seguintes. Opções: banco `_test` dedicado para esse arquivo, ou, em teste de superusuário, `SET LOCAL session_replication_role = replica` antes de `TRUNCATE legal_document_versions CASCADE`.
- Para rodar a suíte em Postgres próprio: `DATABASE_URL` no shell, `DOTENV_CONFIG_PATH` apontando para arquivo inexistente (o `.env` do repositório tem a URL do dono) e `ALLOWED_ORIGINS` e `ADMIN_ALLOWED_ORIGINS` definidas à mão.
