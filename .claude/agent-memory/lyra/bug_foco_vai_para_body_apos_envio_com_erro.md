---
name: bug_foco_vai_para_body_apos_envio_com_erro
description: Telas de conta do passageiro — o foco caía no <body> depois de todo envio com erro. Duas causas reais (blurOnSubmit do react-native-web e botão que perde tabindex ao carregar), a hipótese errada que a Íris levantou, e a regra de foco adotada (campo/aviso). Inclui as armadilhas do RHF e do RN 0.88.
metadata:
  type: feedback
---

**Sintoma (F5/F6/F7, Íris S1 passada 3, corrigido 22/11/2026):** depois de enviar login/cadastro/código/redefinir com erro, `document.activeElement`
era `<body>` (3 motores; Enter na senha E clique no botão E Tab+Enter). Ao chegar na tela do código o foco não ia ao campo do código;
envio vazio não levava o foco ao primeiro campo com erro; esqueci-senha mostrava `invalid_email` no aviso geral e o campo ficava sem `aria-invalid`.

**Causa raiz (medida, não a hipótese do veredito):** a Íris supôs "campos e botão ficam desabilitados". NÃO é isso no campo: durante o envio o
`<input>` fica só `readOnly` e continua focado. São duas coisas:
1. **react-native-web 0.21.4 desfoca o campo no Enter** (`blurOnSubmit` vale `true` por padrão em campo de uma linha com `onSubmitEditing`:
   `setTimeout(() => hostNode.blur(), 0)`). RN 0.88 tem `submitBehavior`, mas o RNW 0.21.4 só lê `blurOnSubmit`. Correção em `InputCore`:
   `blurOnSubmit: false` só quando `Platform.OS === 'web'` (no celular o teclado fecha ao enviar, que é o certo).
2. **O botão que enviou fica `disabled`/`loading`** → o Pressable do RNW perde o `tabindex` → o navegador faz "focus fixup" para o `<body>`.
   Quando a resposta chega ninguém devolve o foco.

**Regra adotada (um lugar só: `apps/passenger/src/lib/focusAfterRender.ts`):** erro de CAMPO → foco no campo (a mensagem está embaixo dele);
erro que é AVISO → foco no aviso (`InlineAlert` ganhou `focusRef` → `tabIndex -1`, fora do Tab, só com a prop); envio vazio → 1º campo com erro;
chegada no código/redefinir → campo do código. Padrão "GOV.UK error summary": o foco vai onde está a explicação e as ações.

**Armadilhas (cada uma já custou ou quase custou tempo):**
- **Focar na hora em que a resposta chega NÃO acha o alvo:** os campos ainda estão `submitting` e o aviso ainda não existe no DOM. Guardar o pedido
  em ESTADO (`useFocusAfterRender`) e executar num `useEffect` — vem no mesmo lote do `setSubmitting(false)`/`setFailure`.
- **RHF só foca o 1º campo inválido (`shouldFocusError`) se `inputRef={field.ref}` estiver ligado** no `Controller`. `setFocus('campo')` também
  usa esse ref e substitui os `useRef` manuais do encadeamento Enter→próximo campo. Checkbox sem ref é PULADO e o RHF foca o próximo inválido
  (foco "errado"): `ConsentCheckbox` ganhou `checkboxRef`.
- `InteractionManager` NÃO existe mais no núcleo do RN 0.88 (o tipo falha: "no exported member"). `useFocusOnArrival` usa `setTimeout(0)`;
  abrir o teclado já no campo do código no celular NÃO foi provado em aparelho.
- `aria-invalid="true"` no campo do código não distingue erro de campo de erro de aviso (a tela marca o campo nos dois): para saber qual foi,
  olhe se o `*-alert` existe.
- Anel de foco do aviso: o padrão do navegador (Chromium/Firefox visíveis; no WebKit do Playwright o anel `auto` é PRETO e some no fundo escuro —
  vale para todo Pressable do app, não só o aviso; tema de foco próprio ficou como pendência do design system).
- O `code_expired` natural do mock (conta sem pedido de código) é AVISO, não erro de campo; para provar o erro de campo do código forçar
  `invalid_code` com `attemptsLeft`.

**Prova:** `document.activeElement` por cenário nos 3 motores (59 verificações por motor, dev server com o gancho `__vuumboraIdentity`), com
controle: sem o foco no aviso → clique/Tab+Enter caem no `<body>` (o Enter só se salva por causa do `blurOnSubmit:false`); sem o foco na chegada →
`<body>`; sem `field.ref` → foco no campo errado; `invalid_email` sem o ramo → o roteiro nem acha o `aria-invalid` (timeout).
Relacionado: [[bug_rnweb_backhandler_console_error]], [[project_passenger_identity_b1]], [[bug_inputcore_textinput_37pt_e_anel_duplo]].
