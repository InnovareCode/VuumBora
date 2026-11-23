# Conferência dos acréscimos de contrato PP-12 (Nova, 22/11/2026)

**Alvo:** commit `17c3907`, na branch `fatia/pp12`, feito sobre a `main` `c971581`.

**Régua:**
- a PP-12 e a PP-14 em `docs/fichas-de-tela/README.md`, nas "Decisões em aberto" e no parágrafo "Decididas pelo Atlas"
  logo abaixo;
- as duas decisões do dono de 22/11 em `docs/decisoes-do-dono.md`: na oferta, o embarque e o destino aparecem só pelo
  bairro, e o endereço exato fica só com o motorista atribuído;
- a ficha `docs/fichas-de-tela/M12-historico-de-corridas.md`;
- o contrato de identidade (`docs/contrato-identidade-apps.md`, `POST /v1/auth/delete-account`).

**Método:**
- Extraí `packages/domain` e `packages/api-client` do commit, com `git archive`, para uma pasta temporária fora do
  repositório. A árvore de trabalho não foi tocada.
- Rodei os testes dessa cópia:
  - `packages/domain`: `tests 30 · suites 9 · pass 30 · fail 0`.
  - `packages/api-client`: `tests 308 · suites 46 · pass 308 · fail 0`.
- Rodei uma sonda contra os mocks do commit e contra o cliente de identidade em modo `http`, com um `fetch` falso.
- Li a rota e o serviço de exclusão de conta em `apps/api`.
- Não rodei o `typecheck` dos apps. Para saber quem consome os tipos e portas alterados, usei `git grep` no commit.

Marquei **[provado]** o que vi acontecer na sonda; o resto vem da leitura do código.

---

## Veredito: AJUSTES (pequenos, um commit)

A forma está certa e é aditiva. A faixa da viagem respeita as duas decisões do dono. O histórico do motorista não
carrega endereço exato. Sobram dois defeitos nos históricos (P1 e P2), um campo além do necessário (P3) e a resposta
da senha errada na exclusão de conta (P4), que hoje faz a pessoa receber "muitas tentativas" em vez de "senha
incorreta".

---

## 1. Está tudo aditivo e compatível com o que os apps consomem hoje?

**Sim.**

| Acréscimo | Forma | Quem consome hoje (`git grep` em `17c3907`) | Quebra? |
|---|---|---|---|
| `TripDriverSummary.vehicleModel?`, `vehicleColor?`, `rating?` | campos opcionais | o app do passageiro, pelo mock (`setDriverSummary`) | Não |
| `RideOffer.tripDistanceM` e `tripDurationS` (`Range`) | obrigatórios num tipo de saída | ninguém constrói `RideOffer` fora do mock; `NewRideOfferCard` tem props próprias | Não |
| `PassengerRidePort.history` | método novo numa interface | o app usa `createMockPassengerRidePort()`, que já traz o método; ninguém implementa a interface fora do pacote | Não |
| `DriverTripHistoryPort` e `historyPort` no mock | porta nova | ninguém | Não |
| `IdentityApi.deleteAccount` e `IdentityClient.deleteAccount` | método novo | os apps usam `createIdentityClient()`; ninguém implementa as interfaces fora do pacote | Não |
| `Range` e `toTripRange` no domínio | exportações novas | ninguém | Não |

Observação de nome, sem bloquear: `Range` tem o mesmo nome de um tipo global do DOM. No painel admin, que compila com
o DOM, um arquivo que esqueça o `import` pega o `Range` do navegador sem aviso; a forma diferente faria o compilador
reclamar, então o erro aparece. Se quiser evitar a confusão, `NumericRange`.

## 2. A faixa da viagem revela mais que o bairro? Respeita as duas decisões do dono?

**Respeita.** A oferta continua sem endereço nem ponto exato. A faixa é de 1 km por 5 min, e os limites são fixos,
sempre os mesmos para a mesma corrida (sonda: 999 m vira 0–1 km, 5200 m vira 5–6 km, 5999 m vira 5–6 km). Repetir a
oferta, portanto, não acrescenta informação.

Por que a faixa é a escolha certa:
- O motorista sabe onde ele está e recebe a distância até o embarque arredondada a 100 m. Isso já coloca o embarque
  numa faixa de cerca de 100 m dentro do quadrado de 1,1 km.
- Se a distância da viagem viesse exata, o destino cairia, pelo mesmo raciocínio, numa faixa de 100 a 200 m dentro do
  quadrado dele. Isso seria mais que o bairro.
