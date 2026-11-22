import { ADMIN_ROLES, type AdminRole } from '../../api';
import { ROLE_LABEL } from '../../lib/roleLabel';

/** `<select>` de papel, rotulado — usado ao criar usuário e ao trocar papel. Sem `roles` extra: os cinco valem nos dois lugares. */
export function RoleSelect({
  id,
  value,
  onChange,
  disabled,
  describedBy,
}: {
  readonly id: string;
  readonly value: AdminRole;
  readonly onChange: (role: AdminRole) => void;
  readonly disabled?: boolean;
  readonly describedBy?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Papel
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as AdminRole)}
        disabled={disabled}
        aria-describedby={describedBy}
        className="h-12 w-full rounded-xl border border-border bg-input px-3.5 text-body text-text outline-none transition-colors focus:border-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ADMIN_ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
    </div>
  );
}
