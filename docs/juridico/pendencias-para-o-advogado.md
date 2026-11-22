# Pendências para o advogado

> **RASCUNHO PARA REVISÃO DO ADVOGADO.** Este documento lista o que precisa de
> parecer jurídico ou de decisão do dono antes de os textos irem ao ar. Nada aqui é
> parecer jurídico.
>
> **Ordem de leitura:** primeiro a seção 1 (por que a estrutura é esta), depois a
> seção 2 (as pendências). Os itens marcados como **bloqueia publicação** precisam
> estar resolvidos antes de qualquer texto ser publicado.
>
> Data: 22/11/2026. Redigido pela Alexandria (documentação), com revisão do Atlas.

---

## 1. Por que a estrutura é esta

### 1.1. Termos separados por perfil

- **Passageiro:** relação de **uso** de uma plataforma. Regras de cadastro, corrida,
  pagamento, cancelamento e conduta.
- **Motorista:** relação de **prestação autônoma** de transporte, com obrigações
  próprias (habilitação para atividade remunerada, veículo, seguro, tributos,
  regras municipais). Misturar as duas no mesmo texto deixaria cláusulas de
  motorista aplicadas ao passageiro, e o contrário.
- **O banco já separa assim.** A tabela de versões legais tem a coluna `audience`
  (`passenger` ou `driver`), e a versão vigente é por perfil (ver
  `docs/contrato-identidade-apps.md`, seção "Aceite com versão exibida"). Dois
  textos são o encaixe natural.

### 1.2. Uma Política de Privacidade única, com seções por perfil

- **Mesmo controlador, mesmo encarregado, mesmo canal** (contato@vuumbora.com.br)
  e **mesmos operadores** (servidor, e-mail, mapa) para os dois perfis e para o site.
- **Um texto só evita contradição.** Erros de coerência costumam aparecer quando
  se lê o documento inteiro, não frase a frase. Uma única fonte reduz esse risco.
- **O banco aceita o mesmo texto para os dois perfis.** Publica-se uma linha por
  perfil, com o mesmo hash (`docs/contrato-identidade-apps.md`, seção "Publicação").
  Se o advogado quiser políticas separadas, é só publicar arquivos diferentes.

### 1.3. Candidatura do site e cadastro do app

- O site recebe **candidatura** (pré-cadastro). O app terá **cadastro**, que só
  abre depois das regras de taxa e repasse publicadas. Os textos usam as duas
  palavras com sentidos diferentes, e isso deve ser mantido.

---

## 2. Pendências

Cada item traz a pergunta, a opção recomendada e o impacto no produto. O impacto
mostra quem precisa mexer no código se a resposta mudar.

### Bloqueia publicação

**1. Razão social e endereço da controladora.** `bloqueia publicação`
- **Pergunta:** qual é a razão social completa da Innovare Code, como consta no
  cartão CNPJ (LTDA, ME ou outra forma)? Qual endereço deve constar nos textos?
- **Recomendação:** usar a razão social do cartão CNPJ. Para o endereço, o dono
  já decidiu não publicar a cidade no bloco institucional (decisão de 19/11/2026).
  O advogado deve dizer se o endereço completo é exigido nos termos. Se for, a
  decisão anterior precisa ser revista pelo dono.
- **Impacto:** nenhum no código. Sai nos cabeçalhos dos quatro documentos.

**2. Encarregado (DPO).** `bloqueia publicação`
- **Pergunta:** quem será o encarregado pelo tratamento de dados, e qual o contato?
- **Recomendação:** nomear uma pessoa (pode ser o dono) e manter
  contato@vuumbora.com.br como canal. O plano técnico (§8.1) já recomenda nomear
  encarregado.
- **Impacto:** nenhum no código. A caixa de contato precisa ser lida: o prazo de
  resposta a pedidos é legal.

**3. Exclusão de conta de passageiro e motorista.** `bloqueia publicação`
- **Situação verificada:** não existe rota de exclusão de conta na API
  (`apps/api/src/routes`, nenhuma rota de remoção de conta). Não existe script
  para excluir conta verificada (há scripts só para candidatura e lista de
  espera). O status `deleted` existe no banco (`apps/api/migrations/0010...sql:59`),
  mas nenhum código o grava. A retenção só apaga contas **nunca verificadas**.