- Com uma faixa de 1 km, quase do tamanho do quadrado, a distância não estreita o destino de forma útil. A duração em
  faixas de 5 min (cerca de 2 km no trânsito urbano) é ainda mais grossa e não acrescenta nada.

**Risco que sobra, ligado à decisão 7 (não é desta fatia):** o `estimatedPayout` vai exato na oferta. Quando a tabela
de tarifa for pública (as regras de taxa e repasse serão publicadas), um motorista pode fazer a conta ao contrário,
valor → km, e recuperar a distância com mais precisão que 1 km. O quanto ele recupera depende da relação entre o
preço por km e o preço por minuto: quanto menor o preço por minuto, mais exato fica o km. Quando a decisão 7 fixar a
tarifa, refazer essa conta. Se ela fixar a distância abaixo de cerca de 1 km, arredondar o ganho na oferta (por
exemplo, a R$ 0,50) ou aceitar o risco. Essa escolha é do dono, porque mexe no dinheiro que o motorista vê.

## 3. O histórico do motorista nunca carrega endereço exato, por construção?

**Sim, no tipo e no mock.**
- `DriverTripHistoryEntry.pickup` e `destination` são `ApproximatePlace`. Um `Place` não cabe nesse tipo (não tem
  `approximatePoint`, e o bairro é opcional nele), então passar o lugar exato não compila.
- O mock monta as duas pontas com `toApproximatePlace`, que cria um objeto novo com só dois campos.
- Na sonda, a entrada do histórico não contém endereço, número, coordenada exata nem rótulo **[provado]**.

**Condição para quando o histórico existir de verdade:** o TypeScript não barra campo a mais num objeto que não foi
escrito literalmente. A garantia "por construção" depende de duas coisas:
- o servidor monta o histórico a partir de uma consulta que nunca seleciona o endereço;
- o adaptador `http` monta cada `ApproximatePlace` campo por campo. O teste que prova isso: o servidor manda `address`
  a mais e o cliente descarta.

Esse é o ponto para a revisão do Órion que a PP-14 já prevê.

Ao lado dessa pergunta, encontrei dois problemas: P1 (o histórico mostra corrida que não é do motorista) e P3 (o nome
do passageiro vai além do que a M12 usa).

## 4. `deleteAccount`: senha errada como 401

**Recomendação: 403 `wrong_password` no servidor.** Nem um `kind` próprio no cliente, nem deixar como está.

O que acontece hoje:
1. **Cliente [provado]:** com `401 wrong_password`, o `session.run()` faz `delete-account → refresh → delete-account`.
   A senha errada é conferida duas vezes, e a sessão é renovada uma vez a cada tentativa. Com `403`, sai uma chamada
   só, o erro volta como `forbidden` com `code: 'wrong_password'`, e a sessão continua aberta.
2. **Servidor (leitura de `apps/api/src/services/identity-service.ts` e `repositories/identity-repository.ts`; não
   rodei contra a API real):**
   - Cada senha errada grava uma falha no par conta+IP e uma linha `login_failure` no `access_log`.
   - A espera progressiva começa em 1 s logo depois da primeira falha (`delayAfterFailures`: base × 2^(falhas − 1)).
   - A repetição automática do cliente chega dentro dessa janela, depois de um `/refresh` que leva bem menos de 1 s, e
     recebe `429 too_many_attempts`.
   - Resultado provável com a API real: a pessoa erra a senha uma vez e a tela mostra "muitas tentativas", nunca
     "senha incorreta".
   - Além disso, cada erro conta em dobro na auditoria.
3. **Por que 403 e não um `kind` novo:**
   - Um `kind` novo obrigaria o `SessionManager` a ler o `code` das chamadas de dados antes de decidir se renova a
     sessão. Isso acopla a renovação a cada rota e muda a união `ApiErrorKind`, que os apps usam em `switch`.
   - O 403 resolve no lugar certo, com precedentes: a identidade já usa `403 email_not_verified` com o mesmo desenho, e
     o painel admin fez a mesma troca.
   - O `run()` só renova em `unauthorized`, e o M-4 continua valendo: 403 nunca desconecta.
4. **Por que agora:** nenhum app chama `deleteAccount` ainda, porque o método nasceu neste commit, e a rota não está em
   produção (o M2 não fechou; o Atlas confere). Depois que um app publicado depender do 401, mudar vira quebra.

---

## O que falta

