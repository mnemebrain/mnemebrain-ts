/**
 * Data models for the MnemeBrain TypeScript SDK.
 */

export enum TruthState {
  TRUE = "true",
  FALSE = "false",
  BOTH = "both",
  NEITHER = "neither",
}

export enum BeliefType {
  FACT = "fact",
  PREFERENCE = "preference",
  INFERENCE = "inference",
  PREDICTION = "prediction",
}

export enum Polarity {
  SUPPORTS = "supports",
  ATTACKS = "attacks",
}

/** Evidence to attach to a belief. */
export interface EvidenceInputOptions {
  sourceRef: string;
  content: string;
  polarity?: string;
  weight?: number;
  reliability?: number;
  scope?: string;
}

export class EvidenceInput {
  readonly sourceRef: string;
  readonly content: string;
  readonly polarity: string;
  readonly weight: number;
  readonly reliability: number;
  readonly scope: string | undefined;

  constructor(options: EvidenceInputOptions) {
    this.sourceRef = options.sourceRef;
    this.content = options.content;
    this.polarity = options.polarity ?? "supports";
    this.weight = options.weight ?? 0.7;
    this.reliability = options.reliability ?? 0.8;
    this.scope = options.scope;
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      source_ref: this.sourceRef,
      content: this.content,
      polarity: this.polarity,
      weight: this.weight,
      reliability: this.reliability,
    };
    if (this.scope !== undefined) {
      d.scope = this.scope;
    }
    return d;
  }
}

/** Result from believe/revise operations. */
export interface BeliefResult {
  id: string;
  truthState: string;
  confidence: number;
  conflict: boolean;
}

/** Evidence detail from explain responses. */
export interface EvidenceDetail {
  id: string;
  sourceRef: string;
  content: string;
  polarity: string;
  weight: number;
  reliability: number;
  scope?: string;
}

/** Result from explain operation. */
export interface ExplanationResult {
  claim: string;
  truthState: string;
  confidence: number;
  supporting: EvidenceDetail[];
  attacking: EvidenceDetail[];
  expired: EvidenceDetail[];
}

/** A single search hit. */
export interface SearchResult {
  beliefId: string;
  claim: string;
  truthState: string;
  confidence: number;
  similarity: number;
  rankScore: number;
}

/** Result from search operation. */
export interface SearchResponse {
  results: SearchResult[];
}

/** A belief in a list response. */
export interface BeliefListItem {
  id: string;
  claim: string;
  beliefType: string;
  truthState: string;
  confidence: number;
  tagCount: number;
  evidenceCount: number;
  createdAt: string;
  lastRevised: string;
}

/** Result from listBeliefs operation. */
export interface BeliefListResponse {
  beliefs: BeliefListItem[];
  total: number;
  offset: number;
  limit: number;
}

/** A belief snapshot in a working memory frame. */
export interface BeliefSnapshot {
  beliefId: string;
  claim: string;
  truthState: string;
  confidence: number;
  beliefType: string;
  evidenceCount: number;
  conflict: boolean;
}

/** Result from opening a working memory frame. */
export interface FrameOpenResult {
  frameId: string;
  beliefsLoaded: number;
  conflicts: number;
  snapshots: BeliefSnapshot[];
}

/** Result from getting frame context. */
export interface FrameContextResult {
  query: string;
  beliefs: BeliefSnapshot[];
  scratchpad: Record<string, unknown>;
  conflicts: BeliefSnapshot[];
  stepCount: number;
}

/** Result from committing a frame. */
export interface FrameCommitResult {
  frameId: string;
  beliefsCreated: number;
  beliefsRevised: number;
}

/** A belief retrieved by Brain.ask() -- simplified view for experiments. */
export interface RetrievedBelief {
  claim: string;
  confidence: number;
  similarity: number;
}

/** Result from Brain.ask() -- experiment-friendly query result. */
export interface AskResult {
  queryId: string;
  retrievedBeliefs: RetrievedBelief[];
}

// ---------------------------------------------------------------------------
// V4 Enums (Phase 1–4.5)
// ---------------------------------------------------------------------------

export enum SandboxStatus {
  ACTIVE = "active",
  COMMITTED = "committed",
  DISCARDED = "discarded",
  EXPIRED = "expired",
}

export enum CommitMode {
  SELECTIVE = "selective",
  ALL = "all",
  DISCARD_CONFLICTS = "discard_conflicts",
}

export enum AttackType {
  CONTRADICTS = "contradicts",
  UNDERMINES = "undermines",
  REBUTS = "rebuts",
  UNDERCUTS = "undercuts",
}

export enum GoalStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  COMPLETED = "completed",
  FAILED = "failed",
  ABANDONED = "abandoned",
}

