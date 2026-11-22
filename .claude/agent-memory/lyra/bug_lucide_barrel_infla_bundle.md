---
name: bug_lucide_barrel_infla_bundle
description: `import { Car } from 'lucide-react-native'` leva a biblioteca inteira (~2.100 módulos de ícone, ~2 MB) para o bundle porque o Metro não faz tree-shaking — causa do `index` de 2,3 MB do motorista e do `__common` de 3-4 MB do passageiro; correção recomendada (deep import) ainda NÃO aplicada.
metadata:
  type: project
---

**Medido (21/11/2026, export web de produção):** chunk `index` do motorista = 2,3 MB com 2.139 módulos `__d(` e 6.192
strings de path SVG para ~13 ícones usados; o app só tem ~20 módulos próprios. O passageiro carrega o mesmo no `__common`
(compartilhado entre rotas, baixado em toda página). Vale também para o Hermes nativo (Metro sem tree-shaking): pacote
JS inflado na loja, não é só preview web.

**Causa raiz:** barrel `dist/esm/lucide-react-native.mjs` re-exporta ~2.400 ícones; sem tree-shaking, importar 1 nome
puxa todos. `sideEffects:false` só ajuda bundler que faz tree-shaking.

**Correção possível (NÃO feita — A1 só autorizava reduzir se fosse mapbox-gl):** deep import por ícone, o pacote exporta
`./icons/*` (`import Car from 'lucide-react-native/icons/car'`, default export; nomes de arquivo em kebab-case e aliases
como `Home`→`house` só existem no barrel `icons/index.mjs`, então um codemod precisa mapear). Toca ~34 arquivos (apps +
`packages/ui`, que recebe ícone por prop e não importa lucide). Alternativa descartada: alias de Metro para um barrel
local — falha só em runtime quando alguém usar ícone fora da lista, `tsc` não pega.

**Como evitar no futuro:** ao adicionar lib de ícones/utilitários, medir o chunk da rota no export antes e depois; barrel de
lib grande sem tree-shaking é o primeiro suspeito de bundle inflado.

Relacionado: [[feedback_telas_de_dev_fora_do_build_por_metro_blocklist]].
