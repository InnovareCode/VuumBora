import logoVuumbora from '../assets/brand/logo-vuumbora.png';
import { cn } from '../lib/cn';

// Dimensões nativas do PNG — declaradas em `width`/`height` para o navegador
// reservar o espaço certo (via `aspect-ratio` implícito do atributo) antes da
// imagem carregar, mesmo quando a classe Tailwind só fixa a altura (`h-*`) e
// deixa a largura em `auto`. Não é decorativo: evita o salto de layout.
const NATIVE_WIDTH = 480;
const NATIVE_HEIGHT = 118;

/**
 * Logomarca oficial da VuumBora (ícone + "VuumBora"), não a palavra escrita
 * em texto. Fonte: `apps/site/public/assets/img/logo-vuumbora.png` — versão
 * já recortada/otimizada que o site serve em produção (34 KB; a referência
 * bruta em `VuumBora_Claude_Design_System/referencias/logo_aprovada.png` tem
 * 2,2 MB e não deve ser usada numa tela). Copiada para dentro de
 * `apps/admin` (não importada de outro workspace) porque o
 * `apps/admin/Dockerfile` só leva `apps/admin` + tokens para o contexto de
 * build — um caminho fora disso simplesmente não existiria na imagem.
 * O site continua sendo a fonte: se o logo mudar lá, repetir a cópia aqui.
 *
 * O PNG tem "Vuum" em branco (sem fundo opaco) — funciona em cima de
 * qualquer tom da escala só-escura do design system (navy/surface/elevated,
 * ver `global.css`), mas NÃO deve ir sobre um fundo claro: o texto branco
 * desapareceria.
 */
export function BrandLogo({ className }: { readonly className?: string }) {
  return (
    <img
      src={logoVuumbora}
      alt="VuumBora"
      width={NATIVE_WIDTH}
      height={NATIVE_HEIGHT}
      decoding="async"
      className={cn('w-auto', className)}
    />
  );
}