export enum PolicyStatus {
  ACTIVE = "active",
  FLAGGED_FOR_REVISION = "flagged_for_revision",
  SUPERSEDED = "superseded",
  RETIRED = "retired",
}

// ---------------------------------------------------------------------------
// V4 Interfaces — Sandbox
// ---------------------------------------------------------------------------

export interface SandboxResult {
  id: string;
  frameId: string | null;
  scenarioLabel: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface SandboxContextResult {
  id: string;
  frameId: string | null;
  scenarioLabel: string;
  status: string;
  beliefOverrides: Record<string, unknown>;
  addedBeliefIds: string[];
  invalidatedEvidence: string[];
  createdAt: string;
  expiresAt: string | null;
}

export interface BeliefChangeDetail {
  beliefId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface SandboxDiffResult {
  beliefChanges: BeliefChangeDetail[];
  evidenceInvalidations: string[];
  newBeliefs: string[];
  temporaryAttacks: unknown[];
  goalChanges: unknown[];
  summary: string;
}

export interface SandboxCommitResult {
  sandboxId: string;
  committedBeliefIds: string[];
  conflicts: string[];
}

export interface SandboxExplainResult {
  beliefId: string;
  sandboxId: string;
  resolvedTruthState: string;
  hasOverride: boolean;
  overrideFields: string[];
  invalidatedEvidenceIds: string[];
  source: string;
}

// ---------------------------------------------------------------------------
// V4 Interfaces — Revision
// ---------------------------------------------------------------------------

export interface RevisionPolicyResult {
  policyName: string;
  maxRetractionDepth: number;
  maxRetractions: number;
}

export interface RevisionAuditEntry {
  id: string;
  timestamp: string;
  incomingBeliefId: string;
  policyName: string;
  revisionDepth: number;
  bounded: boolean;
  agentId: string;
}

export interface RevisionEvidenceItemOptions {
  sourceRef?: string;
  content?: string;
  polarity?: string;
  weight?: number;
  reliability?: number;
  id?: string;
}

export interface RevisionResult {
  supersededEvidenceIds: string[];
  retractedBeliefIds: string[];
  revisionDepth: number;
  policyName: string;
  bounded: boolean;
}

// ---------------------------------------------------------------------------
// V4 Interfaces — Attacks
// ---------------------------------------------------------------------------

export interface AttackEdgeResult {
  id: string;
  sourceBeliefId: string;
  targetBeliefId: string;
  attackType: string;
  weight: number;
  active: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// V4 Interfaces — Reconsolidation
// ---------------------------------------------------------------------------

export interface ReconsolidationQueueResult {
  queueSize: number;
}

export interface ReconsolidationRunResult {
  processed: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// V4 Interfaces — Goals
// ---------------------------------------------------------------------------

export interface GoalResult {
  id: string;
  goal: string;
  owner: string;
  priority: number;
  status: string;
  createdAt: string;
  deadline: string | null;
  successCriteria: Record<string, unknown>;
}

export interface GoalEvaluationResult {
  goalId: string;
  status: string;
  completionFraction: number;
  blockingBeliefIds: string[];
  supportingBeliefIds: string[];
}

// ---------------------------------------------------------------------------
// V4 Interfaces — Policy
// ---------------------------------------------------------------------------

export interface PolicyStepResult {
  stepId: number;
  action: string;
  tool: string | null;
  conditions: string[];
  fallback: string | null;
}

export interface PolicyResult {
  id: string;
  name: string;
  description: string;
  version: number;
  reliability: number;
  status: string;
  createdAt: string;
  lastUpdated: string;
  supersededBy: string | null;
  steps: PolicyStepResult[];
  applicability: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Phase 5 Interfaces — Consolidation, Memory Tiers, HippoRAG
// ---------------------------------------------------------------------------

/** Result from a consolidation cycle. */
export interface ConsolidateResult {
  semanticBeliefsCreated: number;
  episodicsPruned: number;
  clustersFound: number;
}

/** Memory tier metadata for a belief. */
export interface MemoryTierResult {
  beliefId: string;
  memoryTier: string;
  consolidatedFromCount: number;
}

/** A single multi-hop retrieval hit. */
export interface MultihopResultItem {
  beliefId: string;
  claim: string;
  confidence: number;
  truthState: string;
}

/** Result from HippoRAG multi-hop retrieval. */
export interface MultihopResponse {
  results: MultihopResultItem[];
}

// ---------------------------------------------------------------------------
// Benchmark Interfaces
// ---------------------------------------------------------------------------

/** Result from benchmark sandbox operations. */
export interface BenchmarkSandboxResult {
  sandboxId: string;
  resolvedTruthState: string;
  canonicalUnchanged: boolean;
}

/** Result from benchmark attack operations. */
export interface BenchmarkAttackResult {
  edgeId: string;
  attackerId: string;
  targetId: string;
}
