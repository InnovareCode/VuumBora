# Especificação de telas — VuumBora Motorista
**Referência:** `referencias/motorista_telas.png`, `referencias/motorista_home.png`
**Regra:** telas são propostas; não tratar mockups como recursos implementados.

| ID | Tela | Objetivo | Elementos e ações |
|---|---|---|---|
| M01 | Boas-vindas/login | Identificação | logo, telefone/e-mail, senha, recuperar acesso |
| M02 | Cadastro | Solicitar entrada | dados pessoais e consentimentos |
| M03 | Veículo/documentos | Onboarding | CNH, documento do carro, demais exigências conforme operação |
| M04 | Análise cadastral | Informar aprovação | pendente, aprovado, reprovado, solicitação de correção |
| M05 | Dashboard | Controle da jornada | status online/offline, mapa, ganhos, corridas, avisos |
| M06 | Nova corrida | Decidir aceitar | embarque, destino quando permitido, distância, estimativa, aceite, recusa, expiração |
| M07 | A caminho do embarque | Navegar | instruções de rota, endereço, contato com passageiro |
| M08 | Embarque confirmado | Iniciar viagem | confirmação de chegada/embarque |
| M09 | Corrida em andamento | Guiar até destino | mapa e progresso, ações de segurança |
| M10 | Finalizar corrida | Concluir serviço | resumo, repasse, confirmação |
| M11 | Ganhos | Acompanhar resultados | totais por período, corridas e eventuais descontos/comissões |
| M12 | Histórico | Consultar viagens | lista, valores, detalhes, suporte |
| M13 | Perfil/documentos | Manutenção cadastral | veículo, documentos, dados pessoais, estado de validação |
| M14 | Suporte/segurança | Resolver incidentes | ajuda, contato, comunicação de ocorrência |

## Regras de interação
- Não permitir online antes de cadastro e documentação aprovados.
- Oferta deve expirar no servidor; contador visual não é fonte de verdade.
- Aceite precisa ser atômico, evitando atribuição duplicada.
- Atualizar status com confirmação do backend; não assumir sucesso otimista em ações críticas.
- Exibir ganhos como valores reais retornados pela API; não codificar R$ 236,70 ou outras cifras dos mockups.
- Alterações de veículo/documentos podem exigir nova verificação.
- Em geolocalização de segundo plano, pedir consentimento específico e seguir restrições iOS/Android.

## Critérios funcionais mínimos
1. Motorista aprova/recusa ofertas dentro do prazo permitido.
2. Estados de chegada, embarque, início e fim são validados no servidor.
3. Valores e repasses seguem um modelo de cálculo auditável.
4. Históricos e métricas nunca usam dados de outros motoristas.
5. Offline/reconexão não deve gerar corrida duplicada.
