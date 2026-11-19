# syntax=docker/dockerfile:1
#
# Build de `apps/api` (Fastify + TypeScript) dentro do monorepo npm
# workspaces. Mesma lógica do Dockerfile de `apps/site` (ver lá o porquê de
# não usar a detecção automática do Easypanel): o build roda a partir da
# raiz do repositório, mas a imagem final só carrega o necessário para
# rodar o servidor Node já compilado — sem TypeScript, sem devDependencies.
#
# apps/api é standalone: não depende de packages/domain nem
# packages/api-client (o contrato fica documentado lá, mas o runtime deste
# serviço não importa nada de outro workspace) — por isso o contexto de
# build não precisa copiar nada além de apps/api.
#
# No Easypanel, no serviço `vuumbora-backend`: método "Dockerfile",
# Caminho do Dockerfile = apps/api/Dockerfile, Caminho de build/contexto =
# raiz do repositório. Ver docs/lista-de-espera.md.
# Local: docker build -f apps/api/Dockerfile -t vuumbora-api .   (rodar da raiz)

# ---------- Stage 1: build (TypeScript -> dist/) ----------
FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY apps/api apps/api

RUN npm run build --workspace @vuumbora/api

# ---------- Stage 2: dependências de produção (sem devDependencies) ----------
FROM node:22-alpine AS prod-deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --ignore-scripts

# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY apps/api/migrations ./migrations
COPY apps/api/scripts ./scripts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
