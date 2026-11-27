# Plano executável do M3 (documentos do motorista, S2) e do M4 (geografia e cotação, S3)

Nova, 27/11/2026. Fontes: `docs/plano-mestre.md` §2-§3, `docs/plano-sistema-arquitetura.md` §5.6, §6.3, §6.5 e §10,
`docs/plano-sistema-dados.md` §2 e §4, `docs/area-de-servico-natal.md` §5-§7, `docs/decisoes-do-dono.md` (22/11, noite).
**Contexto assumido:** MVP de uma cidade (Natal), escala de construção (~200 motoristas no beta, ~1.000 corridas/dia no
lançamento), servidor único no Easypanel, squad pequena. Nada aqui exige serviço novo além do armazenamento de objetos.

## 1. Decisões que este plano toma (dentro do que o dono já decidiu)

| # | Decisão | Por quê |
|---|---|---|
| N1 | A lista de documentos é **dado, não código**: `document_requirements` por cidade, com versão. Semente **provisória** (`provisional = true`) com o mínimo federal (Lei 12.587, art. 11-B: CNH com EAR, CRLV, antecedentes, INSS) e foto de perfil. A lista da STTU entra como versão nova, sem deploy | A STTU não respondeu; o tipo `document_type` com `CHECK` fixo (`plano-sistema-dados.md`) e o enum de `upload-url` (§6.3) saem do desenho |
| N2 | Motivos de recusa em **catálogo fechado** (`document_rejection_reasons`, código + texto ao motorista); nota livre só interna. Prazo de análise numa configuração (`review_sla_hours`), devolvido ao app | Decisão 9 |
| N3 | **Vínculo candidatura → conta:** a conta de motorista com e-mail **verificado** se liga à candidatura **aprovada** de mesmo e-mail normalizado (os dois são únicos: `driver_applications_email_key` e a conta por tipo). Sem candidatura aprovada: `409 application_not_approved`. Ligação gravada em `drivers.application_id` e no `audit_log` | Hoje não existe vínculo (`plano-mestre.md` §1). E-mail verificado já é obrigatório nos apps; CPF não existe na candidatura |
| N4 | `drivers.status` vira `approved` **sozinho**, na mesma transação em que o último documento obrigatório é aprovado (com veículo cadastrado e candidatura aprovada). O revisor só suspende | Critério do M3: de candidatura a `approved` sem passo fora do app e do admin, e sem clique redundante |
| N5 | Link de visualização é `POST /documents/:id/view-url` (não `GET`): ele **grava** no `audit_log` antes de devolver a URL | Leitura com efeito colateral não é `GET`; corrige §6.5 |
| N6 | Busca de endereço **pelo servidor** (`/v1/geo/*`): junta Geocoding v6, Search Box e os **pontos próprios** (`curated_places`, no banco, ~20 entradas semeadas por migração); token secreto do Mapbox só no servidor. Pino arrastável com confirmação **sempre** | F10: 86%. O plano B da §5 vira escopo, e combinar fontes só dá certo num lugar só |
| N7 | **Sem PostGIS no M4.** Área de serviço é polígono GeoJSON em `jsonb` + caixa delimitadora em colunas; ponto-no-polígono é função pura no `packages/domain` (sem dependência nova) | Um polígono, poucas consultas por segundo. Revisitar no M5 só com medição (`plano-sistema-dados.md` §4.1) |
| N8 | Tarifa nasce **versionada** (`fare_rule_versions`, nunca `UPDATE`) com `is_test`; cotação aponta para a versão. Em produção, só com versão de teste ativa, `POST /v1/quotes` responde `503 fare_not_configured` (chave `ALLOW_TEST_FARES`, falsa em produção) | Decisão 7 em aberto; a tarifa de teste nunca chega a passageiro real |
| N9 | Cotação **assinada** (HMAC sobre id, categoria, preço, versão, validade), válida por 5 min, preço fechado (D-06). Arredondamento: meio para cima no centavo, **uma vez, no total** | §5.6 e D-06 |

## 2. Armazenamento de documentos no Brasil (D-13): opções

Volume esperado: ~6 arquivos × ~2 MB × 200 motoristas ≈ **2-3 GB** no beta, mais os backups do banco (D-13 cobre os dois).
Em qualquer opção o armazenamento custa **menos de R$ 10/mês** nesse volume; o que decide é jurisdição, maturidade e saída.

