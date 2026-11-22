# Política de Privacidade — VuumBora

> **RASCUNHO PARA REVISÃO DO ADVOGADO.** Nada neste texto é parecer jurídico.
> Não publicar antes da revisão do advogado e da decisão do dono.
> Itens em **[A DEFINIR PELO DONO]** dependem de decisão de negócio.
> Itens em **[REVISAR COM O ADVOGADO]** dependem de fato ou de lei que ainda não foi conferido.
> Lista completa, com a pergunta de cada item, em `pendencias-para-o-advogado.md`.

**Versão:** [A DEFINIR NA PUBLICAÇÃO, ex.: 2026-12-01]
**Rascunho de:** 22/11/2026

**Anexo técnico (remover ao publicar):** a coluna "Fonte no código" da seção 2 e
a seção 9 existem para o advogado conferir cada fato. Ao publicar, elas saem.

---

**Nota de estado do produto (remover ao publicar):** em 22/11/2026, o aplicativo
do passageiro e o do motorista ainda rodam com identidade simulada, sem envio de
dados a um servidor. O site já recebe **candidaturas** de motoristas e **inscrições
na lista de espera**. Esta política descreve o tratamento quando o produto estiver
no ar. Cada item que ainda não existe está marcado.

---

## 1. Quem controla os seus dados

A **Innovare Code**, inscrita no CNPJ 09.813.446/0001-00, é a controladora dos
dados pessoais tratados pelo VuumBora.
[REVISAR COM O ADVOGADO: razão social completa e endereço.]

**Encarregado (DPO):** [A DEFINIR PELO DONO: nome ou função e o contato].
**Canal para pedidos sobre dados pessoais:** **contato@vuumbora.com.br**.

Esta política vale para o site, para o aplicativo do passageiro e para o
aplicativo do motorista. Ela tem seções próprias para cada público, porque os
dados coletados são diferentes.

## 2. Quais dados tratamos e para quê

Veja o que é coletado em cada situação. A coluna "Fonte no código" serve só para
a revisão e sai na publicação.

### 2.1. Quem se candidata a motorista pelo site (candidatura)

| Dado | Para quê | Onde fica | Fonte no código |
|---|---|---|---|
| Nome completo | identificar a candidatura e falar com a pessoa | tabela de candidaturas, no servidor do controlador | `apps/api/migrations/0002_create_driver_applications.sql` (coluna `name`); `apps/api/src/routes/driver-application-route.ts:19-23` |
| Telefone (WhatsApp) | retorno da candidatura | idem | migração 0002 (`phone`); `driver-application-route.ts:24-33` |
| E-mail | retorno da candidatura e confirmação de recebimento | idem | migração 0002 (`email`, índice único); `driver-application-route.ts:34-40` |
| Cidade e UF | definir a região de lançamento | idem | migração 0002 (`city`, `state`); `driver-application-route.ts:41-55` |
| Já dirige por aplicativo (sim/não) | avaliar elegibilidade | idem | migração 0002 (`already_drives_for_app`) |
| Tem veículo próprio (sim/não) | avaliar elegibilidade | idem | migração 0002 (`has_own_vehicle`) |
| Situação da candidatura (pendente, aprovada, recusada) | acompanhar a análise | idem | migração 0002 (`status`) |
| Endereço IP | limitar o número de envios e proteger o serviço | só na memória do limite de uso e nos registros do servidor (ver seção 6) | `apps/api/src/app.ts:71-74` (registros de rotas fora de `/v1/auth`); `apps/api/src/lib/ip-bucket.ts:53-68` |

**Não coletamos, no pré-cadastro:** CPF, CNH, documentos do veículo, endereço
residencial, bairro e CEP. Esses dados só serão pedidos depois de aprovação, em
etapa própria. [A DEFINIR PELO DONO: confirmar que essa etapa será comunicada e
terá base legal própria.]

**Aceite:** o formulário mostra um aviso ao lado dos campos. Ele não tem caixa
de aceite. [REVISAR COM O ADVOGADO: se a base é a etapa pré-contratual, sem
consentimento. Ver pendências.]

### 2.2. Lista de espera (site)

| Dado | Para quê | Onde fica | Fonte no código |
|---|---|---|---|
| E-mail | avisar quando o aplicativo for lançado | tabela `waitlist_signups` | `apps/api/migrations/0001_create_waitlist_signups.sql`; `apps/api/src/routes/waitlist-route.ts:10-13` |
| Perfil (passageiro ou motorista), se informado | separar os avisos | idem | migração 0001 (`profile`) |

