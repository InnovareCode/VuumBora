# VuumBora — Design System Mestre
**Versão:** 1.0 (especificação inicial para desenvolvimento)  
**Idioma:** português do Brasil (pt-BR)  
**Aplicativos:** Passageiro e Motorista  
**Estado:** identidade visual aprovada, fluxos e integrações a validar

## 1. Objetivo
Transformar os mockups aprovados da marca VuumBora em interfaces reproduzíveis, consistentes, acessíveis e implementáveis no Claude. A marca destina-se a mobilidade urbana: solicitação de viagens e gerenciamento de corridas.

## 2. Fonte de verdade e hierarquia
1. A logomarca amarela e azul-escura em `referencias/logo_aprovada.png` é a referência visual aprovada **mais recente**.
2. `referencias/passageiro_telas.png` e `referencias/motorista_telas.png` são os mapas visuais de telas; as imagens `*_home.png` dão detalhes de interface.
3. `tokens/vuumbora.tokens.json` especifica os valores técnicos recomendados e revisáveis.
4. Os documentos de fluxos são propostas de produto, NÃO evidência de implementação já existente.

**Não utilizar** a paleta alternativa ciano/roxo de versões anteriores. Não substituir a marca por outra, nem redesenhar o logo sem solicitação. O fundo amarelo deve ser destaque, não o plano de fundo de todas as telas.

## 3. Linguagem visual
- Marca: premium, urbana, direta, confiável, ágil.
- Base: dark mode (`#070D18`), superfícies discretamente mais claras e CTA amarelo (`#FFCC00`).
- Tipografia: Inter ou fonte métrica semelhante com suporte a pt-BR; preferir pesos 400/500/600/700.
- Ícones: traço consistente (Lucide ou equivalente), 20–24 px.
- Layout: grid de 4 px, margem lateral de 20 px, cartões com raio 16 px, botões com 52 px de altura.
- Motion: 150–250 ms para transições locais; respeitar preferência do sistema por movimento reduzido.
- Mapas: manter contraste; rota em amarelo; posição do usuário em azul; embarque em verde; destino em vermelho. Conferir acessibilidade dos marcadores sem depender apenas de cor.
- Evitar excesso de sombras, neon, gradientes e efeitos que prejudiquem a legibilidade.

## 4. Tokens principais
| Uso | Token | HEX |
|---|---|---|
| Fundo | background.base | `#070D18` |
| Superfície | background.surface | `#111B2A` |
| Cards em destaque | background.elevated | `#192536` |
| Ação principal | brand.yellow | `#FFCC00` |
| Ação pressionada | brand.yellowPressed | `#E6B800` |
| Apoio | brand.orange | `#F5A400` |
| Texto primário | text.primary | `#FFFFFF` |
| Texto secundário | text.secondary | `#B9C4D2` |
| Borda | border.default | `#2D3A4C` |
| Sucesso | semantic.success | `#22C55E` |
| Erro | semantic.danger | `#F04452` |

A cor aproximada de uma imagem PNG não equivale a manual oficial vetorial. Estes tokens são a proposta técnica derivada da referência aprovada, e podem ser ajustados por avaliação visual e contraste.

## 5. Acessibilidade e consistência
- Alvo de toque mínimo recomendado: 44 × 44 px; botões principais 52 px.
- Testar WCAG AA para contraste de texto. Em amarelo, usar texto `#0B1220`, jamais texto branco pequeno.
- Todos os botões com estados: padrão, pressionado, desabilitado, carregando e erro quando aplicável.
- Informações críticas em texto + ícone, não somente cores.
- Suporte à escala de fonte do sistema, telas pequenas, notch e safe areas.
- Localização: `pt-BR`; reais com `Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'})`.
- Privacidade: telefone, documentos, endereços, GPS, pagamentos e histórico são dados sensíveis do produto; não expor em logs ou amostras de produção.