- **Pergunta:** qual processo de exclusão vale antes de abrir o app, e qual prazo
  de atendimento? Em particular, o que é guardado depois da exclusão, por obrigação
  legal (corridas, pagamentos, aceite)?
- **Recomendação:** antes de publicar, um processo manual por pedido (o operador
  exclui e anonimiza a conta, como já é feito com a lista de espera). Depois, um
  botão no app. Vale também pelas lojas, que exigem caminho de exclusão de conta
  (registrado em `docs/decisoes-do-dono.md`, decisão de identidade).
- **Impacto:** Vega (rota ou script de exclusão e anonimização; o comentário
  `0010...sql:60` já diz que exclusão é anonimização). Lyra (botão no app). Textos
  `termos-*` seção 14 e 16, e política seção 12.3.

**4. Taxa, repasse e regras publicadas.** `bloqueia publicação`
- **Situação:** o dono decidiu em 20/11/2026 uma faixa de 20% a 25%, variável por
  tempo de plataforma, corridas e nota. Os cortes exatos ainda não existem. Pelo
  compromisso público do dono, as regras de taxa e repasse devem ser publicadas
  **antes** de o cadastro de motoristas abrir.
- **Pergunta:** quais são os cortes exatos, com que frequência a faixa é
  recalculada, e onde as regras serão publicadas (com versão e data)?
- **Recomendação:** publicar uma página "Regras de taxa e repasse" com versão, e
  apontar os termos para ela. **Os termos não trazem percentual.** O compromisso
  público vale como texto, e o número só entra quando for publicado de propósito.
- **Impacto:** Lyra e Vega (página de regras e vínculo com a versão). Bloqueia a
  abertura do cadastro de motoristas. Termos motorista seção 6.

**7. Seguro.** `bloqueia publicação` (para motoristas)
- **Pergunta:** quais seguros são exigidos do motorista e da plataforma, quem
  contrata, quem paga e o que cada um cobre? Isso inclui o seguro de acidentes
  pessoais para passageiros e o seguro obrigatório do veículo. O plano (§8.2) cita
  a Lei 12.587/2012, art. 11-A, como base.
- **Recomendação:** confirmar com advogado e corretor antes de abrir o cadastro.
  Enquanto não houver resposta, o cadastro de motorista não abre.
- **Impacto:** custo operacional. Pode mudar o valor da corrida e a taxa. Termos
  motorista seções 3.3 e 11.

**8. Regras municipais de Natal (STTU).** `bloqueia publicação` (para motoristas)
- **Situação:** o plano (§8.2) cita, segundo a imprensa, vistoria anual pela STTU
  (ou empresa autorizada), idade máxima de 10 anos para o veículo, certidão de
  regularidade no INSS e obrigação da plataforma de proteger dados. O número da lei
  e a data de vigência **não foram confirmados**.
- **Pergunta:** qual é o número e a vigência da lei municipal? Quais exigências
  valem hoje para o motorista e para a plataforma?
- **Recomendação:** confirmar com a STTU e com o advogado antes de publicar. Os
  termos só citam a lei depois de confirmada.
- **Impacto:** a verificação de documentos (decisão 9 do dono) e o cadastro.
  Termos motorista seção 3.3.

**12. Prazo de guarda do registro de acesso.** `bloqueia publicação`
- **Divergência verificada:** o plano prevê **6 meses** para registro de acesso,
  com base no Marco Civil da Internet, art. 15 (`docs/plano-sistema-arquitetura.md`,
  linhas 541 e 785). O código apaga o `access_log` em **90 dias**
  (`apps/api/src/lib/identity-retention.ts:75`; `apps/api/migrations/0011...sql:229`).
- **Pergunta:** o art. 15 do Marco Civil se aplica a este serviço? Se sim, qual é o
  prazo mínimo de guarda? A resposta vale para os registros de acesso do app.
- **Recomendação:** o advogado confirma. Se o prazo for de 6 meses, ajustar
  `DEFAULT_RETENTION.accessLogDays` antes da publicação.
- **Impacto:** Vega (uma constante). Política seção 9.

### Antes do cadastro de motoristas

**5. Carteira e saldo.**
- **Pergunta:** o VuumBora terá saldo guardado para o passageiro? A recomendação
  de 18/11/2026 é não ter, no início.
- **Recomendação:** sem saldo. Se mudar, é preciso avaliar com contador e
  advogado a natureza do valor guardado.
