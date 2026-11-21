/** Importar ANTES de `setup.ts`: o limite de login por IP volta ao padrão baixo (5), para provar que ele não é forjável. */
process.env['ADMIN_LOGIN_RATE_LIMIT_MAX'] = '5';
