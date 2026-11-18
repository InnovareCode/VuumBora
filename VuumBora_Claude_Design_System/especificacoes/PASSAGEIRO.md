# Especificação de telas — VuumBora Passageiro
**Referência:** `referencias/passageiro_telas.png`, `referencias/passageiro_home.png`
**Regra:** telas são propostas; não tratar mockups como recursos implementados.

| ID | Tela | Objetivo | Elementos e ações |
|---|---|---|---|
| P01 | Boas-vindas | Apresentar marca | logo, promessa sucinta, Entrar, Cadastrar |
| P02 | Login/cadastro | Autenticar | celular/e-mail, senha, recuperação, consentimentos |
| P03 | Início/mapa | Iniciar solicitação | posição atual, busca de destino, casa/trabalho, favoritos |
| P04 | Origem e destino | Definir rota | endereços, autocomplete, confirmação no mapa |
| P05 | Categoria e orçamento | Escolher tipo de viagem | categorias de veículo, ETA e preço estimados, forma de pagamento |
| P06 | Confirmação | Revisar pedido | origem, destino, preço, pagamento, botão Solicitar |
| P07 | Buscando motorista | Exibir estado de busca | animação discreta, botão cancelar conforme regras |
| P08 | Motorista atribuído | Informar coleta | dados necessários, placa, veículo, ETA, contato e segurança |
| P09 | Corrida em andamento | Acompanhar trajeto | rota, ETA, informações do motorista, segurança |
| P10 | Viagem concluída | Fechar fluxo | valor final, comprovante, avaliação, suporte |
| P11 | Histórico | Consultar corridas | lista, detalhe, filtros simples, comprovante |
| P12 | Pagamento/carteira | Gerenciar pagamento | Pix/cartão se habilitados; saldo apenas se modelo financeiro permitir |
| P13 | Perfil/configurações | Dados e preferências | nome, telefone, lugares salvos, notificações, privacidade |
| P14 | Ajuda/segurança | Resolver problemas | central de ajuda, relatar problema, canal de suporte |

## Padrões de UX
- CTA principal amarelo, único por área de decisão.
- O mapa não pode impedir leitura dos endereços.
- Exibir “preço estimado” quando não houver preço final confirmado.
- “Motorista verificado”, promoções e carteira dependem de operação real.
- Fornecer opção explícita de desistir quando aplicável.
- Tratar permissão de localização negada com entrada manual de endereço.
- Nunca iniciar uma corrida real usando apenas dados de teste.

## Critérios funcionais mínimos
1. Passageiro só solicita após origem, destino, categoria e método de pagamento estarem válidos.
2. Exibir erro recuperável para indisponibilidade de motoristas ou falha de rede.
3. Estado da viagem sincronizado com o servidor; bloquear transições impossíveis.
4. Após finalização, apresentar comprovante e permitir avaliação.
5. Ações de telefone e chat usam canais realmente disponíveis, com tratamento de falhas.
