# PROGRESSO — VuumBora

Estado do projeto entre sessões. Atualizar ao fim de cada marco.

## Estado atual (2026-11-18)

**Fase 0 — Fundação: scaffold criado, sem dependências instaladas.**

- Monorepo npm workspaces: `apps/passenger`, `apps/driver`, `packages/{tokens,ui,domain,api-client}`.
- Expo Router nos dois apps (entry `expo-router/entry`, `app/_layout.tsx` + marcador `app/index.tsx`).
- `@vuumbora/tokens` deriva o tema de `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` (fonte única).
- Guarda de arquitetura: `npm run check:boundaries` (HEX solto, import cruzado passageiro/motorista).
- Decisões e ambiguidades de produto: `docs/decisions.md`.

### O que foi provado e o que não foi
- Provado: `check:boundaries` passa no repo e falha numa violação de propósito; `tokens`, `domain` e `api-client` passam no `tsc --noEmit` estrito (TS 5.9); a conversão de tokens roda e devolve os valores do JSON.
- **Não provado** (falta `npm install`): typecheck de `ui` e dos apps; Metro resolvendo o JSON fora dos pacotes; `app.config.ts` importando o JSON; o app subindo em emulador.

## Plano em fases

| # | Fase | Dono | Depende de | Entrega |
|---|---|---|---|---|
| 0 | Fundação: arquitetura + scaffold | Nova | — | Feito (este marco) |
| 1 | Instalação e CI | Vulcano | 0 | SDK confirmado (D-07), `npm install`, `npx expo install --fix`, `expo config` e `expo start` nos dois apps, CI com `npm run check` |
| 2 | Paleta validada | Apolo | — (paralela) | JSON de tokens revisado; ícone/splash |
| 3 | Componentes transversais + catálogo | Lyra | 1 (2 desejável) | `@vuumbora/ui` (Etapa A), MockBadge, fontes |
| 4 | Adaptadores mock | Vega | 1 | Adaptadores `mock` das portas do `api-client` |
| 5 | Protótipo Passageiro P01–P14 | Lyra | 3, 4 | Etapa B |
| 6 | Protótipo Motorista M01–M14 | Lyra | 3, 4 | Etapa C (pode rodar em paralelo à 5) |
| 7 | Qualidade | Íris | 5, 6 | Etapa D: testes, a11y, telas pequenas |
| 8 | Contrato de backend | Nova + Cronos + Vega | respostas de produto | Etapa E: API HTTP, modelo de dados |

## Site de pré-lançamento — FASE 1 FECHADA (20/11/2026)

O site está **no ar e captando candidatura de verdade** em
`vuumbora.com.br`. O caminho inteiro foi provado de ponta a ponta:
formulário → API → Postgres, com uma candidatura de teste enviada pelo
navegador no endereço público.

**Um site só.** O Next.js que vivia em `apps/site` foi removido (117
arquivos) e a página estática tomou o lugar dele. Não existe mais "qual é
o site?": é `apps/site/public`, HTML, CSS e JS puros, sem build.

### Infraestrutura (Easypanel)

- **Banco e migrações são automáticos no boot** (`apps/api/src/migrate.ts`):
  a API cria o banco se faltar, espera o Postgres e aplica as migrações
  pendentes sob advisory lock. Não há mais SQL para colar à mão. Provado com
  quatro instâncias subindo ao mesmo tempo contra um PostgreSQL 18 real.
- **API no ar** em `api.vuumbora.com.br`, com certificado válido e CORS
  liberado só para o site. Armadilha anotada: o domínio precisa estar
  cadastrado como `https://` no painel, senão o Let's Encrypt nunca é
  chamado e o navegador recusa a chamada do site (que é https).
- **Publicação aparece na hora.** A Cloudflare sobrescreve o `max-age` do
  nginx por 4 horas em CSS e JS; `scripts/carimbar-assets.mjs` carimba os
  endereços com o hash do conteúdo no build, então cada publicação muda o
  endereço e a Cloudflare não tem como servir o antigo.
- **Versão visível no rodapé**, vinda do `package.json` da raiz, com a data
  real do build (`scripts/gerar-versao.mjs`). Publicar versão nova é mudar
  um número.

### Conteúdo e layout

Ordem da página, montada na sequência das perguntas do visitante: hero com
o formulário → **QUEM SOMOS** → **ONDE ESTAMOS** → motivos → **categorias
de carro** → carrossel → perguntas → simulador. Duas **faixas de respiro**
com as artes do dono em tela cheia quebram os blocos densos.

Direção em `docs/direcao-apresentar-a-marca.md`; revisão final de copy em
`docs/revisao-copy-fase-1.md`.

Regras de texto que valem daqui em diante:
- **"Candidatura" e "cadastro" nunca se trocam** — a primeira existe hoje, o
  segundo abre depois, com as regras.
- "Taxa menor" e "repasse mais rápido" podem, **sem número**, sempre junto do
  compromisso de publicar as regras antes de o cadastro abrir.
- O suporte por pessoa de Natal vale **só para o WhatsApp**.
- As fotos são ilustrativas: nenhum texto, nem o `alt`, pode chamar o modelo
  de "motorista da VuumBora".

### O que continua sem prova

- A imagem Docker nunca foi construída nesta máquina (não há Docker aqui): o
  build no servidor segue sendo o primeiro teste real dela.
- Nada foi aberto em aparelho Android ou iOS real, nem em leitor de tela,
  nem em Safari ou Firefox.
- Dedup por e-mail e normalização de telefone foram provados contra
  PostgreSQL real **local**, não contra o banco de produção.

### Pendências conhecidas do site

- A linha do tempo do ONDE ESTAMOS é **estática abaixo de 900px** — sem o
  desenho progressivo que o desktop tem. Motorista acessa de celular.
- `carrossel-repasse-rapido.jpg` tem texto da arte original cortado na borda
  esquerda. É imagem, não CSS: precisa recortar de novo a partir de
  `Imagens_Site/`.

## Reforma anterior do formulário (19/11/2026)

Reforma do formulário de candidatura e das seções pós-jornada
(`docs/especificacao-formulario-e-secoes.md`, Apolo → Lyra, 19/11/2026).
Duas decisões do dono, resolvidas, não reabrir:
- **Aviso de privacidade resumido no cartão**: uma linha curta visível
  (`<details><summary>`) com o texto literal completo abrindo num clique.
  É o que mantém o cartão inteiro na tela mesmo em notebook baixo
  (1366x768, 1280x720) com a rede de segurança da seção 1.7 da especificação.
- **Rodapé**: a frase "A marca é real, então não existe aviso de marca
  fictícia..." era anotação de bastidor do pacote de design, não texto do
  site — removida. Ficou só "As imagens são ilustrativas." na barra inferior.

## Decisões em aberto (dependem do dono)

Lista completa em `docs/decisions.md` → "Ambiguidades de produto". As que mais pesam para o MVP:
- Login por código (celular) ou senha.
- Uma conta com dois papéis ou contas separadas.
- Métodos de pagamento e existência de carteira.
- Taxa da plataforma/repasse e regras de cancelamento.
- SDK de mapa (D-11) e cidade de lançamento.
- Identificadores de loja (provisório `com.vuumbora.passenger` / `com.vuumbora.driver`).