A lista de espera não guarda IP nem telefone na tabela (migração 0001,
cabeçalho). O IP pode aparecer nos registros do servidor (ver seção 6).

### 2.3. Conta de passageiro ou motorista (aplicativos)

| Dado | Para quê | Onde fica | Fonte no código |
|---|---|---|---|
| Nome completo | identificar a conta | tabela `accounts` | `apps/api/migrations/0010_create_accounts_identity.sql:46` |
| E-mail | login, confirmação, código e recuperação de senha | `accounts` (único por tipo de conta) | migração 0010:44, 68 |
| Telefone (opcional) | contato, se informado | `accounts.phone` | migração 0010:48; `apps/api/src/routes/auth-route.ts:82-90` |
| Data de nascimento | **somente** conferir a idade mínima de 18 anos | `accounts.birth_date` | `apps/api/migrations/0019_add_birth_date_and_account_consents.sql:83`; `apps/api/src/domain/birth-date.ts`. A data **não é devolvida** em nenhuma resposta nem gravada em registro (`apps/api/src/repositories/identity-repository.ts:54-64` é a única gravação; não há leitura de volta) |
| Senha | acesso à conta | `account_credentials`, **só o hash** (bcrypt ou argon2id, formato verificado pelo banco) | `apps/api/migrations/0010_create_accounts_identity.sql:95-105` |
| Código de confirmação (6 dígitos) | confirmar e-mail ou trocar senha | `account_email_codes`, **só o hash do código** | `apps/api/migrations/0014_create_email_codes.sql:28-39` |
| Aceite dos Termos e da Política (versão, data do servidor, hash do texto, IP em HMAC) | provar qual texto foi aceito | `account_consents` | `apps/api/migrations/0019_add_birth_date_and_account_consents.sql:151-165`; `apps/api/migrations/0021_create_legal_document_versions.sql:173-174` |
| Identificador da instalação do app (gerado no aparelho) | reconhecer o aparelho da sessão | `devices.installation_id`; não é IMEI nem identificador de hardware | `apps/api/migrations/0010_create_accounts_identity.sql:107-122`; `packages/api-client/src/identity/installation-id.ts` |
| Nome do aparelho (opcional), plataforma e versão do app | mostrar e revogar sessões | `devices` | migração 0010:113-116 |
| Sessões (tokens de renovação guardados só como hash) | manter o login | `refresh_token_families`, `refresh_tokens` | `apps/api/migrations/0011_create_auth_tokens_and_logs.sql:25-75` |
| Tentativas de login e cadastro (identificador e IP, ambos em HMAC) | limitar tentativas e proteger a conta | `login_attempts` | `apps/api/migrations/0011_create_auth_tokens_and_logs.sql:175-192` |
| Registro de acesso (evento, conta, aparelho, IP em HMAC, família do navegador ou app) | segurança e investigação de fraude | `access_log` | `apps/api/migrations/0011_create_auth_tokens_and_logs.sql:229-244` |

**Não guardamos na conta:** CPF, documentos, endereço, dados bancários e
localização. [REVISAR COM O ADVOGADO: confirmar que não há outro campo, como
foto de perfil, antes da publicação.]

### 2.4. Passageiro: corridas e localização

| Dado | Para quê | Situação | Base legal proposta |
|---|---|---|---|
| Origem e destino da corrida | executar a corrida | [A DEFINIR PELO DONO: ainda não existe no produto] | execução de contrato |
| Posição do aparelho enquanto o app está aberto | mostrar o trajeto e o motorista | [A CONFIRMAR: o app ainda não envia posição a servidor] | execução de contrato |
| Avaliação do motorista (estrelas) | qualidade do serviço | decisão do dono; [A CONFIRMAR NA TELA] | execução de contrato, legítimo interesse |
| Histórico de corridas | suporte, disputa, obrigação fiscal | [A DEFINIR PELO DONO] | obrigação legal, execução de contrato |

### 2.5. Motorista: documentos, corridas e localização

