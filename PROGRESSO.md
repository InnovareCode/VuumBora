# PROGRESSO — VuumBora

Estado do projeto entre sessões. Atualizar ao fim de cada marco.

## Admin v0 — ENTREGUE E APROVADO (20/11/2026)

Primeira fatia do painel da plataforma (fase **S2** do plano). Commits
`f4aece3` e `1f74b3a`, publicados. **Veredito da Íris: APROVADO**, provado
com API real e papéis reais — não com dado de demonstração.

**O que existe agora:** `apps/admin` (React + Vite + Tailwind v4) com login,
lista e detalhe das candidaturas de motorista vindas do site, busca, filtro e
paginação; e no `apps/api` o login de administrador por cookie httpOnly,
cinco papéis com autorização por rota, teto absoluto de sessão e auditoria de
toda leitura. Migrações `0003`–`0007`.

**Decisões do dono que entraram:** papéis por setor (`dono`, `operacao`,
`revisor_documentos`, `financeiro`, `suporte` — matriz em
`docs/decisoes-do-dono.md`); painel no mesmo servidor, em
**`admin.vuumbora.com.br`**; casca no padrão do painel do ModaShop com a
paleta e a tipografia do VuumBora.

**Só leitura.** Aprovar e recusar candidatura é a fatia seguinte, com motivo
obrigatório, auditoria e token de CSRF.

### Três bugs reais encontrados e corrigidos (causa, não sintoma)
- **Dado pessoal vazando no log:** o pino gravava a query string inteira, e a
  busca é por nome/e-mail/telefone de candidato. Corrigido no nível do
  serviço — nenhuma query futura é segura por padrão. A Íris provou por
  mutação: removeu a correção, viu vazar de novo, recolocou.
- **Paginação perdia linha** quando duas candidaturas tinham `created_at`
  idêntico ao microssegundo (`Date` do JS trunca para milissegundo).
- **Foco escapava das sobreposições:** a gaveta do celular era desenhada
  antes de `header`+`main`, e **quem decide a ordem do Tab é a ordem do
  documento**, não a posição visual. A paleta de comandos tinha o mesmo
  defeito pelo Shift+Tab — só apareceu porque se testou os dois sentidos.

### Pendente antes de abrir documentos e financeiro
- **Infra (Vulcano):** separar a credencial de banco e revogar alteração e
  exclusão em `admin_audit_log` — hoje a trilha é inviolável pelo código, não
  pelo banco; HTTPS no painel do Easypanel; backup externo testado; criar o
  admin de produção; `admin.vuumbora.com.br` em `ALLOWED_ORIGINS`.
- **Segundo fator** de autenticação e **token de CSRF** (este último junto da
  primeira ação que aprova ou recusa alguém).
- Saneamento de `err.message` no log de requisição rejeitada.

## Plano do sistema real — escrito em 20/11/2026

O site de pré-lançamento está no ar e a Fase 1 dele está fechada. O passo
seguinte — **o sistema de verdade** (os dois apps, o painel admin, o backend
transacional e a infra) — foi planejado de ponta a ponta e vive em:

> **[`docs/plano-sistema.md`](docs/plano-sistema.md)** — plano consolidado,
> **fonte de verdade**: escopo MVP × pós-MVP, arquitetura e stack justificada,
> modelo de dados, contratos de API, fases S0 a S9 com critério de aceite,
> matriz de funcionalidades por perfil, riscos, custo e decisões em aberto.

Anexos com o detalhe: [`docs/plano-sistema-arquitetura.md`](docs/plano-sistema-arquitetura.md)
(Nova) e [`docs/plano-sistema-dados.md`](docs/plano-sistema-dados.md) (Cronos).

**O `PLANO.md` continua valendo** para o protótipo navegável (fases 1 a 3) e
roda em paralelo até a fase S4, quando os apps trocam o adaptador `mock` pelo
`http`. Onde os dois falarem do mesmo assunto, vale o `plano-sistema.md`.

**Começo recomendado: S0** (congelar contratos). Nada foi implementado.

**Novidades de produto de 20/11/2026, já incorporadas ao plano:** as cinco
categorias de lançamento (VuumBora, Conforto, Motorista mulher, Entrega, Pet;
moto fora, sem data) e a funcionalidade **motorista favorito** — o passageiro
escolhe um favorito, que recebe oferta exclusiva de 15 s antes de a corrida ir
para a fila normal.

**Pendente no site, pedido pelo dono e ainda não feito:** acrescentar o cartão
de *motorista favorito* na seção de categorias e criar os ícones dos cartões.

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

**Lista atualizada e priorizada: [`docs/plano-sistema.md`](docs/plano-sistema.md) §14**
— separa as que travam uma fase inteira (orçamento, prazo, gateway, cidade,
agendamento, tarifa) das que só decidem desenho. O que está abaixo é o registro
anterior, mantido por histórico.

Lista completa em `docs/decisions.md` → "Ambiguidades de produto". As que mais pesam para o MVP:
- Login por código (celular) ou senha.
- Uma conta com dois papéis ou contas separadas.
- Métodos de pagamento e existência de carteira.
- Taxa da plataforma/repasse e regras de cancelamento.
- SDK de mapa (D-11) e cidade de lançamento.
- Identificadores de loja (provisório `com.vuumbora.passenger` / `com.vuumbora.driver`).
