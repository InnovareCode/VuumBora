# Área de serviço de Natal — teste de busca de endereço (F10)

Fatia F10 do plano mestre (`docs/plano-mestre.md`, linha F10): testar a busca
de endereço do Mapbox contra 100 endereços reais de Natal, para decidir se dá
para abrir o M4 sem esperar a tarifa. Feito por Vega, 22/11/2026.

**Resultado resumido:** nenhum endpoint isolado passou dos 90% pedidos.
Rodando os dois juntos, cada um na parte que faz melhor, dá **86/100 (86%)**.
Como não bateu a meta, a seção 5 escreve o plano alternativo (pino no mapa +
confirmação do usuário + uma tabela própria para os ~15 lugares mais
procurados). PostGIS: **não está na imagem do banco hoje** (seção 6).

## 1. O que foi testado e por quê

Nenhum dos dois apps tem busca de endereço implementada ainda — confirmado:
existe só a tela de prova do mapa (`apps/*/app/(dev)/mapbox-check.*`,
`docs/mapbox.md`), sem nenhuma chamada de geocodificação. Não havia endpoint
existente para reaproveitar, então este teste decide e documenta o contrato.

O Mapbox tem dois produtos diferentes para "achar uma coordenada a partir de
texto", e a amostra mostrou que eles servem a casos diferentes:

- **Geocoding API v6** (`/search/geocode/v6/forward`) — pensada para
  **endereço postal** (rua + número). É a sucessora recomendada da v5
  (legada).
- **Search Box API** (`/search/searchbox/v1/forward`) — pensada para
  **nome de lugar** (POI): shopping, hospital, universidade, monumento,
  aeroporto, rodoviária. Tem categoria, telefone, site — dado de
  estabelecimento, não de endereço.

O script testa os dois, com flag `--engine`:

```
node apps/api/scripts/geocoding-sample-natal.mjs                       # Geocoding v6, amostra completa (100)
node apps/api/scripts/geocoding-sample-natal.mjs --engine=searchbox --categories=shopping,hospital,aeroporto,rodoviaria,ponto,condominio
```

Parâmetros usados nas duas chamadas (o contrato proposto para o M4):

| Parâmetro | Valor | Por quê |
|---|---|---|
| `language` | `pt` | idioma do app |
| `country` | `BR` | restringe ao Brasil |
| `proximity` | `-35.2094,-5.7945` (centro de Natal) | desempata nome de rua repetido em outra cidade a favor de Natal |
| `bbox` | `-35.55,-6.15,-35.05,-5.55` | "Grande Natal", não só o município — decisão do dono em `docs/decisoes-do-dono.md` item 16 ("Natal e região metropolitana"); sem isso o aeroporto (São Gonçalo do Amarante) e bairros de borda (Nova Parnamirim) ficam fora |
| `limit` | `1` | só o melhor resultado — é o que o teste avalia |

Token lido de `EXPO_PUBLIC_MAPBOX_TOKEN`, no `.env` da raiz (mesma variável
dos apps). Nunca impresso nem gravado em arquivo.

## 2. A amostra (100 endereços)

Em `apps/api/scripts/geocoding-sample-natal.mjs`, array `SAMPLE`. Ruas,
bairros, praias e nomes de equipamento público são reais (conferidos de
memória geográfica de Natal — não contra uma fonte cartográfica formal);
números de porta em ruas residenciais **não foram conferidos imóvel a
imóvel** — o teste mede se o serviço acha a rua/o lugar, não se aquele número
específico existe de verdade.

| Categoria | Qtde | Exemplo |
|---|---|---|
| `bairro` (rua + número) | 24 | Av. Hermes da Fonseca, 721, Tirol |
| `praia` | 8 | Rua Erivan França, 1199, Ponta Negra |
| `condominio` | 8 | Alphaville Natal, Nova Parnamirim |
| `shopping` | 6 | Midway Mall, Av. Rio Branco, 536, Petrópolis |
| `hospital` | 8 | Hospital Giselda Trigueiro, Rua Cônego Monte, Quintas |
| `aeroporto` | 2 | Aeroporto Internacional Governador Aluízio Alves |
| `rodoviaria` | 2 | Terminal Rodoviário Nelson Mandela |
| `ponto` (praça, universidade, monumento, parque, órgão público) | 12 | Teatro Alberto Maranhão, Cidade Alta |
| `erro_abreviacao` (mesmos lugares, escritos como alguém digitaria de verdade: sem acento, abreviado, minúsculo, sem número, nome popular) | 30 | `midway mall natal`, `Pç André Albuquerque Cid Alta Natal` |

## 3. Critério de acerto — o que ele prova e o que NÃO prova

Duas camadas, para separar "achou o lugar certo" de "achou o número exato da
casa":