| Opção | Prós | Contras |
|---|---|---|
| **A. Magalu Cloud Object Storage** (`br-se1` São Paulo, `br-ne1` Nordeste) | Empresa e cobrança no Brasil, em reais, com nota fiscal; API compatível com S3 (URL pré-assinada, cifragem no servidor); dado não sai da jurisdição brasileira | Produto mais novo, menos recursos de chave gerenciada e trilha de acesso que a AWS; preço por GB **não confirmado** nesta sessão (a calculadora do site carrega por script) |
| **B. AWS S3 `sa-east-1`** (São Paulo) | O mais maduro: SSE-KMS, política por prefixo, CloudTrail, ciclo de vida; ~US$ 0,04/GB/mês de referência (**confirmar na calculadora**) | Cobrança em dólar e cartão internacional; empresa estrangeira (o dado fica no Brasil, mas a lei dos EUA alcança o provedor) |
| C. MinIO no próprio servidor | Custo zero | Documento no mesmo disco do banco: um incidente leva os dois, e o backup precisa de outro destino de qualquer jeito. **Descartada** |

**Recomendação: A (Magalu Cloud, `br-se1`)**, cifrada no servidor, com credencial que só lê e grava o prefixo `driver-docs/`.
Motivo: atende D-13 ao pé da letra, cobra em reais e, como o código fala S3, trocar para B é só configuração. O Vulcano
confirma o preço e a cifragem no painel do provedor antes de o dono contratar; se a Magalu não oferecer cifragem em
repouso verificável, a recomendação passa a B.

## 3. Contratos de API (formato de erro do projeto: `{ ok: false, error: { code, message } }`)

**Motorista (`/v1/driver/*`, token de conta `driver`):**

| Rota | Entrada | Saída e erros |
|---|---|---|
| `POST /v1/driver/link-application` | — (usa o e-mail verificado da conta) | `{ driverId, status }` · `409 application_not_approved` · `409 email_not_verified` · idempotente |
| `PUT /v1/driver/onboarding` | `{ cpf, birthDate, address{...}, cnh{ number, category, expiresOn, ear: boolean } }` | `{ status }` · `422 cnh_without_ear` · `422 invalid_cpf` |
| `PUT /v1/driver/vehicle` | `{ plate, brand, model, year, color }` | `{ vehicleId }` · `409 plate_in_use` · `422 vehicle_too_old` (idade máxima vem da configuração) |
| `GET /v1/driver/verification` | — | `{ status, reviewDeadline?, requirements: [{ typeCode, label, required, hasExpiry, document?: { id, status, rejection?: { code, text }, expiresOn? } }] }` |
| `POST /v1/driver/documents/upload-url` | `{ typeCode, contentType: image/jpeg\|image/png\|application/pdf, sizeBytes ≤ 10 MB, sha256 }` | `{ documentId, uploadUrl, method: "PUT", headers, expiresAt }` (≤ 300 s) · `422 unknown_document_type` · `413 file_too_large` |
| `POST /v1/driver/documents/:id/submit` | `{}` | `{ status: "submitted" }` · `409 upload_missing` (objeto ausente ou tamanho/hash diferente) |
| `PUT /v1/driver/availability` (só a regra no M3; o resto é M5) | `{ online: true }` | `409 driver_not_approved` · `409 document_expired` |

**Admin (`/v1/admin/*`, com CSRF; papéis `revisor_documentos` e `dono`; `suporte`, `financeiro` e `operacao` → `403`):**
`GET /document-reviews?status&cursor` (fila, mais antigo primeiro, com prazo vencido destacado) · `GET /drivers/:id` (dados,
veículo, documentos sem URL) · `POST /documents/:id/view-url` → `{ url, expiresAt }` (≤ 300 s; grava `audit_log`) ·
`POST /documents/:id/approve { expiresOn? }` · `POST /documents/:id/reject { reasonCode, internalNote? }` (`422
unknown_reason`) · `GET /document-rejection-reasons` · `POST /drivers/:id/suspend { reason }`.

**Geografia e cotação (passageiro):**

