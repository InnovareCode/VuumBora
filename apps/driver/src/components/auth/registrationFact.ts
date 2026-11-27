/**
 * O fato público sobre o cadastro de motorista (plano de execução, princípio 5; memória "candidatura x cadastro"). UM
 * fato, UM lugar: toda tela que o diz importa daqui. Sem data, sem percentual, sem "você será avisado".
 *
 * Só aparece onde o cadastro NÃO existe para a conta (criar conta; cartão `not_started` da Home e do Perfil). Onde o
 * servidor diz que o cadastro anda (faltam documentos, em análise...), este fato NÃO aparece: as duas coisas na mesma
 * página eram a contradição do Q5 (`docs/veredito-iris-s1-passada-5.md`).
 */
export const REGISTRATION_FACT = 'O cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas.';
