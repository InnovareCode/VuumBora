---
name: feedback_light_section_token_scoping
description: Como fazer alternância clara/escura num projeto token-driven sem criar uma segunda versão de cada componente — redefinir os mesmos custom properties dentro de um escopo CSS. Use quando pedirem seções com fundos alternados (claro/escuro) numa página cujos componentes já consomem var(--color-*) em vez de hex fixo.
metadata:
  type: feedback
---

**O padrão:** se todo componente da página já lê cor via `var(--color-text-primary)`,
`var(--color-background-surface)` etc. (convenção do projeto, nunca hex
fixo), alternar claro/escuro NÃO exige criar uma variante de cada
componente. Basta uma classe wrapper que redefine os MESMOS nomes de
variável para os valores claros, só dentro do seu escopo:

```css
.light-section {
  color-scheme: light;
  --color-background-surface: #ffffff;
  --color-text-primary: var(--color-brand-navy);
  --color-text-secondary: var(--color-text-on-light-muted); /* reusa token que já existia */
  /* ... */
}
```

```tsx
<div className="light-section">
  <PassengerNote /> {/* zero mudança no componente */}
</div>
```

**Por quê funciona:** CSS custom properties são herdadas por cascata —
qualquer descendente que leia `var(--color-text-primary)` recebe o valor
redefinido no ancestral mais próximo. Como todo componente do projeto já é
"token-driven" (regra de qualidade da Lyra: nunca hardcodar cor), a troca de
paleta vira responsabilidade exclusiva de QUEM ENVOLVE a seção, não de quem
escreveu o componente.

**Como aplicar:**
1. Confirme antes que os componentes-alvo realmente só usam `var(--color-*)`
   — se algum tiver hex fixo ou `rgba()` com número solto fora de um token,
   ele não vai reagir ao escopo (ex.: `WaitlistForm`'s `.generalError` usa
   `rgba(255,107,117,.1)` fixo — funciona em claro e escuro só porque é uma
   cor neutra o bastante, não porque reagiu ao escopo; vale checar caso a
   caso).
2. Redefina só os tokens que realmente mudam (fundo, texto, borda) — não
   precisa redeclarar a paleta inteira.
3. Reaproveite tokens que já existem no design system antes de inventar hex
   novo (ex.: `--color-text-on-light-muted` já existia para telas de app com
   fundo claro; reaproveitado aqui em vez de criar outro cinza).

Ver [[project_site_nextjs_static_export]] (seção "4ª reescrita") para a
implementação completa.
