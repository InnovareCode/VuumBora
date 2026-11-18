import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MessageCircle, Phone, Shield } from 'lucide-react-native';
import { SecondaryButton, theme } from '@vuumbora/ui';

export interface SafetyActionsRowProps {
  readonly driverName: string;
  readonly testID?: string;
}

/**
 * Ações de contato com o motorista e de segurança (P08/P09). Nenhum botão liga/envia de
 * verdade — não existe canal de telefonia/chat real (`ChatPort`/discagem) implementado
 * ainda (pendência da Vega). Por isso `onPress` fica vazio (nunca chama
 * `Linking.openURL('tel:...')` nem abre um chat real) e o `accessibilityLabel` de cada
 * botão deixa explícito que é demonstração — pra não parecer uma ligação/mensagem/SOS
 * de verdade. O aviso de "simulado" já aparece uma vez no topo da tela que usa este
 * componente (auditoria Apolo, item A6: 3 selos de mock empilhados numa tela só —
 * consolidados em um único selo por tela em vez de repetir aqui).
 */
export const SafetyActionsRow = memo(function SafetyActionsRow({ driverName, testID }: SafetyActionsRowProps) {
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.row}>
        <View style={styles.button}>
          <SecondaryButton
            label="Ligar"
            icon={<Phone size={18} color={theme.role.textPrimary} strokeWidth={1.75} />}
            onPress={() => {}}
            accessibilityLabel={`Ligar para ${driverName}, recurso de demonstração, não disca de verdade`}
            testID="call-driver-button"
          />
        </View>
        <View style={styles.button}>
          <SecondaryButton
            label="Mensagem"
            icon={<MessageCircle size={18} color={theme.role.textPrimary} strokeWidth={1.75} />}
            onPress={() => {}}
            accessibilityLabel={`Enviar mensagem para ${driverName}, recurso de demonstração, sem chat real`}
            testID="message-driver-button"
          />
        </View>
      </View>
      <SecondaryButton
        label="Compartilhar viagem / SOS"
        icon={<Shield size={18} color={theme.role.danger} strokeWidth={1.75} />}
        onPress={() => {}}
        accessibilityLabel="Compartilhar viagem ou acionar SOS, recurso de demonstração, não envia alerta real"
        testID="safety-sos-button"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: theme.spacing['2'] },
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  button: { flex: 1 },
});
