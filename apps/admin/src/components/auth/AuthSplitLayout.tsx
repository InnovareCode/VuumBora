import type { ReactNode } from 'react';
import { Shield } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';

export interface AuthHeroFeature {
  readonly icon: ReactNode;
  readonly text: string;
}

/**
 * Casca de duas colunas para telas de autenticação (hoje só login — o
 * desenho já nasce reutilizável porque é a mesma anatomia que qualquer tela
 * de auth futura vai precisar).
 *
 * Lado escuro (`aside`, some em telas estreitas): marca, selo, título forte,
 * linha de apoio e uma lista curta de itens com ícone — tudo texto VERDADEIRO
 * sobre o painel hoje (nada de funcionalidade que não existe).
 * Lado claro (`children`): cartão do formulário, com a marca reaparecendo só
 * no mobile (onde o lado escuro não é exibido).
 *
 * Paleta/tipografia são as do VuumBora (bg-navy/text-cta, Plus Jakarta Sans),
 * mesmos aliases Tailwind que `AppShell` já usa — não os tons teal do
 * ModaShop que serviu de referência de anatomia.
 *
 * Não define `min-h-screen` própria: espera ser filha de um contêiner
 * `flex min-h-screen flex-col` (ver `LoginPage`) para empilhar com o
 * `DemoModeBanner` sem dobrar a altura mínima da tela quando o banner
 * aparece — mesma composição que `AppShell` já usa.
 */
export function AuthSplitLayout({
  heroTitle,
  heroSubtitle,
  heroFeatures,
  children,
}: {
  readonly heroTitle: string;
  readonly heroSubtitle: string;
  readonly heroFeatures: readonly AuthHeroFeature[];
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-1 bg-screen">
      {/* ── Lado escuro: marca e contexto ──────────────────────────── */}
      <aside
        aria-label="Sobre o painel administrativo VuumBora"
        className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex xl:p-16"
      >
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-cta/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 translate-y-1/3 rounded-full bg-cta/10 blur-3xl"
        />

        <div className="relative z-10 flex items-center">
          <BrandLogo className="h-8" />
        </div>

        <div className="relative z-10 my-auto max-w-md space-y-8 py-12">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white ring-1 ring-white/20">
              <Shield className="h-3 w-3" aria-hidden="true" />
              Painel administrativo
            </span>
            {/* Frase de marca, não título da tela: o `<h1>` é o do cartão ("Entrar no painel", "Digite o código"...). Com
                os dois em `<h1>`, a 1024 px ou mais a página tinha dois títulos principais. */}
            <p className="text-heading font-bold leading-[1.15] tracking-tight text-white xl:text-display">{heroTitle}</p>
            <p className="text-body leading-relaxed text-white/80">{heroSubtitle}</p>
          </div>

          <ul className="space-y-4 border-t border-white/10 pt-6">
            {heroFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-3.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-cta ring-1 ring-white/10"
                  aria-hidden="true"
                >
                  {feature.icon}
                </span>
                <span className="text-small font-medium leading-snug text-white/90">{feature.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 border-t border-white/10 pt-6 text-caption text-white/60">
          © {new Date().getFullYear()} VuumBora. Acesso restrito à equipe.
        </p>
      </aside>

      {/*
        ── Lado "claro": cartão do formulário ───────────────────────
        A paleta do VuumBora não tem um tom claro de uso geral — é um produto
        só-escuro de propósito (`color-scheme: dark`, ver global.css). O único
        valor claro do design system (`gradient.searchLight`) é reservado,
        pela própria direção de arte, a UM elemento por tela (a pílula de
        busca dos apps RN) — usá-lo aqui, numa coluna inteira, violaria essa
        regra. A hierarquia clara/escura da anatomia (ModaShop) vira aqui uma
        hierarquia DENTRO da escala de escuros: `bg-navy` (mais escuro, hero) →
        `bg-surface` (meio, esta coluna) → `bg-elevated` (mais claro do trio,
        o cartão) — mesma função visual (separar "marca" de "ação"), tokens
        que já existem.
      */}
      <div className="relative flex flex-1 flex-col overflow-y-auto bg-surface p-6 sm:p-10 lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-80 w-80 rounded-full bg-cta/10 blur-3xl"
        />
        {/* `my-auto` (e não `justify-center` no pai): centraliza quando sobra espaço, mas quando o
            cartão é mais alto que a tela (códigos de recuperação, QR) o topo continua alcançável
            por rolagem — `justify-center` corta o topo de conteúdo alto sem como rolar até ele. */}
        <div className="relative z-10 mx-auto my-auto w-full max-w-sm py-6">
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <BrandLogo className="h-9" />
          </div>

          <div className="rounded-xxl border border-border bg-elevated p-6 shadow-xl shadow-black/20 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