| Dado | Para quê | Situação | Base legal proposta |
|---|---|---|---|
| CNH, CRLV, certidão de antecedentes, comprovante de INSS, seguro | verificação exigida por lei | **não coletado hoje**. Só após aprovação, em etapa própria | obrigação legal, execução de contrato [REVISAR COM O ADVOGADO] |
| Endereço residencial, bairro, CEP | contrato e cadastro real | **não coletado hoje** | execução de contrato |
| Posição durante a disponibilidade e a corrida | despacho e segurança | [A DEFINIR PELO DONO: posição fora de corrida não deve ser guardada] | execução de contrato, legítimo interesse [REVISAR] |
| Localização em segundo plano | receber corridas com o app fechado | **não existe no produto e não está decidido** | [REVISAR COM O ADVOGADO antes de qualquer uso] |
| Dados de pagamento e repasse | pagar o motorista | [A DEFINIR PELO DONO: provedor e modelo] | execução de contrato, obrigação legal |

### 2.6. Equipe interna (painel administrativo)

| Dado | Para quê | Onde fica | Fonte no código |
|---|---|---|---|
| Nome, e-mail, papel e senha (hash) de quem acessa o painel | controle de acesso | tabela `admin_users` (migração 0003) | `apps/api/migrations/0003_create_admin_users.sql` |
| Verificação em duas etapas (segredo cifrado com AES-256-GCM e códigos de recuperação guardados só como hash) | segurança do acesso | `admin_totp`, `admin_recovery_codes` | `apps/api/migrations/0013_add_admin_two_factor.sql:15-36`; `apps/api/src/lib/secret-box.ts` |
| Registro de ações (quem fez, o quê, IP **em claro**) | auditoria | `admin_audit_log`, sem prazo de guarda definido | `apps/api/src/services/admin-auth-service.ts:154`; `apps/api/migrations/0004_create_admin_audit_log.sql:29` |
| Falhas de login do painel (e-mail em HMAC e IP em claro, por balde) | proteção contra tentativas | `admin_login_failures`, apagado depois de 1 dia | `apps/api/src/repositories/admin-login-failure-repository.ts:12, 45` |

[REVISAR COM O ADVOGADO: o IP em claro na trilha de auditoria e o prazo dela.
Ver pendências, item 13.]

## 3. Bases legais

Usamos as bases do art. 7 da LGPD, conforme a finalidade:

- **Execução de contrato ou de procedimentos preliminares** (art. 7º, V): cadastro,
  corridas, pagamento, candidatura e lista de espera.
- **Cumprimento de obrigação legal ou regulatória** (art. 7º, II): verificação de
  motorista, registros fiscais e de acesso, quando a lei exigir.
- **Legítimo interesse** (art. 7º, IX): segurança, prevenção de fraude e limite de
  tentativas. [REVISAR COM O ADVOGADO: a base precisa ser documentada em teste de
  balanceamento.]
- **Exercício regular de direitos** (art. 7º, VI): guarda de provas para defesa em
  disputa, pelo prazo aplicável.
- **Consentimento** (art. 7º, I): hoje não usamos consentimento como base principal.
  O aceite dos Termos e da Política é registro de ciência, não base para o
  tratamento. [REVISAR COM O ADVOGADO.]

Não fazemos tratamento de dados sensíveis (art. 5º, II) no produto atual.
[REVISAR COM O ADVOGADO: se a certidão de antecedentes criminais, exigida do
motorista, entra ou não nessa categoria.]

**Marketing:** não enviamos mensagens de marketing. [A DEFINIR PELO DONO: se isso
mudar, será preciso consentimento separado.]

## 4. Dados que não coletamos

- CPF no cadastro de passageiro ou motorista, e no pré-cadastro (hoje);
- documentos do motorista antes da aprovação;
- endereço residencial antes da aprovação;
- dados de menores de 18 anos, conscientemente (ver seção 8);
- dados biométricos e reconhecimento facial;
- dados bancários do passageiro. [REVISAR COM O ADVOGADO se o pagamento mudar.]

## 5. Compartilhamento

Não vendemos dados pessoais. Compartilhamos apenas o necessário com:

| Quem | O que recebe | Para quê | Situação |
|---|---|---|---|
| Servidor de hospedagem (Easypanel, em servidor do dono; [A CONFIRMAR: se o servidor e a conta são da Innovare Code ou da pessoa do dono]) | todos os dados das seções 2.1 a 2.6 | operar o serviço | ativo |
| Provedor de envio de e-mail (SMTP do domínio do controlador) | e-mail do destinatário e o conteúdo do aviso (código, aviso de troca de senha) | enviar códigos e avisos | ativo. [A DEFINIR PELO DONO: nome do provedor, a confirmar] |
| Google Fonts | endereço IP e dados técnicos do navegador, ao abrir o site | carregar a fonte do site | ativo no site. [A DEFINIR PELO DONO: ver seção 7] |
| Mapbox | coordenadas para desenhar o mapa, sem nome | mapa e rota | previsto, ainda não ativo no produto |
| Expo (notificações push) | token do aparelho e texto da notificação | avisar corridas e eventos | previsto, ainda não implementado |
| Provedor de pagamento | dados de pagamento necessários | cobrar e repassar | [A DEFINIR PELO DONO] |
| Autoridades públicas | dados quando houver ordem legal | cumprir a lei | quando exigido |

