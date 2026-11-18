# VuumBora — Kit de Design System para Claude
Pacote criado a partir da **logomarca amarela e azul-noturno aprovada** e dos mockups de passageiro/motorista deste projeto.

## Comece por aqui
1. Coloque esta pasta no repositório do aplicativo.
2. Abra o projeto no Claude (Claude Code ou ambiente que aceite arquivos).
3. Anexe/forneça acesso à pasta de referências de imagens.
4. Cole o conteúdo de `prompts/PROMPT_MESTRE_CLAUDE.md` na conversa com o Claude.
5. Peça que implemente primeiro os tokens, o catálogo de componentes e a navegação.
6. Revise as telas antes de conectar APIs e operações reais.

## Estrutura
- `DESIGN_SYSTEM_MESTRE.md`: regras visuais, componentes, estados e critérios de aceite.
- `tokens/vuumbora.tokens.json`: valores de design estruturados.
- `codigo/theme.ts`: base pronta para projeto React Native/TypeScript.
- `codigo/theme.css`: base para painel/site web.
- `especificacoes/PASSAGEIRO.md`: mapa de telas de passageiro.
- `especificacoes/MOTORISTA.md`: mapa de telas de motorista.
- `especificacoes/ARQUITETURA_E_REGRAS.md`: recomendação de arquitetura e riscos.
- `prompts/PROMPT_MESTRE_CLAUDE.md`: instrução para implementação.
- `referencias/*.png`: material visual aprovado e mockups.

## Atenção
**Aprovado:** nome VuumBora; logomarca na paleta amarelo/branco/azul-escuro; conceito de interface dark.
**A validar:** exatos HEX, fonte/licenças, categorias e preços, métodos de pagamento, agendamento, promoções, regras do motorista, integrações, mapas, tarifas, segurança, documentos, regras de operação e requisitos legais.
As imagens são referências visuais, não comprovação de funcionalidades implantadas.

## Ordem recomendada de execução
Fundação do design system → protótipo passageiro → protótipo motorista → testes/a11y → especificação de backend → implementação transacional.