| Rota | Entrada | Saída e erros |
|---|---|---|
| `GET /v1/geo/search` | `q`, `kind=address\|place`, `near=lat,lng` | `{ results: [{ id, label, sublabel, lat, lng, source: curated\|geocoding\|searchbox }] }` (pontos próprios primeiro) |
| `GET /v1/geo/reverse` | `lat`, `lng` (do pino) | `{ label, lat, lng, inServiceArea }` |
| `GET /v1/service-area` | — | `{ areaId, name, polygon (GeoJSON), bbox }` |
| `GET /v1/categories` | — | só as **ligadas**: `[{ slug, name, description, seats }]` (Motorista mulher, Pet e Entrega desligadas, D-08/D-09) |
| `POST /v1/quotes` | `{ origin{lat,lng,label}, destination{lat,lng,label}, categorySlugs? }` | `{ route{ distanceM, durationS, polyline }, quotes: [{ quoteId, categorySlug, priceCents, currency: "BRL", fareVersionId, isTestFare, expiresAt, signature }] }` · `422 outside_service_area` · `422 route_too_short` · `502 route_unavailable` · `503 fare_not_configured` |
| `GET /v1/quotes/:id` | — | a cotação · `409 quote_expired` se vencida (o consumo em `POST /v1/trips` é M5 e usa a mesma checagem) |

**Admin de tarifa (`dono`):** `GET /fare-tables`, `POST /fare-tables` (cria versão, fecha a anterior), `POST /fare-tables/simulate
{ versionDraft, routes[] }` → preço ao passageiro e ganho do motorista com a taxa de 20% e de 25%, `GET /service-areas`.

## 4. Fatias em ordem

| Fatia | Zona (quem) | O que entrega | Aceite | Depende de |
|---|---|---|---|---|
| **K0** Contrato | Vega (`packages/api-client/**`, `packages/domain/**`) | Tipos de §3 para M3 e M4 numa só fatia (arquivo de fronteira) + adaptador `mock` no `api-client` | Os dois apps e o admin compilam contra os tipos; `mock` cobre caminho feliz e cada erro de §3 | — |
| **D1** Migração de documentos | Cronos (`apps/api/migrations/0024_*`) | `drivers` (1:1 com conta `driver`, `application_id`), `vehicles`, `document_requirements` (versão, cidade, `provisional`), `driver_documents` (chave, hash, tamanho, `expires_on`, `rejection_code`), `document_rejection_reasons`, `driver_settings` (`review_sla_hours`, idade do veículo) | Sobe e desce em banco limpo e numa cópia com dados do S1; papel restrito da 0017 só com o mínimo; nenhum binário no banco | — |
| **D2** Armazenamento | Vulcano (infra, `docs/deploy-*`) | Bucket no Brasil cifrado, CORS só para `PUT` dos apps, credencial por prefixo, segredo no Easypanel; destino dos backups (D-13) | Ficha com região, cifragem conferida no painel, custo real; objeto público dá `403` | Dono contrata (§6) |
| **D3** Porta de armazenamento | Vega (`apps/api/src/**`; dependência do SDK S3 é fatia só dele) | `DocumentStorage` com adaptador S3 e adaptador local de teste | Teste automatizado: URL com validade ≤ 300 s, recusada depois de vencer (local) e, em homologação, no bucket real | D1 (D2 só para a prova real) |
| **D4** Rotas do motorista | Vega | Vínculo N3, etapa 2, veículo, upload, envio, verificação, regra de disponibilidade | Teste por erro de §3; documento vencido dá `409 document_expired` | K0, D1, D3 |
| **D5** Rotas de revisão | Vega | Fila, view-url auditado, aprovar/recusar, N4, suspensão; job diário de vencimento (e-mail 30 e 7 dias antes; vencido passa a `expired`) | Cada visualização tem linha no `audit_log` (teste confere); `suporte` → 403 em todas; aprovar o último documento leva a `approved` | D4 |
| **D6** App do motorista | Lyra B (`apps/driver/**`) | M02 etapa 2, M03 documentos (câmera/arquivo, progresso, reenviar com motivo), M04 análise com o prazo; corrige o Q5 | Portão de tela (`plano-mestre.md` §4.3); fluxo completo contra `mock` e depois contra a API | K0; D4 para a integração |
| **D7** Fila no painel | Lyra C (`apps/admin/**`) | Fila de documentos, detalhe do motorista, visualizador (URL pedida no clique, nunca pré-carregada), diálogos de aprovar/recusar com o catálogo | Nenhuma URL de documento em cache nem em log; tela some para quem não tem o papel | K0; D5 para a integração |
| **G1** Migração de geografia e preço | Cronos (`0026_*`; a 0025 virou o endurecimento da 0024 pedido pelo Órion) | `ride_categories` (5, três desligadas), `service_areas`, `curated_places` (semente de ~20), `fare_rule_versions` (+`is_test`), `fare_quotes` (+assinatura, purga em 30 dias) | Versão de tarifa é imutável no banco (gatilho recusa `UPDATE` em versão fechada) | D1 (só pela numeração) |
| **G2** Preço no domínio | Vega (`packages/domain/**`) | `computeFare` em centavos, ponto-no-polígono, regra de arredondamento | Casos de borda (mínimo, meio centavo, km zero, multiplicador); mesma entrada, mesmo preço | K0 |
| **G3** Busca e área | Vega | `/v1/geo/*`, `/v1/service-area`, `/v1/categories`; cache curto; limite por conta | Rodar a amostra da F10 pela rota nova: ≥ 90% com os pontos próprios, ou a diferença listada caso a caso | G1, G2; token do servidor (§6) |
| **G4** Cotação | Vega | `POST /v1/quotes` com Directions no servidor, assinatura, validade, N8 | Rota gravada gera sempre a mesma cotação; versão nova não muda cotação emitida; vencida dá `409 quote_expired` | G3 |
| **G5** Tarifa no admin | Vega (rotas) → Lyra C (telas) | Versões, simulador (passageiro e motorista, taxa 20-25%) | Criar versão nunca altera a anterior; simulador bate com `computeFare` | G2; D7 liberar a zona do admin |
| **G6** Telas do passageiro | Lyra A (`apps/passenger/**`) | P03 mapa real e localização, P04 busca + pino + confirmação, P05 categorias, P06 confirmação com selo "tarifa de teste" | Nenhuma cifra de mockup no código (D2, `grep` no CI); portão de tela | K0; G4 para a integração |
| **V1** Token e PostGIS | Vulcano | Segredo `MAPBOX_SERVER_TOKEN` separado do público; registro de N7 | Token do servidor fora de qualquer bundle de app | — |
| **Q** Portões | Íris, depois Órion | Íris por fatia; Órion revisa D3-D5 e D7 juntos (dado sensível) antes de produção | Vereditos escritos | cada fatia |