[REVISAR COM O ADVOGADO: se o servidor, o provedor de e-mail e o de pagamento
precisam constar como operadores, com contrato de tratamento de dados.]

## 6. Registros (logs) e endereço IP

6.1. Pelo que foi lido no código das rotas de conta e do serviço de e-mail, os
registros técnicos **não gravam e-mail, senha, código ou data de nascimento**.
[A CONFIRMAR com um teste de registros antes de publicar.]

6.2. Nas rotas de conta (`/v1/auth`), o IP não vai para os registros do servidor.
Quando aparece, é como HMAC com segredo. [Fonte: `apps/api/src/app.ts:68-70`.]

6.3. Nas demais rotas (candidatura, lista de espera e painel), o IP **aparece em
claro** nos registros do servidor. [A DEFINIR PELO DONO e REVISAR COM O ADVOGADO:
prazo de guarda desses registros. Ver pendências, item 16.]

6.4. [A CONFIRMAR: se o servidor web que publica o site guarda registros de acesso
com IP, e por quanto tempo. Hoje não há configuração de prazo registrada.]

## 7. Cookies e armazenamento no seu aparelho ou navegador

7.1. **Site:** o site não grava cookies próprios de acompanhamento e não usa
ferramentas de análise. [A CONFIRMAR antes de publicar.] Ele carrega a fonte
Google Fonts a partir de servidores do Google, que podem registrar seu endereço
IP. [A DEFINIR PELO DONO: manter a fonte do Google, com aviso, ou hospedá-la no
próprio site.]

7.2. **Aplicativos:** a sessão fica guardada no cofre seguro do aparelho
(Keychain no iPhone e Keystore no Android). No navegador, a sessão fica só na
memória da aba e some ao recarregar a página. Não usamos armazenamento local do
navegador para a sessão. [Fonte: `apps/passenger/src/identity/identityClient.ts`.]

7.3. **Painel administrativo:** usa um cookie de sessão apenas para a equipe.
Visitantes e usuários comuns não recebem esse cookie.
[REVISAR COM O ADVOGADO: se é necessário aviso de cookies para o site.]

## 8. Menores de idade

8.1. O VuumBora **não atende menores de 18 anos**. A idade é conferida no cadastro
pela data de nascimento informada.

8.2. Se identificarmos que um menor criou conta, a conta será encerrada e os dados
apagados. [A DEFINIR PELO DONO: hoje não há rotina de exclusão de conta verificada
(ver pendências, item 3). Este item só pode ficar como está depois que o processo
existir. REVISAR COM O ADVOGADO: prazo e procedimento.]

8.3. Quem souber de conta de menor pode avisar em contato@vuumbora.com.br.

## 9. Retenção: por quanto tempo guardamos

O prazo abaixo é o que o código faz hoje. Os prazos marcados como [A DEFINIR]
ainda não existem no código.

