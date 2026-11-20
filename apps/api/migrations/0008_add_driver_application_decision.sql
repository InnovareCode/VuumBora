-- Primeira ação que MUDA ESTADO de candidatura de motorista: aprovar e
-- recusar (`POST /v1/admin/driver-applications/:id/approve|reject`). Até
-- aqui (migrações 0001-0007) o painel só lia. Decisão sem registro de quem
-- decidiu, quando e por quê não pode existir — por isso estas colunas
-- entram JUNTO com a rota, não depois.
--
-- `decided_by` é FK para `admin_users`, não para `admin_sessions`: a
-- decisão pertence à PESSOA, não à sessão que ela usava naquele momento
-- (sessão expira/é revogada; a decisão continua rastreável).
--
-- `decision_idempotency_key` guarda o `Idempotency-Key` da requisição que
-- efetivamente mudou o status. Serve só para RESPONDER DE NOVO a um retry
-- com a MESMA chave (mesma resposta de sucesso, sem reexecutar nada) — a
-- defesa real contra efeito duplicado é o `WHERE status = 'pending'` no
-- UPDATE (ver `repositories/admin-driver-application-repository.ts`,
-- `updateDriverApplicationStatus`), que já impede duas decisões na mesma
-- linha mesmo sem nenhuma chave. Por isso uma coluna por linha basta: não é
-- um registro genérico de idempotência (não serve para outra rota), é
-- "qual chave produziu ESTA decisão".
--
-- Sem backfill, mesmo padrão já usado neste projeto: `ADD COLUMN IF NOT
-- EXISTS ... NULL`. Candidatura ainda `pending` fica com as quatro colunas
-- NULL até alguém decidir.

ALTER TABLE driver_applications
    ADD COLUMN IF NOT EXISTS decided_by uuid NULL REFERENCES admin_users (id),
    ADD COLUMN IF NOT EXISTS decided_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS decision_reason text NULL,
    ADD COLUMN IF NOT EXISTS decision_idempotency_key text NULL;

CREATE INDEX IF NOT EXISTS driver_applications_decided_by_idx
    ON driver_applications (decided_by);
