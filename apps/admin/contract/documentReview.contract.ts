/**
 * Guarda de contrato da fila de documentos (D7): o ESPELHO do painel (`src/api/documentReviewTypes.ts` e a
 * porta de `src/api/documentReview.ts`) tem de ser IGUAL ao contrato do K0 (`@vuumbora/api-client/admin`).
 *
 * Só tipos, compilado pelo `npm run typecheck` do admin (`tsconfig.contract.json`) — portanto pelo
 * `npm run check` da raiz e pelo CI. NÃO entra no bundle nem no `npm run build` da imagem Docker (que só
 * compila `src/`): o painel continua sem depender do pacote em runtime. O pacote é achado pelo link do
 * workspace (`node_modules/@vuumbora/api-client`), que o `npm ci` da raiz sempre cria.
 *
 * Igualdade ESTRITA (não só "atribuível"): campo novo no pacote, opcional virando obrigatório, `readonly`
 * a menos, estado novo num union — qualquer um quebra o typecheck aqui, com o nome do tipo na mensagem.
 */
import type * as Pkg from '@vuumbora/api-client/admin';
import type * as Panel from '../src/api/documentReviewTypes';
import type { DocumentReviewPort as PanelPort } from '../src/api/documentReview';

type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

type PkgPort = Pkg.DocumentReviewPort;
/** O `data` do caminho feliz (os dois `Result` diferem só no lado do erro, que é de cada um). */
type DataOf<F> = F extends (...args: never[]) => Promise<infer R> ? (R extends { readonly ok: true; readonly data: infer D } ? D : never) : never;

export type DocumentReviewContractChecks = [
  // Tipos de dado, um a um.
  Assert<Equals<Panel.DocumentRejection, Pkg.DocumentRejection>>,
  Assert<Equals<Panel.DriverAddress, Pkg.DriverAddress>>,
  Assert<Equals<Panel.DriverCnh, Pkg.DriverCnh>>,
  Assert<Equals<Panel.DocumentReviewQueueInput, Pkg.DocumentReviewQueueInput>>,
  Assert<Equals<Panel.DocumentReviewQueueItem, Pkg.DocumentReviewQueueItem>>,
  Assert<Equals<Panel.AdminDriverDocument, Pkg.AdminDriverDocument>>,
  Assert<Equals<Panel.AdminDriverDetail, Pkg.AdminDriverDetail>>,
  Assert<Equals<Panel.DocumentViewUrl, Pkg.DocumentViewUrl>>,
  Assert<Equals<Panel.ApproveDocumentInput, Pkg.ApproveDocumentInput>>,
  Assert<Equals<Panel.RejectDocumentInput, Pkg.RejectDocumentInput>>,
  Assert<Equals<Panel.DocumentDecision, Pkg.DocumentDecision>>,
  Assert<Equals<Panel.SuspendDriverInput, Pkg.SuspendDriverInput>>,
  Assert<Equals<Panel.DriverSuspension, Pkg.DriverSuspension>>,
  // Unions que o pacote traz do `@vuumbora/domain` (os validadores do painel listam os valores).
  Assert<Equals<Panel.DriverDocumentStatus, Pkg.DocumentReviewQueueItem['status']>>,
  Assert<Equals<Panel.DriverVerificationStatus, Pkg.AdminDriverDetail['status']>>,
  Assert<Equals<Panel.CnhCategory, Pkg.DriverCnh['category']>>,
  Assert<Equals<Panel.DocumentReviewQueuePage, DataOf<PkgPort['queue']>>>,
  // A porta: mesmos métodos, mesmos parâmetros, mesmo `data` de volta.
  Assert<Equals<keyof PanelPort, keyof PkgPort>>,
  Assert<Equals<Parameters<PanelPort['queue']>, Parameters<PkgPort['queue']>>>,
  Assert<Equals<Parameters<PanelPort['driver']>, Parameters<PkgPort['driver']>>>,
  Assert<Equals<Parameters<PanelPort['viewUrl']>, Parameters<PkgPort['viewUrl']>>>,
  Assert<Equals<Parameters<PanelPort['approve']>, Parameters<PkgPort['approve']>>>,
  Assert<Equals<Parameters<PanelPort['reject']>, Parameters<PkgPort['reject']>>>,
  Assert<Equals<Parameters<PanelPort['rejectionReasons']>, Parameters<PkgPort['rejectionReasons']>>>,
  Assert<Equals<Parameters<PanelPort['suspend']>, Parameters<PkgPort['suspend']>>>,
  Assert<Equals<DataOf<PanelPort['queue']>, DataOf<PkgPort['queue']>>>,
  Assert<Equals<DataOf<PanelPort['driver']>, DataOf<PkgPort['driver']>>>,
  Assert<Equals<DataOf<PanelPort['viewUrl']>, DataOf<PkgPort['viewUrl']>>>,
  Assert<Equals<DataOf<PanelPort['approve']>, DataOf<PkgPort['approve']>>>,
  Assert<Equals<DataOf<PanelPort['reject']>, DataOf<PkgPort['reject']>>>,
  Assert<Equals<DataOf<PanelPort['rejectionReasons']>, DataOf<PkgPort['rejectionReasons']>>>,
  Assert<Equals<DataOf<PanelPort['suspend']>, DataOf<PkgPort['suspend']>>>,
  // Papel: o mesmo vocabulário dos dois lados.
  Assert<Equals<import('../src/api/types').AdminRole, Pkg.AdminRole>>,
];