## 5. O que roda em paralelo

- **Já, no dia 1:** K0 (Vega), D1 (Cronos), V1 (Vulcano) e o levantamento do D2 (Vulcano). São zonas diferentes.
- **Depois do K0, quatro trilhas juntas** (teto de ~4 agentes): Lyra B no D6, Lyra A no G6, Cronos no G1 (após D1), Vega em
  D3 → D4 → D5. As telas andam contra o `mock` e só integram quando a rota existir.
- **Gargalo real: Vega** é uma zona só (`apps/api/src/**`). Ordem dela: D3, D4, G2 (pode ir antes, é `packages/domain`), D5, G3,
  G4, G5. Se o M4 tiver pressa, G2-G4 entram depois do D4 e o D5 vai por último.
- **Lyra C** é uma instância: D7 primeiro, telas do G5 depois. **Cronos** numera em série: 0024 antes de 0025.

## 6. O que só o dono destrava, e em que ponto

| O quê | Trava | Sem isso, a equipe segue com |
|---|---|---|
| Contratar o armazenamento (Magalu ou AWS) e criar a credencial pelo roteiro do Vulcano | A prova real da D3 e a publicação do M3 | Adaptador local; tudo testado menos o bucket |
| Token secreto do Mapbox na conta dele (escopo só de busca e rota) | Integração do G3 e do G4 | Respostas gravadas do Mapbox nos testes |
| Aprovar o texto do prazo (proposta: **2 dias úteis**) e o catálogo de motivos (proposta no D1) | Publicar a M04 | Valores propostos marcados como provisórios |
| **Lista da STTU** | **Abrir o cadastro** e trocar a lista provisória | Semente federal com `provisional = true` |
| **Decisão 7** (números da tarifa e cortes da taxa), usando o simulador do G5 | **Abrir o cadastro** (compromisso de 18/11) e qualquer cotação em produção | Tarifa de teste; `503 fare_not_configured` em produção |
| Prazo de guarda de documento de motorista (advogado, decisão 16) | Rotina de descarte, antes do beta | Guarda enquanto a conta existir |

## 7. Riscos

1. **Vega como gargalo**: M3 e M4 caem na mesma zona. Mitigação: ordem de §5 e K0 cedo, para as telas não esperarem.
2. **Lista da STTU muito diferente da semente** (ex.: vistoria municipal com laudo próprio): a estrutura absorve, mas a M03
   pode precisar de um tipo de arquivo novo. Barato porque é dado.
3. **Link de 5 min vazado** pela captura de tela do revisor: aceito; a trilha de quem abriu está no `audit_log`.
4. **Cotação com tarifa de teste vazar para produção**: N8 bloqueia por configuração, e a Íris testa com a chave desligada.
5. **Busca de endereço abaixo de 90% mesmo com pontos próprios**: o pino com confirmação cobre; medir de novo com a amostra.
