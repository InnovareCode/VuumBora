/**
 * Cenários de DESENVOLVIMENTO do cadastro de motorista (`?devCenario=` na URL, só `__DEV__`): levam o mock a cada
 * estado da M03/M04 pelos MESMOS métodos da porta que as telas usam (vínculo, etapa 2, veículo, envio) e pelo
 * `control` do mock no papel do revisor. É o que permite à ferramenta `tools/qualidade-tela` fotografar cada estado
 * sem clicar, e à revisão abrir um estado direto. Em produção `__DEV__` é falso e nada daqui roda (nem há mock: ver
 * `onboardingClient.ts`).
 *
 * Os dados de exemplo abaixo só existem para MONTAR o estado; nenhum deles aparece como "dado real" na tela (a tela
 * marca o modo simulado com `MockBadge`).
 */
import type { MockDriverOnboarding } from '@vuumbora/api-client/driver';
import { natalCalendarDate } from '@vuumbora/domain/driver';
import { resetOnboardingClient } from './onboardingClient';

export const DEV_SCENARIOS = [
  'sem-candidatura',
  'inicio',
  'veiculo',
  'faltam-docs',
  'em-analise',
  'correcao',
  'aprovado',
  'vencido',
  'suspenso',
  'erro-rede',
  'erro-servidor',
  'carregando',
] as const;

export type DevScenario = (typeof DEV_SCENARIOS)[number];

export function parseDevScenario(value: string | string[] | undefined): DevScenario | undefined {
  if (!__DEV__ || typeof value !== 'string') return undefined;
  return (DEV_SCENARIOS as readonly string[]).includes(value) ? (value as DevScenario) : undefined;
}

const SAMPLE_SHA256 = 'a'.repeat(64);

function must<T>(result: { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: unknown }, step: string): T {
  if (!result.ok) throw new Error(`cenário de desenvolvimento: "${step}" falhou (${JSON.stringify(result.error)})`);
  return result.data;
}

async function fillProfile(client: MockDriverOnboarding): Promise<void> {
  must(await client.port.linkApplication(), 'linkApplication');
  must(
    await client.port.saveOnboarding({
      cpf: '52998224725',
      birthDate: '1990-05-10',
      address: { street: 'Rua de Exemplo', number: '100', neighborhood: 'Lagoa Nova', city: 'Natal', state: 'RN', postalCode: '59075000' },
      cnh: { number: '12345678901', category: 'B', expiresOn: '2030-01-01', ear: true },
    }),
    'saveOnboarding',
  );
}

async function fillVehicle(client: MockDriverOnboarding): Promise<void> {
  must(
    await client.port.saveVehicle({ plate: 'NAT2E26', brand: 'Marca', model: 'Modelo', year: new Date().getUTCFullYear() - 2, color: 'Prata' }),
    'saveVehicle',
  );
}

/** Envia um documento pelo caminho completo (URL → envio → confirmação) e devolve o `documentId`. */
async function sendDocument(client: MockDriverOnboarding, typeCode: string): Promise<string> {
  const target = must(
    await client.port.requestUploadUrl({ typeCode, contentType: 'image/jpeg', sizeBytes: 120_000, sha256: SAMPLE_SHA256 }),
    `requestUploadUrl(${typeCode})`,
  );
  must(await client.uploader.upload(target, { uri: `blob:cenario-${typeCode}` }), `upload(${typeCode})`);
  must(await client.port.submitDocument(target.documentId), `submitDocument(${typeCode})`);
  return target.documentId;
}

async function requirementCodes(client: MockDriverOnboarding): Promise<{ readonly typeCode: string; readonly hasExpiry: boolean }[]> {
  const verification = must(await client.port.verification(), 'verification');
  return verification.requirements.map((requirement) => ({ typeCode: requirement.typeCode, hasExpiry: requirement.hasExpiry }));
}

async function sendAll(client: MockDriverOnboarding): Promise<Map<string, { readonly id: string; readonly hasExpiry: boolean }>> {
  const sent = new Map<string, { readonly id: string; readonly hasExpiry: boolean }>();
  for (const requirement of await requirementCodes(client)) {
    sent.set(requirement.typeCode, { id: await sendDocument(client, requirement.typeCode), hasExpiry: requirement.hasExpiry });
  }
  return sent;
}

function approve(client: MockDriverOnboarding, document: { readonly id: string; readonly hasExpiry: boolean }): void {
  client.control.review(document.id, document.hasExpiry ? { approve: true, expiresOn: '2028-12-31' } : { approve: true });
}

/**
 * Recomeça o cadastro simulado do zero e o leva ao `scenario`. `carregando` não chega aqui (a store segura a tela em
 * "carregando" sem chamar nada). Lança se um passo falhar — sinal de que o contrato do mock mudou.
 */
export async function applyDevScenario(scenario: Exclude<DevScenario, 'carregando'>): Promise<void> {
  // Envio instantâneo nos cenários: só montam estado. O progresso de verdade (passos de 250 ms) fica para o fluxo normal.
  const client = resetOnboardingClient({
    uploadStepDelayMs: 0,
    ...(scenario === 'sem-candidatura' ? { application: 'none' as const } : {}),
  });
  if (!client || scenario === 'sem-candidatura') return;

  if (scenario === 'inicio' || scenario === 'erro-rede' || scenario === 'erro-servidor') {
    must(await client.port.linkApplication(), 'linkApplication');
    if (scenario === 'erro-rede') client.control.failNext('network');
    if (scenario === 'erro-servidor') client.control.failNext('unavailable');
    return;
  }

  await fillProfile(client);
  if (scenario === 'veiculo') return;
  await fillVehicle(client);

  if (scenario === 'faltam-docs') {
    const codes = await requirementCodes(client);
    const [first, second] = codes;
    if (first) approve(client, { id: await sendDocument(client, first.typeCode), hasExpiry: first.hasExpiry });
    if (second) await sendDocument(client, second.typeCode);
    return;
  }

  const sent = await sendAll(client);
  if (scenario === 'em-analise') return;
  if (scenario === 'suspenso') {
    client.control.suspend();
    return;
  }

  const entries = [...sent.values()];
  if (scenario === 'correcao') {
    const [first, ...rest] = entries;
    if (first) client.control.review(first.id, { reject: 'illegible' });
    const [second] = rest;
    if (second) approve(client, second);
    return;
  }

  // `vencido`: o primeiro documento com validade é aprovado com validade ONTEM (em Natal) — a "rotina diária" do mock
  // (`sweepExpired`, roda no começo de cada chamada) o marca vencido na próxima leitura, como o servidor faria.
  const firstWithExpiry = scenario === 'vencido' ? entries.find((document) => document.hasExpiry) : undefined;
  for (const document of entries) {
    if (document === firstWithExpiry) {
      client.control.review(document.id, { approve: true, expiresOn: natalCalendarDate(Date.now() - 24 * 60 * 60 * 1000) });
    } else {
      approve(client, document);
    }
  }
}
