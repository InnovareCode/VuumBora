-- Reverte 0020: remove a função de substituição de conta não verificada.
-- ATENCAO: o código novo da API depende dela para o recadastro; sem ela, o cadastro sobre e-mail ainda NÃO verificado
-- passa a devolver 409 (o comportamento anterior à correção I-4). Só reverter junto com o código antigo.
-- Ordem inversa: 0020, 0019, 0018, 0017, ...
DROP FUNCTION IF EXISTS reclaim_unverified_account(TEXT, TEXT);
DELETE FROM schema_migrations WHERE id = '0020_reclaim_unverified_account.sql';
