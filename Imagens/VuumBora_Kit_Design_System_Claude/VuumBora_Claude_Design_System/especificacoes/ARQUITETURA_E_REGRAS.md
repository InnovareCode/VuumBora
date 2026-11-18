# Guia de arquitetura e implementação para Claude
## Stack sugerida (ajustável)
- Mobile: React Native + Expo + TypeScript; Expo Router ou React Navigation, adotar apenas uma navegação.
- UI: biblioteca de componentes interna (`packages/ui`) + `tokens/vuumbora.tokens.json`.
- Estados remotos: TanStack Query. Estado local: Zustand ou Context quando necessário.
- Formulários: React Hook Form + Zod.
- Mapa: SDK compatível com iOS/Android, sujeito a licenças, custo e disponibilidade; avaliar Google Maps/Mapbox.
- Backend: serviço seguro com autenticação, APIs, banco, realtime e regras de negócio. Stack final depende da equipe/projeto.
- Testes: Jest + React Native Testing Library + E2E em dispositivos/emuladores.
- Telemetria: eventos com anonimização, consentimentos e retenção definidos.

## Monorepo sugerido
```
apps/
  passenger/
  driver/
packages/
  ui/
  tokens/
  api-client/
  domain/
  config/
docs/
  flows/
  decisions/
```
- Apps independentes ou builds por perfil; compartilhar domínio e sistema visual, **não** misturar regras de passageiro e motorista.
- Isolar SDKs de mapas/pagamento/notificações com adaptadores para evitar acoplamento.
- Interfaces de API tipadas; mock adapter para testes; nenhuma chamada ao backend deve ser implicitamente falsa.

## Contratos de domínio propostos (não definitivos)
`User`, `Driver`, `Vehicle`, `DriverVerification`, `Location`, `Place`, `FareQuote`, `RideRequest`, `Trip`, `TripEvent`, `PaymentMethod`, `Payment`, `Payout`, `Rating`, `SupportTicket`, `Notification`.
- Identificadores UUID ou equivalente, timezone sempre explícito.
- Valores monetários em centavos inteiros e BRL; nunca float como fonte de verdade.
- Mudanças de status controladas pelo backend com idempotência e auditoria.
- Geolocalização atualizada sob permissões claras e com limites de precisão e retenção.
- Separação entre “estimativa”, “tarifa final”, “taxa da plataforma” e “repasse ao motorista”.

## Privacidade, segurança e legal
- LGPD: base legal, finalidade, minimização, direitos do titular, descarte e incidentes.
- Segurança: autenticação, autorização por papel, rate limiting, auditoria, criptografia em trânsito, segredos fora do app.
- Motoristas: validação de documentos, exigências municipais/federais aplicáveis, critérios operacionais.
- Pagamentos: escolher provedor habilitado; não armazenar dados sensíveis de cartão diretamente.
- Comunicação: chamadas e chat podem exigir canal intermediário para preservar contatos pessoais.
- Rotas: gestão de custos e termos de SDK de mapas.
- Não considerar regras regulatórias “resolvidas” por este documento; revisar antes de produção.

## Roadmap sugerido
**Fase 1, protótipo navegável:** telas, componentes, navegação, estados e dados simulados identificados.
**Fase 2, MVP transacional:** autenticação, perfis, documentação, geolocalização, orçamento, solicitação/distribuição, estados de corrida, pagamentos reais.
**Fase 3, operação:** suporte, disputa/cancelamento, antifraude, monitoramento, administração, conciliação financeira e escalabilidade.

## Checklist de pronta entrega
- [ ] Histórias de usuário aceitas para cada tela
- [ ] Tokens centralizados sem HEX disperso
- [ ] Componentes compartilhados com testes
- [ ] Screenshot em várias resoluções
- [ ] Fluxos de erro e ausência de dados tratados
- [ ] APIs com autenticação e autorização por perfil
- [ ] Logs sem PII sensível
- [ ] Gestão de mapas e permissões
- [ ] Validação de requisitos legais e pagamento
- [ ] Build e testes iOS/Android reproduzíveis