- **(A) localizado corretamente** — o bastante para um pino arrastável no
  mapa (a saída de fallback já prevista no aceite da F10): a resposta tem
  1+ feature, está na região metropolitana de Natal (confere `region_code`
  e o município contra uma lista dos municípios da Grande Natal — evita
  contar como acerto uma rua de mesmo nome em outro estado), **e** passa um
  cheque de que a rua ou o nome próprio pedido aparece de fato no resultado
  (explicado na seção 4 — sem ele, uma troca silenciosa de rua passaria como
  acerto).
- **(B) número exato**, dentro de (A): `match_code.confidence` da v6 é
  `exact`/`high` (número da casa resolvido contra dado real, não
  interpolado).

**O que isso NÃO prova:**
- Não prova que a coordenada devolvida é o ponto exato daquele imóvel — não
  havia fonte de coordenada "esperada" para conferir (por isso não inventei
  uma; o critério (B) é a aproximação disponível: confiança declarada pelo
  próprio Mapbox).
- Não testa volume/cota real de produção (rodou sequencial, com 300ms entre
  chamadas, só para não tomar 429 em rajada — não é limite de conta).
- Não testa o fluxo de autocomplete "enquanto digita" da Search Box
  (`suggest` + `retrieve`, com sessão) — só o `/forward` de uma chamada só,
  que é o suficiente para decidir entre os dois produtos.
- Não passa pelo código do app (nenhum app tem essa tela ainda) — é a API
  pura, com os parâmetros que o app vai usar.
- A amostra foi montada de memória geográfica, não contra um gabarito
  oficial — alguns "erros" abaixo podem ser bairro mal-chutado por mim, não
  falha do Mapbox (tratados com cautela na seção 4).

## 4. Resultado por engine e categoria

### Geocoding API v6 (amostra completa, 100)

| Categoria | Localizado (A) | Número exato (B) |
|---|---|---|
| bairro | 19/24 (79%) | 1/24 |
| praia | 8/8 (100%) | 0/8 |
| condominio | 7/8 (88%) | 0/8 |
| shopping | 3/6 (50%) | 1/6 |
| hospital | 8/8 (100%) | 1/8 |
| aeroporto | 1/2 (50%) | 0/2 |
| rodoviaria | 1/2 (50%) | 0/2 |
| ponto | 5/12 (42%) | 0/12 |
| erro_abreviacao | 23/30 (77%) | 0/30 |
| **Geral** | **75/100 (75%)** | **3/100 (3%)** |

### Search Box API (só as categorias de nome de lugar, 38 itens)

| Categoria | Localizado (A) |
|---|---|
| condominio | 6/8 (75%) |
| shopping | 5/6 (83%) |
| hospital | 8/8 (100%) |
| aeroporto | 2/2 (100%) |
| rodoviaria | 2/2 (100%) |
| ponto | 12/12 (100%) |
| **Subtotal** | **35/38 (92%)** |

### Achado central: troca silenciosa de rua com confiança "alta"

Dois casos concretos (rodada de depuração, não ficaram no resultado final
acima porque passaram a contar como erro depois do ajuste): pedi `Rua
Catavento, 190, Candelária` e `Rua Chapeuzinho Vermelho, 120, Cidade Nova` —
ruas que, pelo visto, não existem no dado do Mapbox para Natal. Em vez de
"não encontrado", a v6 devolveu **com confiança "alta"** uma rua
**diferente**, usando o nome do bairro que eu tinha informado como se fosse
o nome da rua (`Rua Candelaria, Guarapés` e `Rua Cidade Nova, Guarapés` —
bairro errado nos dois). `match_code.confidence: "high"` não detecta isso —
ele mede se a resposta é consistente **com ela mesma**, não se corresponde
ao que foi pedido.

**Por isso a primeira versão deste script tinha um bug**: usava só
`match_code.confidence` e contava os dois casos acima como acerto. Corrigido
comparando o nome da rua/do lugar pedido contra o texto do resultado antes de
aceitar (`streetNameSanityCheck` no script) — ver o comentário no código para
o motivo. Registrado aqui para não repetir: **confiança alta não é prova de
que o endereço certo foi encontrado**, só de que a resposta é
internamente coerente.

**Consequência para o produto, não só para o teste:** o app nunca deve fixar
uma corrida só pela coordenada devolvida. Sempre mostrar o endereço/nome que
o Mapbox devolveu para o usuário confirmar, com o pino arrastável por cima —
é a mesma orientação do aceite da F10 ("pino no mapa" como plano B), mas vale
como regra permanente, não só para quando a busca falha.

## 5. Plano alternativo (como pedido, por não ter batido 90%)

Rodar os dois juntos — Geocoding v6 para texto com cara de endereço (rua
digitada, ou autocomplete do tipo endereço), Search Box para o resto (nome de
shopping, hospital, universidade, monumento, condomínio) — e usar o que cada
um resolve melhor:

| Categoria | Melhor engine | Resultado |
|---|---|---|
| bairro | Geocoding | 19/24 |
| praia | Geocoding | 8/8 |
| condominio | Geocoding | 7/8 |
| shopping | Search Box | 5/6 |
| hospital | ambos empatam | 8/8 |
| aeroporto | Search Box | 2/2 |
| rodoviaria | Search Box | 2/2 |
| ponto | Search Box | 12/12 |
| erro_abreviacao | só testei Geocoding | 23/30 |
| **Total combinado** | | **86/100 (86%)** |

Ainda abaixo de 90%. Três coisas para fechar a diferença, nenhuma delas é
"esperar a tarifa" (não bloqueiam o M4):

1. **Tabela própria para os lugares mais procurados.** Os poucos shoppings,
   hospitais grandes, aeroporto, rodoviária e pontos turísticos de Natal são
   uma lista curta e estável (algo como 15-25 entradas) — cadastrar
   coordenada própria para eles custa uma tarde e garante 100% nesses, que
   são justamente os destinos mais usados em corrida de app. Fica pendente
   para quem herdar o M4 (Nova decide se entra no banco de corrida ou num
   arquivo estático).
2. **Pino arrastável + confirmação sempre visível** (seção 4) — cobre os
   outros casos sem travar o cadastro de origem/destino.
3. **Roteamento por tipo de busca**: se o campo é "endereço", usa Geocoding;
   se é "procurar um lugar", usa Search Box. Decisão de UX da Lyra/Nova, não
   deste teste — aqui só fica provado que a escolha certa de engine por tipo
   de busca é o que faz a diferença entre 75% isolado e 86% combinado.

## 6. PostGIS — confirmado que NÃO está na imagem hoje

Verificado, não assumido:

- **Não existe `docker-compose.yml` neste repositório** (`find` vazio na raiz
  e em todo o projeto).
- O único lugar que define a imagem do Postgres é `.github/workflows/ci.yml`:
  `image: postgres:18` (dois jobs, linhas 74 e 158) — a imagem **oficial**,
  não a variante `postgis/postgis`.
- Conferido contra a fonte da imagem oficial
  (`docker-library/postgres`, Dockerfile da tag `18`/`bookworm`, lido direto
  do GitHub): nenhuma instalação de `postgis` nele.
- Nenhuma migração do projeto roda `CREATE EXTENSION postgis` — só
  `pgcrypto` (migrações 0001 a 0010).
- Não há evidência de que a produção (Easypanel) use uma imagem diferente da
  do CI; `docs/deploy-easypanel.md` e `docs/producao-passo-a-passo-dono.md`
  não especificam imagem própria de banco.

**Conclusão: PostGIS não está instalado hoje, nem em CI nem (pelo que dá para
confirmar pelo repositório) em produção.** Não havia Docker disponível neste
ambiente para rodar o contêiner e consultar
`SELECT * FROM pg_available_extensions WHERE name='postgis'` diretamente —
a prova acima (ausência de `docker-compose`, imagem oficial sem PostGIS pela
fonte do próprio mantenedor, nenhuma migração que o crie) é a evidência
documental disponível. Se mais adiante alguém tiver acesso a Docker ou ao
servidor de produção, rodar essa consulta é a confirmação direta.

**Isso não bloqueia a F10 nem o M4**: nada no teste de geocodificação usa
PostGIS (é tudo API do Mapbox, texto → coordenada). PostGIS só entraria se o
produto precisar fazer cálculo geográfico **dentro do banco** (ex.: "motorista
dentro de X km", polígono de área de cobertura) — que é decisão futura do M5
(despacho), não desta fatia. Registrar para quem chegar lá: se precisar,
trocar a imagem para `postgis/postgis:18-3.4` (ou a versão de PostGIS
compatível) e rodar `CREATE EXTENSION postgis` numa migração nova — mudança
de infraestrutura (Vulcano) + migração (Cronos), não deste teste.

## 7. O script

`apps/api/scripts/geocoding-sample-natal.mjs` — reexecutável, com `--engine`
(`geocode` padrão, `searchbox`), `--categories` (filtra a amostra) e `--out`
(salva o JSON completo, usado para montar as tabelas acima). Erros de
rede/429 têm retry com backoff; nunca imprime o token nem a URL com ele.

## Decisão do Atlas (22/11/2026)

O aceite da F10 no plano mestre é "90% ou mais, **ou** plano alternativo escrito". A meta não foi batida (86%), e o plano alternativo da seção 5 está escrito, então **a F10 está aceita** e o M4 pode abrir.

O plano alternativo vira **escopo do M4**, não um opcional:
- tabela própria com os lugares mais procurados;
- pino arrastável com confirmação do endereço sempre, não só quando a busca falha;
- os dois endpoints, cada um no seu tipo de busca.

Regra de produto que vale desde já, por causa do achado da seção 4: **nenhuma corrida é fixada só pela coordenada devolvida.** O usuário sempre vê e confirma o endereço ou o nome que o Mapbox devolveu.

PostGIS fica como pendência do M5, só se o despacho precisar de cálculo geográfico dentro do banco.
