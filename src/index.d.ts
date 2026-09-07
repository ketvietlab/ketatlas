export interface Viewport {
  width: number;
  height: number;
}
export interface AtlasScreen {
  id: string;
  title: string;
  url: string;
  viewport?: Viewport;
  description?: string;
  badge?: string;
}
export interface AtlasNode {
  id: string;
  screen?: string;
  type?: "screen" | "note" | "external";
  title?: string;
  description?: string;
  url?: string;
  column?: number;
  row?: number;
}
export interface AtlasEdge {
  from: string;
  to: string;
  label: string;
  kind?: "primary" | "conditional" | "recovery";
}
export interface AtlasFlow {
  id: string;
  title: string;
  group?: string;
  description?: string;
  start?: string;
  ends?: string[];
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}
export interface AtlasConfig {
  $schema?: string;
  version: 1;
  title: string;
  description?: string;
  viewport?: Viewport;
  screens?: AtlasScreen[];
  flows: AtlasFlow[];
}
export type ProgressStatus =
  | "unassessed"
  | "planned"
  | "in_progress"
  | "in_review"
  | "implemented"
  | "verified";
export interface ProgressEvidence {
  id: string;
  kind: "pr" | "test" | "release" | "reference";
  title: string;
  url: string;
  state?: string;
  revision?: string;
  environment?: string;
  observedAt?: string;
}
export interface ProgressCheck {
  id: string;
  title: string;
  done: boolean;
  evidenceIds?: string[];
  nodes?: { flowId: string; nodeId: string }[];
}
export interface ScreenProgress {
  status: ProgressStatus;
  owner?: string;
  summary?: string;
  blocker?: string;
  updatedAt?: string;
  tasks?: string[];
  checks?: ProgressCheck[];
  evidence?: ProgressEvidence[];
}
export interface AtlasProgress {
  version: 1;
  screens: Record<string, ScreenProgress>;
}
export interface ProgressSnapshot {
  data: AtlasProgress;
  revision: string;
}
export const progressStatuses: Record<ProgressStatus, string>;
export function validateProgress(
  data: unknown,
  atlas: AtlasConfig,
): { valid: boolean; errors: ValidationIssue[] };
export function summarizeProgress(
  data: AtlasProgress,
  screens: AtlasScreen[],
): { total: number; counts: Record<ProgressStatus, number>; blocked: number };
export interface AtlasOptions {
  /** Optional progress for createAtlas or to override loadAtlas sidecar discovery. */
  progress?: AtlasProgress;
  /** Override the default <atlas-name>.progress.json URL for loadAtlas. */
  progressURL?: string;
  progressRevision?: string;
  /** Host persistence adapters; only provided by the local CLI by default. */
  saveProgress?: (
    screenId: string,
    record: ScreenProgress,
    revision: string,
  ) => Promise<ProgressSnapshot>;
  reloadProgress?: () => Promise<ProgressSnapshot>;
  /** Local CLI editor endpoint and per-server write capability. */
  progressEndpoint?: string;
  progressToken?: string;
  /** Relative screen URLs resolve against this URL. loadAtlas uses the JSON URL by default. */
  baseURL?: string;
  /** Public directory containing styles/ and assets/, ending in /. Needed when bundling the JS. */
  assetBaseURL?: string;
  initialFlow?: string;
  theme?: "light" | "dark";
  /** Opt in only for one viewer per page; preserves unrelated URL parameters. */
  syncUrl?: boolean;
  maxPreviews?: number;
  previewThreshold?: number;
  /** Defaults to "allow-scripts allow-forms". Only add permissions for trusted content. */
  sandbox?: string;
  signal?: AbortSignal;
}
export interface AtlasState {
  flowId: string;
  selectedNodeId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  flowCount: number;
  nodeCount: number;
  screenCount: number;
  destroyed: boolean;
}
export interface AtlasInstance {
  element: HTMLDivElement;
  ready: Promise<void>;
  goToFlow(id: string): void;
  focusNode(flowId: string, nodeId: string): void;
  openNode(flowId: string, nodeId: string): void;
  fit(): void;
  zoomTo(value: number): void;
  getState(): AtlasState;
  destroy(): void;
}
export interface ValidationIssue {
  path: string;
  message: string;
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
export class AtlasValidationError extends Error {
  errors: ValidationIssue[];
}
export function validateAtlas(input: unknown): ValidationResult;
export function createAtlas(
  container: HTMLElement,
  config: AtlasConfig,
  options?: AtlasOptions,
): AtlasInstance;
export function loadAtlas(
  container: HTMLElement,
  url: string | URL,
  options?: AtlasOptions,
): Promise<AtlasInstance>;