## 6. Componentes fundamentais
### Sistema transversal
`AppShell`, `ScreenHeader`, `BrandLogo`, `PrimaryButton`, `SecondaryButton`, `DangerButton`, `TextInput`, `PasswordInput`, `PhoneInput`, `SearchInput`, `InfoCard`, `MetricCard`, `StatusBadge`, `Toast`, `Modal`, `BottomSheet`, `BottomTabBar`, `Avatar`, `StarRating`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `MapView`, `RouteOverlay`, `LocationMarker`.

### Passageiro
`DestinationSearch`, `SavedPlaceCard`, `RideCategoryCard`, `FareEstimate`, `PaymentMethodSelector`, `DriverInfoCard`, `RideProgress`, `TripReceipt`, `SafetyActions`, `TripRating`.

### Motorista
`OnlineToggle`, `RideOfferCard`, `RideOfferCountdown`, `EarningsSummary`, `NavigationPanel`, `DriverTripStatus`, `DriverDocumentCard`, `PayoutCard`, `PerformanceSummary`.

**Contrato mínimo de componente:** tipagem de props, suporte a loading/disabled/error, acessibilidade de rótulos e testes de interação. Extraia componentes reutilizáveis sem forçar as duas experiências a serem idênticas.

## 7. Navegação
- Passageiro: onboarding/autenticação → home/mapa → origem/destino → categoria/preço → confirmar → busca motorista → acompanhamento → corrida → pagamento/comprovante → avaliação.
- Motorista: onboarding/autenticação → cadastro de veículo/documentos → revisão/aprovação → dashboard offline/online → oferta de corrida → aceite → deslocamento ao embarque → passageiro embarcou → viagem → conclusão → ganhos.
- Fluxos secundários: histórico, carteira, métodos de pagamento, perfil, configurações, suporte, segurança, privacidade, notificações.
- Proteger telas autenticadas; impedir navegação incoerente em corrida ativa.

## 8. Estados que precisam existir
- Login: inicial, validação, carregando, credenciais inválidas, recuperação.
- Geolocalização: pedindo permissão, concedida, negada, indisponível.
- Corrida passageiro: rascunho → orçamento → solicitada → buscando motorista → motorista atribuído → motorista a caminho → no embarque → em andamento → finalizada; cancelada e falha.
- Corrida motorista: offline → online → oferta → aceita → chegando ao embarque → aguardando embarque → em andamento → finalizada. Suportar expiração/rejeição.
- Pagamento: pendente, autorizado/confirmado, recusado, estornado (de acordo com provedor).
- Rede: online, reconectando, offline com ação apropriada, falha de API.
- Casos especiais: indisponibilidade de motoristas, alteração de destino, cancelamento, divergência de tarifa e problemas de localização.

## 9. Conteúdo e dados simulados
Mockups usam nomes, valores, veículos, descontos, localizações e indicadores apenas ilustrativos. **Não reproduzir esses dados como regras de negócio.** Não prometer suporte 24h, motorista verificado, cupom de 10%, saque imediato, tarifas ou agendamento como recursos já entregues. Esses itens são candidatos a implementação sujeitos a escopo e validação.

## 10. Critérios de aceite de UI
- A marca aprovada aparece corretamente nos pontos designados.
- Nenhum botão tem funcionalidade simulada sem sinalização explícita.
- Qualquer fluxo demonstrável possui estados de loading, erro, vazio e sucesso.
- Acessibilidade é testada em todos os componentes interativos.
- Componentes de ambos os apps compartilham tokens e não duplicam estilos.
- Textos, números e datas localizados em pt-BR.
- Layouts testados em iOS e Android, em dimensões menores e maiores.
- Diferenciar implementado, mockado e pendente.

## 11. Não confundir design com plataforma operacional
A imagem, isoladamente, não define regras de corridas, cálculo de tarifa, algoritmo de distribuição, segurança, proteção de dados, pagamentos, identidade, mapas ou regulatórios. Exigir especificações e integração reais antes do lançamento.
