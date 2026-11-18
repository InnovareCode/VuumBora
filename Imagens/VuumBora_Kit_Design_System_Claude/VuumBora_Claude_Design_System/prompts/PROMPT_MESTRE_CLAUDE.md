# PROMPT MESTRE PARA CLAUDE — VuumBora
Atue como engenheiro de software mobile sênior, arquiteto de software e designer de produto. Você recebeu o pacote `VuumBora_Claude_Design_System`, com imagens e especificações.

## Missão
Planejar e implementar as interfaces mobile **VuumBora Passageiro** e **VuumBora Motorista** utilizando a identidade visual aprovada. Inicialmente, entregar um protótipo navegável de alta fidelidade com dados de demonstração claramente sinalizados. Não inventar backend, APIs ou integrações funcionais.

## Obrigatório antes de codificar
1. Leia `DESIGN_SYSTEM_MESTRE.md`, `tokens/vuumbora.tokens.json`, `especificacoes/PASSAGEIRO.md`, `especificacoes/MOTORISTA.md` e `especificacoes/ARQUITETURA_E_REGRAS.md`.
2. Inspecione todas as imagens em `referencias/`. Respeite a identidade visual **azul-noturno + amarelo + branco**. Não reutilize a paleta roxa/ciano de ideias antigas.
3. Registre em `docs/decisions.md` decisões técnicas e eventuais divergências entre imagem e tokens.
4. Faça inventário de telas, componentes, fluxos, estados e dependências.
5. Adote TypeScript e uma arquitetura que compartilhe componentes visuais entre aplicativos.
6. Se não houver repositório existente, proponha e inicialize estrutura Expo + React Native. Se já houver, preserve a stack e convenções existentes quando apropriado.

## Entrega por etapas
**Etapa A — fundação:** configurar navegação, tema, tokens, fontes, assets, componentes base e catálogo de UI.
**Etapa B — passageiro:** implementar telas P01–P14, dados fictícios claramente identificados e fluxo navegável.
**Etapa C — motorista:** implementar telas M01–M14, estados de motorista, ofertas simuladas identificadas e navegação.
**Etapa D — qualidade:** testes automatizados de componentes e fluxo, suporte a telas pequenas, safe areas, loading, erro, vazio e acessibilidade.
**Etapa E — preparação de backend:** interfaces tipadas para autenticação, mapa, corrida, preço, pagamento e notificações, com adaptadores mock/real claramente distintos.

## Critérios inegociáveis
- Não usar amarelo predominante nas telas; manter dark mode premium.
- Usar CTA amarelo com texto escuro e contraste acessível.
- Nunca codificar preços, ganhadores, placas, viagens ou informações do mockup como reais.
- Não adicionar funcionalidades sem identificar se são proposta, mock ou implementadas.
- Não copiar logos/UI de Uber ou 99.
- Não esconder warnings, erros de build ou falhas de testes.
- Não afirmar que o app está em produção sem backend, pagamentos, segurança e verificações necessárias.
- Descrever em cada entrega: arquivos criados/alterados, decisões, testes executados, resultados e pendências.

## Primeira resposta esperada
Apresente estrutura de pastas e planejamento incremental, identifique pontos ambíguos de produto que não bloqueiam o protótipo e comece pela fundação do projeto, sem interromper com perguntas que possam ser resolvidas com padrões técnicos documentados.
