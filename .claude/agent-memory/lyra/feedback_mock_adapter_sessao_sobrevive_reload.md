---
name: feedback_mock_adapter_sessao_sobrevive_reload
description: Adaptador mock de autenticação guardando sessão só em variável de módulo é deslogado a cada F5/navegação dura — use sessionStorage para a sessão FICTÍCIA sobreviver a reload, imitando o cookie httpOnly do modo real.
metadata:
  type: feedback
---

**Causa raiz:** `createMockAuthAdapter` guardava `session` numa closure
(`let session: AdminUser | null = null`). Funciona enquanto a navegação é só
client-side (React Router), mas qualquer navegação DURA — `page.goto()` no
Playwright, ou um F5 de verdade — recarrega o bundle inteiro e zera a
variável. Resultado medido: login funcionava, mas testar a rota de detalhe
com uma nova aba/reload sempre voltava pro login, parecendo bug de rota
protegida quando na verdade era o mock perdendo estado.

**Por que importa:** no modo real (`http`), a sessão sobrevive a F5 porque
mora num cookie httpOnly do navegador — o mock devia imitar esse
comportamento pra não distorcer o teste manual/automatizado de quem usa
`VITE_API_MODE=mock`.

**Correção:** persistir só o admin fictício em `sessionStorage` (não
`localStorage` — sessão deve sumir ao fechar a aba, igual sessão real) sob
uma chave com prefixo óbvio (`__vuumbora_admin_mock_session__`), lida na
construção do adaptador e escrita em `login`/`logout`. Nunca é uma credencial
real, então não conflita com a regra "SPA não guarda token" (essa regra é
sobre sessão de verdade).

**Como pegar isso de novo:** ao medir um app com adaptador mock no
Playwright, se `page.goto()` para uma rota protegida cair sempre no login
mesmo depois de ter logado antes, suspeite primeiro do mock perdendo estado
em reload — não da lógica de rota protegida. Ver também
[[feedback_medir_site_sem_browser_tool]] sobre `networkidle` não esperar
`setTimeout` de latência fake do mock (outra pegadinha do mesmo tipo de
mock, em `apps/admin`, 20/11/2026).
