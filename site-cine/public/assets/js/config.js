/**
 * Único ponto de configuração da página. Sem variável de ambiente (é HTML
 * estático, sem build), então quem publica edita este valor na mão antes do
 * deploy: mesmo serviço (vuumbora-backend) que os outros formulários do
 * grupo já usam, endpoint próprio.
 *
 * Deixe em branco ('') enquanto o endereço do backend não existir em
 * produção: o formulário mostra o aviso honesto em vez de fingir que enviou.
 */
window.VUUMBORA_CONFIG = Object.freeze({
  apiBaseUrl: ''
});
