import { memo } from 'react';
import type { DriverDocumentStatus, DriverVerificationStatus } from '../../api';
import styles from '../StatusPill.module.css';

type Tone = 'pending' | 'approved' | 'rejected' | 'neutral';

/** Rótulos de tela (não lógica): o estado vem pronto do servidor. Exportados para os avisos de decisão. */
export const DOCUMENT_STATUS_LABEL: Record<DriverDocumentStatus, string> = {
  submitted: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
  expired: 'Vencido',
};

const DOCUMENT_STATUS_TONE: Record<DriverDocumentStatus, Tone> = {
  submitted: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  expired: 'rejected',
};

export const VERIFICATION_STATUS_LABEL: Record<DriverVerificationStatus, string> = {
  not_started: 'Cadastro não iniciado',
  pending_documents: 'Faltam documentos',
  under_review: 'Em análise',
  changes_requested: 'Correção pedida',
  approved: 'Cadastro aprovado',
  suspended: 'Suspenso',
};

const VERIFICATION_STATUS_TONE: Record<DriverVerificationStatus, Tone> = {
  not_started: 'neutral',
  pending_documents: 'neutral',
  under_review: 'pending',
  changes_requested: 'rejected',
  approved: 'approved',
  suspended: 'rejected',
};

/** Mesmo visual do `StatusPill` das candidaturas (mesmo CSS), com o vocabulário de documento. */
export const DocumentStatusPill = memo(function DocumentStatusPill({ status }: { readonly status: DriverDocumentStatus }) {
  return <span className={`${styles['pill']} ${styles[DOCUMENT_STATUS_TONE[status]]}`}>{DOCUMENT_STATUS_LABEL[status]}</span>;
});

export const VerificationStatusPill = memo(function VerificationStatusPill({ status }: { readonly status: DriverVerificationStatus }) {
  return <span className={`${styles['pill']} ${styles[VERIFICATION_STATUS_TONE[status]]}`}>{VERIFICATION_STATUS_LABEL[status]}</span>;
});
