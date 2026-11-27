import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

/**
 * Rota que não existe (A07). Fica fora da casca (`AppShell`) porque vale logado ou não — por isso traz a própria marca
 * e um `<main>`. A saída vai para `/`, que decide o destino: a primeira área do papel logado (o revisor de documentos
 * cai na fila dele, não no "sem acesso" do pré-cadastro) ou o login, para quem não entrou.
 */
export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-screen px-6 py-12">
      <BrandLogo className="mb-8 h-8" />
      <section aria-labelledby="not-found-title" className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-xxl bg-cta/10 text-cta-pressed" aria-hidden="true">
          <Compass className="h-6 w-6" />
        </span>
        <h1 id="not-found-title" className="text-title font-black tracking-tight text-text sm:text-heading">
          Página não encontrada
        </h1>
        <p className="text-small font-medium text-text-secondary sm:text-body">Verifique o endereço ou volte para o início do painel.</p>
        <Link
          to="/"
          className="mt-2 inline-flex min-h-11 items-center rounded-pill bg-cta px-6 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
        >
          Ir para o início
        </Link>
      </section>
    </main>
  );
}