- **Impacto:** termos passageiro seção 6.2. Se houver saldo, o texto muda muito.

**6. Cancelamento e multa.**
- **Pergunta:** até quando o cancelamento é gratuito? Há multa depois que o
  motorista está a caminho? Quanto dela vai para o motorista? O que acontece quando
  o motorista cancela?
- **Recomendação:** janela curta e sem custo; multa só depois de o motorista estar a
  caminho; parte da multa para o motorista; penalidade ao motorista só com aviso e
  direito de resposta.
- **Impacto:** regras de cancelamento nas telas. Termos passageiro seção 7, motorista
  seção 8.

**9. Natureza da relação do motorista.**
- **Situação:** o plano (§8.2) cita o PLP 12/2024 (remuneração mínima por hora
  engajada, regras de INSS) e o PLP 152/2025 (INSS de 5%, teto de 30% para a taxa
  da plataforma). Em 21/10/2026 ainda não havia votação.
- **Pergunta:** a cláusula de prestação autônoma se sustenta com essas propostas? O
  texto precisa de cláusula de adaptação se a lei mudar?
- **Recomendação:** manter a relação autônoma com cláusula de adaptação e aviso
  prévio. O teto de 30% do PLP 152 é relevante para a faixa de 20% a 25%.
- **Impacto:** termos motorista seções 2.2 e 15.4. Se a lei mudar, o sistema muda
  de configuração, não de arquitetura (plano, §8.2).

**10. Entrega e Pet.**
- **Situação verificada:** a categoria "entrega" aparece na tela inicial do
  passageiro (`apps/passenger/app/(app)/index.tsx:32`), sem regra definida. Não
  encontrei nenhuma referência a "pet" no código do app.
- **Pergunta:** essas categorias vão existir no lançamento?
- **Recomendação:** retirar do texto até a decisão do dono.
- **Impacto:** termos motorista seção 5.5. Se existirem, precisam de regra própria.

**11. Foro, limitação de responsabilidade e Marco Civil.**
- **Pergunta:** qual foro? Qual limitação de responsabilidade é possível, sem
  contrariar o Código de Defesa do Consumidor? Como tratar a responsabilidade pelo
  conteúdo de avaliações e denúncias, à luz do Marco Civil da Internet?
- **Recomendação:** o advogado redige. Os rascunhos não inventam limite nem foro.
- **Impacto:** termos, seções de responsabilidade e foro (passageiro 8.4, 15, 16;
  motorista 17, 18).

**13. Trilha de auditoria do painel com IP em claro.**
- **Situação verificada:** o `admin_audit_log` grava o IP em claro
  (`apps/api/src/services/admin-auth-service.ts:154`, com `request.ip` de
  `apps/api/src/routes/admin-auth-route.ts:63`). O banco impede apagar essas linhas.
  Não existe prazo de guarda. O dono decidiu manter em claro em 21/11/2026.
- **Pergunta:** a finalidade (segurança e auditoria) justifica guardar o IP em claro
  sem prazo? O advogado pode exigir prazo máximo.
- **Recomendação:** manter a decisão do dono, mas definir finalidade, base legal e
  prazo no texto. Se a exigência for de prazo, o trigger de inviolabilidade precisa
  de procedimento próprio.
- **Impacto:** política seções 2.6 e 9. Dev (procedimento de expurgo, se houver).

**14. Prazo para candidatura e lista de espera.**
- **Situação verificada:** `driver_applications` e `waitlist_signups` não entram na
  rotina de retenção. Só saem por pedido de exclusão, por script do operador.
- **Pergunta:** qual prazo de guarda vale? Por exemplo, até o lançamento, ou por
  X meses sem atualização?
- **Recomendação:** definir um prazo e incluir essas tabelas na rotina.
- **Impacto:** Vega (rotina de retenção). Política seção 9.

**15. Aviso sem caixa de aceite na candidatura.**
- **Situação verificada:** o formulário mostra o aviso ao lado dos campos
  (`apps/site/public/index.html:170-171`), sem caixa de aceite.
- **Pergunta:** a base é a etapa pré-contratual (art. 7º, V), que dispensa
  consentimento? Ou a caixa de aceite é necessária?
- **Recomendação:** manter sem caixa, com base pré-contratual e aviso visível,
  se o advogado concordar. Se não concordar, adicionar uma caixa "li o aviso".
