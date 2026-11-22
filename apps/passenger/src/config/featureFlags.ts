/**
 * Interruptores de produto que dependem de decisão do dono — constantes de compilação, não
 * configuração de usuário. Ligar um deles é mudar uma linha aqui DEPOIS da decisão, não antes.
 */

/**
 * Login social ("Continuar com Google/Apple"). Decisão 8 de docs/decisoes-do-dono.md está
 * aberta: exige conta de desenvolvedor nas duas lojas e, no iOS, oferecer Apple se oferecer
 * Google. Botão desabilitado numa tela de loja promete o que não existe (e reprova revisão),
 * por isso a seção NEM É RENDERIZADA enquanto isto for `false`. Nenhum SDK de login social está
 * instalado — ligar isto sozinho não faz o botão funcionar.
 */
export const SOCIAL_SIGN_IN_ENABLED = false;
