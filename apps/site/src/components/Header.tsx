import Image from 'next/image';
import { Container } from './Container';
import { MobileNavToggle } from './MobileNavToggle';
import styles from './Header.module.css';

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#seja-motorista', label: 'Seja motorista' },
  { href: '#seguranca', label: 'Segurança' },
  { href: '#faq', label: 'Perguntas frequentes' },
] as const;

export function Header() {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.bar}>
          <a href="#topo" className={styles.logoLink} aria-label="VuumBora, início da página">
            <Image
              src="/brand/vuumbora-horizontal.png"
              alt="VuumBora"
              width={170}
              height={42}
              priority
            />
          </a>
          <nav className={styles.desktopNav} aria-label="Principal">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <MobileNavToggle navId="menu-principal" />
        </div>
      </Container>
    </header>
  );
}
