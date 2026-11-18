'use client';

import { useState } from 'react';
import { NAV_LINKS } from '@/content/nav';
import styles from './Header.module.css';

/**
 * Único pedaço de JavaScript do cabeçalho — isolado num Client Component
 * pequeno para não transformar o resto da página (estática) em client-side.
 */
export function MobileNavToggle({ navId }: { navId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles['toggle']}
        aria-expanded={open}
        aria-controls={navId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="visually-hidden">{open ? 'Fechar menu' : 'Abrir menu'}</span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          {open ? (
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      <div
        id={navId}
        data-open={open}
        className={styles['mobileNav']}
        onClick={(event) => {
          if ((event.target as HTMLElement).tagName === 'A') setOpen(false);
        }}
      >
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </div>
    </>
  );
}
