import { memo, type ReactNode } from 'react';
import type { AdminDriverDetail } from '../../api';
import { formatCalendarDate, formatCpf, formatPostalCode } from '../../lib/documentFormat';

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="break-words text-small font-medium text-text">{children}</dd>
    </div>
  );
}

/**
 * Os dados do cadastro (etapa 2) e do veículo, ao lado dos documentos — para conferir o arquivo contra o
 * que o motorista declarou. Dado sensível (CPF, CNH, endereço): esta tela só existe para os papéis da
 * revisão, e nada daqui é copiado para fora dela.
 */
export const DriverRegistrationPanel = memo(function DriverRegistrationPanel({ driver }: { readonly driver: AdminDriverDetail }) {
  const { profile, vehicle } = driver;
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="driver-registration-title" className="rounded-xxl border border-border bg-surface p-4 sm:p-5">
        <h2 id="driver-registration-title" className="mb-3 text-subtitle font-bold text-text">
          Cadastro
        </h2>
        {profile ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="CPF">{formatCpf(profile.cpf)}</Field>
            <Field label="Nascimento">{formatCalendarDate(profile.birthDate)}</Field>
            <Field label="Endereço">
              {profile.address.street}, {profile.address.number}
              {profile.address.complement ? ` — ${profile.address.complement}` : ''} · {profile.address.neighborhood} ·{' '}
              {profile.address.city}/{profile.address.state} · CEP {formatPostalCode(profile.address.postalCode)}
            </Field>
            <Field label="CNH">
              nº {profile.cnh.number} · categoria {profile.cnh.category} · válida até {formatCalendarDate(profile.cnh.expiresOn)}
            </Field>
            <Field label="Atividade remunerada (EAR)">{profile.cnh.ear ? 'Sim, consta na CNH' : 'Não consta na CNH'}</Field>
          </dl>
        ) : (
          <p className="text-small text-text-secondary">O motorista ainda não enviou a etapa 2 (dados pessoais e CNH).</p>
        )}
      </section>

      <section aria-labelledby="driver-vehicle-title" className="rounded-xxl border border-border bg-surface p-4 sm:p-5">
        <h2 id="driver-vehicle-title" className="mb-3 text-subtitle font-bold text-text">
          Veículo
        </h2>
        {vehicle ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Placa">{vehicle.plate}</Field>
            <Field label="Marca e modelo">
              {vehicle.brand} {vehicle.model}
            </Field>
            <Field label="Ano">{vehicle.year}</Field>
            <Field label="Cor">{vehicle.color}</Field>
          </dl>
        ) : (
          <p className="text-small text-text-secondary">O motorista ainda não cadastrou o veículo.</p>
        )}
      </section>
    </div>
  );
});