- **Impacto:** Lyra (formulário, se a caixa for exigida).

**16. Registros com IP em claro fora de `/v1/auth`.**
- **Situação verificada:** nas rotas de candidatura, lista de espera e painel, o
  IP vai em claro nos registros do servidor (`apps/api/src/app.ts:71-74`). Nas
  rotas de conta, não vai (`app.ts:68-70`). Na configuração do site, o `access_log`
  só está desligado num bloco de `location` (`apps/site/nginx.conf:96`). **Não
  verifiquei** a configuração do servidor de produção.
- **Pergunta:** qual prazo de guarda vale para os registros do servidor e do site?
- **Recomendação:** guardar o IP nos registros só como HMAC, como já é feito nas
  contas. Definir um prazo curto para o resto. Confirmar a configuração do nginx e
  do Easypanel.
- **Impacto:** Vega (registro de IP), Vulcano (configuração do nginx e do
  Easypanel). Política seção 6.

**17. Google Fonts no site.**
- **Situação verificada:** o site carrega fontes de `fonts.googleapis.com` e
  `fonts.gstatic.com` (`apps/site/public/index.html:20-22`). O navegador envia o IP
  ao Google, que fica fora do Brasil.
- **Pergunta:** manter a fonte do Google com aviso, ou hospedá-la no próprio site?
- **Recomendação:** hospedar a fonte no próprio site. É simples e tira um operador
  e uma transferência internacional.
- **Impacto:** Lyra (trocar a origem da fonte). Política seções 5, 7.1 e 10.

**18. Mapbox e Expo Push.**
- **Situação verificada:** o Mapbox aparece só em telas de desenvolvimento
  (`apps/passenger/app/(dev)/mapbox-check.tsx`). O Expo Push não está nas
  dependências. Os dois estão no plano (§8.1) como transferência internacional
  prevista.
- **Pergunta:** os textos devem citar esses operadores já agora, como previstos, ou
  só quando ativos?
- **Recomendação:** citar como previstos, com a nota de que não estão ativos. Antes
  de ativar, o advogado revisa a transferência.
- **Impacto:** política seção 5 e 10. Dev (quando ativar).

**19. Aceite pendente não bloqueia nada ainda.**
- **Situação verificada:** o `requireCurrentConsent` existe, mas nenhuma rota o usa
  (`apps/api/src/hooks/require-current-consent.ts`; contrato, "Sinal e rota").
- **Pergunta:** o texto pode prometer que, depois de uma mudança relevante, o
  usuário não pede corrida até aceitar?
- **Recomendação:** ligar o bloqueio antes da primeira mudança relevante depois do
  lançamento. Até lá, o texto diz "a confirmar".
- **Impacto:** Vega (ligar o `preHandler` nas rotas de compromisso novo).

**20. Localização e posição do motorista.**
- **Situação verificada:** o app não usa `expo-location` nas dependências, nem uso
  em segundo plano. O plano (§8.1) propõe não guardar posição de motorista fora de
  corrida, e guardar a trilha da corrida por 6 a 12 meses.
- **Pergunta:** o uso em segundo plano é necessário? Qual o prazo para a trilha da
  corrida? A posição fora de corrida deve ser guardada?
- **Recomendação:** só com o app aberto, sem segundo plano por enquanto. Não guardar
  posição fora de corrida. Trilha da corrida por prazo curto, a definir.
- **Impacto:** Lyra e Vega. Permissões de localização em segundo plano pedem
  justificativa nas lojas. Termos passageiro seção 10, motorista seção 10,
  política seção 2.4 e 2.5.

**21. Documentos e antecedentes do motorista (etapa 2).**
- **Situação:** não coletado hoje. Entra só depois da aprovação, em etapa própria
  (decisão 19/11/2026).
- **Pergunta:** a certidão de antecedentes é dado sensível (art. 5º, II) ou não? Qual
  base legal e prazo de guarda para os documentos, e de quem reprovado?
- **Recomendação:** responder antes de a etapa 2 existir. O plano (§8.1) propõe
  guardar o resultado e a validade, e apagar o arquivo pelo tempo necessário.
- **Impacto:** Vega e Cronos (armazenamento), quando a etapa 2 for construída.

**22. Prazos legais de direitos e incidente.**
- **Pergunta:** qual o prazo para responder pedidos do titular, e o prazo para
  comunicar incidente à ANPD e aos titulares? O plano (§8.1) cita 3 dias úteis,
  segundo o regulamento de 2024, e pede validação.