| Dado | Prazo | Como é apagado | Fonte no código |
|---|---|---|---|
| Contas nunca confirmadas (e-mail não verificado), sem atividade por 7 dias | 7 dias | apagadas, com a senha, os códigos e o aceite | `apps/api/src/lib/identity-retention.ts:66-73` (padrão de 7 dias, linha 30) |
| Códigos de confirmação fechados ou vencidos | 7 dias depois de fechar ou vencer | apagados | `identity-retention.ts:80-83` |
| Sessões vencidas ou encerradas | 7 dias depois de vencer ou encerrar | apagadas | `identity-retention.ts:76-79` |
| Tentativas de login e cadastro | 2 dias | apagadas | `identity-retention.ts:74`; migração 0011 |
| Registro de acesso (`access_log`) | 90 dias | apagado | `identity-retention.ts:75`. [REVISAR COM O ADVOGADO: o plano previa 6 meses. Ver pendências, item 12.] |
| Falhas de login do painel | 1 dia | apagadas quando a rotina passa pela tabela | `admin-login-failure-repository.ts:45` |
| Conta confirmada (passageiro ou motorista) | enquanto a conta existir [A DEFINIR PELO DONO: prazo após encerramento] | **não há rotina de exclusão** | ver pendências, item 3 |
| Aceite dos Termos e da Política | enquanto a conta existir; apagado junto com a conta | em cascata | `apps/api/migrations/0019...sql:153` |
| Candidatura de motorista | [A DEFINIR PELO DONO: prazo] | **não há rotina**. Exclusão por pedido, por script do operador | `apps/api/scripts/delete-driver-application.mjs` |
| Lista de espera | [A DEFINIR PELO DONO: prazo] | **não há rotina**. Exclusão por pedido, por script do operador | `apps/api/scripts/delete-waitlist.mjs` |
| Trilha de auditoria do painel (`admin_audit_log`) | [A DEFINIR PELO DONO] | **não é apagada**. O banco impede a exclusão | `apps/api/src/lib/identity-retention.ts:8` |
| Registros técnicos do servidor e do site | [A CONFIRMAR] | [A CONFIRMAR] | seção 6 |

A rotina de retenção roda como tarefa diária, com credencial própria do banco
(`identity:retention`). [A CONFIRMAR: que a tarefa diária está ativa no servidor.]

## 10. Transferência internacional

10.1. Alguns serviços ficam fora do Brasil: Google Fonts (já ativo no site), Mapbox
e Expo (previstos). Quando um dado sair do Brasil, mandamos só o necessário.

10.2. [REVISAR COM O ADVOGADO: base para a transferência (art. 33 da LGPD), como
cláusulas-padrão ou país com nível adequado, e se é preciso informar a ANPD.]

## 11. Segurança

11.1. Senhas são guardadas só como hash. Códigos de confirmação também.

11.2. IPs nas contas são guardados como HMAC com segredo, não em claro. A exceção é
a trilha de auditoria do painel (seção 2.6).

11.3. Os tokens de sessão são aleatórios e giram a cada renovação. Quando um token
antigo é reutilizado, a família de sessões é encerrada.

11.4. Há limites de tentativas para cadastro, login, código e recuperação de senha.

11.5. Nenhum sistema é totalmente seguro. Se houver incidente que possa causar risco
ou dano relevante a você, comunicaremos a ANPD e você no prazo legal.
[REVISAR COM O ADVOGADO: prazo e conteúdo da comunicação.]

## 12. Seus direitos

Você pode pedir, a qualquer momento, por escrito a **contato@vuumbora.com.br**:

- confirmação de que tratamos seus dados;
- acesso aos seus dados;
- correção de dados incompletos, inexatos ou desatualizados;
- anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em
  desacordo com a lei;
- portabilidade dos seus dados a outro fornecedor;
- informação sobre com quem compartilhamos seus dados;
- informação sobre a possibilidade de não consentir e as consequências disso;
- revogação de consentimento, quando for a base usada;
- oposição a tratamento feito com outra base que não a lei permite.

12.1. Antes de responder, podemos pedir informações para confirmar que é você.

12.2. [REVISAR COM O ADVOGADO: prazo de resposta, conforme a LGPD e o regulamento
da ANPD.]

12.3. **O que já é possível hoje:** o pedido de exclusão de candidatura ou de
lista de espera é atendido por contato, com exclusão manual. A exclusão de conta
de passageiro ou motorista [A DEFINIR PELO DONO: ainda não existe no aplicativo;
ver pendências, item 3].

12.4. Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).

## 13. Mudanças nesta política

13.1. Quando esta política mudar, publicamos uma nova versão, com número e data.

13.2. Mudança relevante exige novo aceite no aplicativo. Correção de texto pode ser
editorial, sem novo aceite. [REVISAR COM O ADVOGADO: critério.]

13.3. [A CONFIRMAR NO PRODUTO: o bloqueio de novos atos até o aceite ainda não está
ligado. Ver pendências, item 19.]

## 14. Encarregado e contato

- Controladora: Innovare Code, CNPJ 09.813.446/0001-00
- Encarregado: [A DEFINIR PELO DONO]
- Contato: contato@vuumbora.com.br

[A DEFINIR PELO DONO: canal de suporte geral, que não se confunde com o de dados
pessoais.]

---

## 15. Histórico de versões desta política

| Versão | Data | Mudança |
|---|---|---|
| [A DEFINIR NA PUBLICAÇÃO] | [A DEFINIR] | primeira versão publicada |
