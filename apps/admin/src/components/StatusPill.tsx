import { memo } from 'react';
import type { DriverApplicationStatus } from '../api';
import styles from './StatusPill.module.css';

const LABEL: Record<DriverApplicationStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Reprovado',
};

export const StatusPill = memo(function StatusPill({ status }: { readonly status: DriverApplicationStatus }) {
  return <span className={`${styles['pill']} ${styles[status]}`}>{LABEL[status]}</span>;
});