- **Recomendação:** o advogado confirma os prazos. Plano de resposta a incidente
  escrito antes do lançamento (o plano pede isso antes do beta).
- **Impacto:** política seções 11.5 e 12.2. Processo do operador.

**23. Transferência internacional.**
- **Pergunta:** qual base do art. 33 da LGPD vale para Google Fonts (já ativo), Mapbox
  e Expo (previstos)? É preciso informar a ANPD?
- **Recomendação:** o advogado indica a base. Os textos já dizem o que sai do Brasil,
  sem prometer mais que isso.
- **Impacto:** política seção 10.

**24. Critério de mudança relevante ou editorial.**
- **Pergunta:** o que conta como mudança relevante (exige novo aceite) e o que é
  correção editorial?
- **Recomendação:** o advogado dá uma lista de exemplos. Em caso de dúvida, tratar
  como relevante (padrão seguro do banco).
- **Impacto:** o campo `requires_reacceptance` na publicação de cada versão.

**25. Idade mínima.**
- **Situação verificada:** a idade é conferida pela data de nascimento informada, no
  servidor e no banco, no fuso de Natal (`apps/api/src/domain/birth-date.ts`,
  `apps/api/migrations/0019...sql:41-43`). Não há documento de identidade.
- **Pergunta:** a autodeclaração com conferência pela data basta? O motorista
  deveria ter verificação mais forte (a CNH, na etapa 2)?
- **Recomendação:** manter a autodeclaração no cadastro. Para motorista, a CNH na
  etapa 2 já cobre a idade.
- **Impacto:** nenhum agora.

**26. E-mail já cadastrado é revelado.**
- **Situação verificada:** o cadastro responde `409 email_taken` para conta
  verificada (`docs/contrato-identidade-apps.md`). O dono aceitou revelar isso, em
  21/11/2026, com limite de consultas por IP.
- **Pergunta:** essa revelação é compatível com a LGPD? Precisa constar na política?
- **Recomendação:** registrar na política como finalidade de segurança do cadastro.
- **Impacto:** política seção 2.3 (nota). Nenhum no código.

**27. Marketing e canal de suporte.**
- **Situação:** não há envio de marketing. O mesmo endereço (contato@) serve para
  pedidos de dados e para suporte (decisão 11, em aberto).
- **Pergunta:** o dono quer separar os canais? Confirmar que não haverá marketing
  sem consentimento separado.
- **Recomendação:** separar o assunto por e-mail, ou por endereço, quando o suporte
  for definido.
- **Impacto:** nenhum agora.

---

## 3. Como publicar (passo a passo)

