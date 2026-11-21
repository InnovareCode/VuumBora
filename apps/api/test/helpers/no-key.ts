/** Importar ANTES de `setup.ts`: simula deploy sem `ADMIN_TOTP_ENCRYPTION_KEY`. */
process.env['ADMIN_TOTP_ENCRYPTION_KEY'] = '';
