import { memo, useState } from 'react';
import { Phone } from 'lucide-react-native';
import { InlineAlert, ListRow, theme } from '@vuumbora/ui';
import { EMERGENCY_PHONE, openEmergencyDialer } from '../../support/supportChannels';

export interface EmergencyCallRowProps {
  readonly testID?: string;
}

/**
 * "Ligar 190" (PP-11, decidida pelo dono em 22/11/2026, `docs/decisoes-do-dono.md:1023-1027`) —
 * compartilhado por P08 e P09. MESMO texto e tom da P14 (`ajuda.tsx`): o aparelho liga direto
 * para a Polícia Militar, nunca sugere que a VuumBora é avisada — "Compartilhar viagem" (S4)
 * continua fora até existir `POST /v1/trips/:id/share`. Mensagem/ligar para o MOTORISTA
 * continuam ocultos (decisão 11) — isto é só a chamada de emergência.
 */
export const EmergencyCallRow = memo(function EmergencyCallRow({ testID }: EmergencyCallRowProps) {
  const [failed, setFailed] = useState(false);

  async function handlePress() {
    setFailed(false);
    const ok = await openEmergencyDialer();
    if (!ok) setFailed(true);
  }

  return (
    <>
      <ListRow
        icon={<Phone size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
        label={`Ligar ${EMERGENCY_PHONE}`}
        value="Polícia Militar, em emergência."
        valueLines={2}
        onPress={() => void handlePress()}
        accessibilityLabel={`Ligar ${EMERGENCY_PHONE}, abre o discador`}
        {...(testID !== undefined ? { testID } : {})}
      />
      {failed ? (
        <InlineAlert tone="warning" message="Este aparelho não faz ligações." testID={testID ? `${testID}-failure` : undefined} />
      ) : null}
    </>
  );
});
