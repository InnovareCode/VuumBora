import Image from 'next/image';
import { Container } from './Container';
import styles from './Header.module.css';

/**
 * Página única sem seções para navegar entre si — nenhum menu, nenhum
 * botão de abrir/fechar. Só a marca, pequena, para não roubar espaço do
 * primeiro scroll (`docs/decisoes-do-dono.md` → "Virada do site":
 * "se a pessoa tiver que rolar muito para entender o que fazer, falhou").
 */
export function Header() {
  return (
    <header className={styles['header']}>
      <Container>
        <div className={styles['bar']}>
          <a href="#topo" className={styles['logoLink']} aria-label="VuumBora, início da página">
            <Image src="/brand/vuumbora-horizontal.png" alt="VuumBora" width={140} height={34} priority />
          </a>
        </div>
      </Container>
    </header>
  );
}
