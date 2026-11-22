---
name: project-legal-m3-versoes-exibidas
description: M-3 (aceite com versão exibida, migração 0021) em apps/api — decisões, contrato real, fixture do catálogo imutável e armadilhas de teste
metadata:
  type: project
---

Desenho do Cronos: migração 0021 + `docs/contrato-identidade-apps.md` (seção B3) + `docs/sql/testes-privilegio-0021.md`. Implementação (21/11/2026): `domain/legal.ts`, `lib/legal-config.ts`, `lib/legal-publish.ts`, `repositories/legal-repository.ts`, `services/legal-service.ts`, `routes/{legal-route,auth-consent-route}.ts`, `hooks/require-current-consent.ts`, `scripts/publish-legal.mjs` (`npm run legal:publish`). Testes: `legal-catalog-db` (10 de privilégio/regra), `legal-consent-api`, `legal-publish`; kit em `test/helpers/legal-kit.ts`.

**Decisões que não estão no desenho do Cronos**
- `LEGAL_DOCUMENTS_BASE_URL` (sem padrão, https em produção) é a ÚNICA config dos textos; URL do arquivo = `<base>/<terms|privacy>/<passenger|driver>/<versão>`. Ausente/inválida = fail-closed: GET legal, cadastro, reaceite e `requireCurrentConsent` dão 503 `consent_unavailable`; `GET /me` segue com `consent: null` (sessão nunca cai por config de textos). Boot loga `legal_unavailable` com NOME da variável, nunca valor.
- Sucesso vem no envelope `{ok:true,data}` (o contrato do Cronos mostrava o corpo cru). `error.current` do 409 = o `data` do GET.
- Cadastro confere a versão ANTES de gastar limite/bcrypt (409 não consome `login_attempts`); a rede do banco (23503 `account_consents_version_published` / 23514 `account_consents_version_current`) vira o mesmo 409 relendo a vigente DEPOIS de liberar o client (não reler pool segurando client = deadlock do pool).
- `POST /consents`: tudo ou nada (uma instrução `unnest`), `ON CONFLICT DO NOTHING`; versão enviada tem de ser a VIGENTE (até a editorial). 400 `consent_required` para problema em versão/ausência nas duas; 400 `invalid_body` se o corpo nem é objeto. `pending` sempre ordenado Termos, Política (o banco ordena ao contrário).
- `legal:publish`: uma transação para todos os perfis; mesma versão + hash DIFERENTE é erro alto (o banco ignoraria em silêncio); repete sozinho só `legal_document_versions_published_at_monotonic`.

**Armadilhas que custaram tempo**
- Fixture do catálogo imutável: `resetLegalCatalog` = `SET LOCAL session_replication_role = replica` + `TRUNCATE legal_document_versions CASCADE` (leva `account_consents`), só em banco `_test`. Escolhida em vez de banco dedicado por arquivo porque dá catálogo vazio/baseline conhecido também em banco que persiste. `prepareDatabase()` chama `ensureBaseline` (não apaga se já é baseline). Todo teste que registra conta depende disso: sem versão publicada o cadastro dá 503.
- Nome do gatilho do aceite é `account_consents_append_only` (a FUNÇÃO é `account_consents_guard`); `ip_hash` tem CHECK de 64 caracteres (`account_consents_ip_len`).
- Regex de flag `--sha256=` com `[a-z-]+` não casa dígito: o teste de argumentos pegou.
- Teste de corrida no `/consents`: o INSERT roda direto no pool (sem transação), interceptar `pool.query`; no cadastro roda no client da transação (interceptar `connect`+`query` e restaurar no `release`).
