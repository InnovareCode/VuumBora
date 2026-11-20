---
name: feedback_vite_css_modules_no_property_access_index_signature
description: Em qualquer app Vite+TS do monorepo, `styles.algumaClasse` (CSS Modules) não compila — tsconfig.base.json exige `styles['algumaClasse']`. Use ao escrever componente React com CSS Modules neste monorepo.
metadata:
  type: feedback
---

`tsconfig.base.json` (raiz, usado por todo workspace) liga
`noPropertyAccessFromIndexSignature: true`. `vite/client.d.ts` tipa
`*.module.css` como `{ readonly [key: string]: string }` — um índice, não
propriedades nomeadas. Resultado: **todo** `styles.algumaClasse` falha o
`tsc --noEmit` com `TS4111`, mesmo em componente que não tem nenhum outro erro.

**Por quê:** a regra existe pra pegar typo de chave em objetos genéricos
(`config.foo` quando `foo` não existe deveria ser erro, não `any`
silencioso) — CSS Modules cai na mesma categoria de tipagem porque o
`.d.ts` do Vite não gera uma interface nomeada por classe.

**Como aplicar:** escreva sempre `styles['algumaClasse']` desde o primeiro
componente. Se já escreveu um lote inteiro com `styles.x`, converter em
massa com:

```bash
for f in $(grep -rlE "styles\.[A-Za-z]" src); do
  sed -i -E "s/styles\.([A-Za-z_][A-Za-z0-9_]*)/styles['\1']/g" "$f"
done
```

(seguro porque todo import de CSS Module no projeto é sempre nomeado
`styles` — confira isso antes de rodar em outro projeto com convenção
diferente). Pego em `apps/admin` (20/11/2026): 70+ ocorrências em 9 arquivos
na primeira passada de `npm run typecheck`.