**P1 (médio). O histórico do motorista mostra corrida que ele devolveu.**
- **Prova [provado]:** A aceita e cancela, a corrida volta para a busca, B aceita e conclui. O histórico de **A**
  ganha a entrada `completed`, com `payout` de R$ 15,00, de uma corrida que foi do B.
- **Arquivos:** `packages/api-client/src/driver/mock-adapter.ts` (`watchForHistory`) e o JSDoc de
  `DriverTripHistoryPort` em `packages/api-client/src/driver/types.ts`.
- **Muda:** a entrada só é gravada se, no estado final, a corrida ainda está atribuída a este motorista. O contrato
  passa a dizer: "só corridas que terminaram com este motorista atribuído (concluídas, ou canceladas enquanto ele era o
  atribuído); corrida devolvida à busca não entra". É a mesma regra de visibilidade do R1 da F08.
- **Teste:** o cenário acima; o histórico de A fica vazio e o de B tem a corrida.

**P2 (médio). Dinheiro em corrida cancelada ou que falhou.**
- **Prova [provado]:**
  - O passageiro cancela e o histórico dele mostra `fare` R$ 18,90.
  - Uma corrida cancelada pelo sistema antes de ter motorista também mostra `fare` R$ 18,90.
  - O histórico do motorista mostra `payout` R$ 15,00 numa corrida cancelada.
- **Arquivos:** `passenger/types.ts` (`PassengerTripHistoryEntry`), `driver/types.ts` (`DriverTripHistoryEntry`) e os
  dois mocks.
- **Muda:**
  - `fare?: Money` aparece só em `completed`, e quer dizer o **valor final cobrado**, não a estimativa. O domínio separa
    estimativa e valor final de propósito.
  - `cancellationFee?: Money` existe para `cancelled`. Fica vazio até a decisão 15 (M6).
  - `payout?: Money` aparece só quando houve ganho. O que conta como ganho numa corrida cancelada fica para a decisão 15,
    e o valor por corrida para a decisão 7 (D-23).
- **Por quê:** a P11 e a M12 mostrariam valor numa corrida que não teve cobrança nem ganho. É dinheiro na frente de
  passageiro e de motorista, e a D-38 já limita o histórico a "total e forma de pagamento".

**P3 (baixo, minimização). O nome do passageiro no histórico do motorista.**
- **Arquivo:** `driver/types.ts` (`DriverTripHistoryEntry.passenger`) e o mock.
- **Muda:** retirar o campo.
- **Por quê:**
  - A ficha da M12 pede "bairros, horários, distância, categoria e valor". O nome não é usado.
  - A PP-14 é minimização: nome, bairro e horário guardados por meses é dado pessoal de outra pessoa sem uso para o
    motorista.
  - Tirar agora não custa nada; tirar depois quebra quem consumir.
  - Se o Atlas ou o Órion quiserem o nome, a decisão precisa ser explícita.

**P4 (médio). Senha errada na exclusão de conta.**
- **Arquivos:**
  - `apps/api/src/routes/auth-route.ts` (`fail(reply, 401, 'wrong_password', …)` passa a 403);
  - `docs/contrato-identidade-apps.md`, na lista de erros do `delete-account`;
  - `packages/api-client/src/identity/mock-adapter.ts` (`reject(401, 'wrong_password', …)` passa a 403);
  - o JSDoc de `IdentityApi.deleteAccount` e `IdentityClient.deleteAccount`;
  - os testes `identity-http.test.ts` e `identity-mock.test.ts`, inclusive o comentário que diz "sem efeito prático".
- **Teste novo:** com `403`, uma única chamada no fio, nenhum `/refresh`, a sessão continua aberta, e o erro volta como
  `forbidden` com `code: 'wrong_password'`.
- **Zona:** a mudança no servidor fica fora de `packages/**`. O Atlas decide quem faz. O Órion deve olhar, porque é
  superfície de autenticação.

## Não bloqueia (registro)

- O ganho exato na oferta e a tarifa pública podem desfazer a faixa de 1 km: refazer a conta quando a decisão 7 sair
  (seção 2).
- Escrever no tipo que `Range` é `[min, max)` (a tela mostra "5–6 km"). O nome pode passar a `NumericRange` (seção 1).
- `limit` acima de 50 é reduzido para 50 sem erro, como está documentado.
- O período do histórico filtra por `requestedAt` no passageiro e por `endedAt` no motorista. Os dois estão
  documentados, e cada um faz sentido para o seu perfil.
