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
  // Preenchido em 19/11/2026, quando o backend entrou no ar. Medido de fora
  // antes de escrever aqui: certificado Let's Encrypt válido para
  // CN=api.vuumbora.com.br, GET /healthz devolvendo 200 {"status":"ok"},
  // e o preflight do CORS respondendo
  // `Access-Control-Allow-Origin: https://www.vuumbora.com.br`.
  //
  // Tem que ser https: o site é servido por HTTPS, e o navegador recusa que
  // uma página segura chame um endereço inseguro. Em 19/11/2026 este domínio
  // esteve cadastrado como `http://` no painel e nada funcionava.
  apiBaseUrl: 'https://api.vuumbora.com.br'
});