Os textos só vão ao ar depois de a revisão do advogado e a decisão do dono. A
publicação é imutável: erro de texto ou de hash não se edita. Publica-se a versão
seguinte. As referências são `docs/publicar-o-backend.md` (seção "Termos de Uso e
Política") e `docs/contrato-identidade-apps.md` (seção "Publicação").

1. **Fechar os textos.** Advogado e dono revisam os quatro arquivos. Remover os
   marcadores `[A DEFINIR]` e `[REVISAR]`, a nota de estado e o anexo técnico da
   política.

2. **Escolher o formato do arquivo publicado.** O hash é dos **bytes exatos**
   servidos. Recomendação: texto UTF-8 com quebras de linha LF, ou HTML simples.
   Decidir com Lyra e Vega antes de gerar o hash.

3. **Escolher a versão.** Formato aceito: letras, números, `.`, `_`, `:`, `+` e `-`,
   até 64 caracteres. Exemplo: `2026-12-01`. Use a mesma versão para os arquivos do
   mesmo lote.

4. **Hospedar** em `apps/site/public/legal/<terms|privacy>/<passenger|driver>/<versão>`,
   sem extensão no endereço (`publicar-o-backend.md:199-200`). Vulcano confere que
   o nginx serve o arquivo com `Content-Type` correto e sem cache que deixe a versão
   mudar. Republicar o site depois de adicionar os arquivos.

5. **Calcular o hash dos bytes que o endereço serve**, não do arquivo local:
   ```bash
   curl -s -o terms-passenger.txt https://www.vuumbora.com.br/legal/terms/passenger/2026-12-01
   sha256sum terms-passenger.txt
   ```
   O resultado tem 64 caracteres hexadecimais minúsculos. Repetir para os arquivos.

6. **Conferir sem gravar nada:**
   ```bash
   node scripts/publish-legal.mjs --document=terms --audience=passenger --version=2026-12-01 --sha256=<hash> --dry-run
   ```
   Rodar a partir de `apps/api`, depois do `npm run build`.

7. **Publicar, com a credencial dona do banco**, em terminal de operador. Nunca no
   repositório nem no chat. Os termos são arquivos diferentes por perfil, então são
   dois comandos. A política é um arquivo só, então é um comando para os dois perfis:
   ```bash
   MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/publish-legal.mjs --document=terms --audience=passenger --version=2026-12-01 --sha256=<hash-termos-passageiro>
   MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/publish-legal.mjs --document=terms --audience=driver --version=2026-12-01 --sha256=<hash-termos-motorista>
   MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/publish-legal.mjs --document=privacy --audience=passenger,driver --version=2026-12-01 --sha256=<hash-politica>
   ```
   Use `--requires-reacceptance=false` **somente** para correção editorial, que não
   exige novo aceite. O padrão é exigir. Se o advogado quiser políticas separadas
   por perfil, são quatro comandos.

8. **Conferir:**
   ```bash
   curl -s "https://api.vuumbora.com.br/v1/legal/current?audience=passenger"
   curl -s "https://api.vuumbora.com.br/v1/legal/current?audience=driver"
   ```
   O `sha256` devolvido tem de bater com o hash do arquivo baixado da `url`.

9. **Só depois** de publicado, configurar `LEGAL_DOCUMENTS_BASE_URL` no serviço da
   API, no Easypanel, e abrir o cadastro. Sem versão publicada, o cadastro responde
   `503 consent_unavailable`, e isso é o comportamento esperado.

**Bloqueios para publicar:** itens 1, 2, 3, 4 e 12. Os itens 7 e 8 bloqueiam o
cadastro de motoristas, e não a publicação dos textos de passageiro.

---

## 4. Onde hospedar (sugestão)

**Recomendação:** hospedar no próprio site, em `apps/site/public/legal`, servido pelo
nginx no Easypanel. É o caminho que `docs/publicar-o-backend.md` já sugere.

**Por quê:**
- o dono decidiu, em 18/11/2026, hospedar tudo no servidor dele (Easypanel);
- evita um terceiro no meio do aceite, o que é coerente com o que o site diz sobre
  dados;
- a versão fica no mesmo domínio e sob o mesmo controle do site.

**Alternativas e o que pesam:** Vercel, Cloudflare Pages e Netlify funcionam para
arquivo estático, mas põem um operador a mais, com possível transferência
internacional. Só valem se o servidor do dono cair ou se o volume exigir.

**Quem executa:** Vulcano (hospedagem e cabeçalhos). Vega ou Cronos (ajustes de
constante de retenção, se o item 12 mudar o prazo). Dono (publicação, com a
credencial dona). Atlas (nenhum commit feito nesta tarefa).

---

## 5. O que não consegui conferir

- Configuração do servidor de produção: se a rotina diária de retenção está ativa,
  qual o `access_log` do nginx em produção e quais variáveis estão no Easypanel.
- Estado do app em produção: o app do passageiro e o do motorista usam
  `IDENTITY_MODE = 'mock'`. A ligação à API real é a etapa B4, ainda não feita. Os
  textos descrevem o serviço quando estiver no ar.
- Telas de corrida concluída e de avaliação: não li todas as telas. A regra "só o
  passageiro avalia" vem da decisão do dono de 18/11/2026.
- Lei municipal de Natal: não confirmei número nem vigência. Os dados vêm do plano,
  que cita imprensa.
- Marco Civil, art. 15, e demais artigos de lei: os artigos citados vêm do plano
  técnico. Não os confirmei no texto legal.
- Google Fonts: a lista de dados enviados ao Google é a esperada para esse tipo de
  carregamento. Não medi o tráfego.
- Mapbox e Expo: confirmei que não estão ativos no código de produção, mas não
  verifiquei o pacote instalado.
- Caminho de exclusão de conta: a ausência foi verificada pela lista de rotas e de
  scripts. Não rodei a API.
- Cálculo de idade no fuso de Natal: li o código, mas não rodei testes sobre ele
  nesta tarefa.
