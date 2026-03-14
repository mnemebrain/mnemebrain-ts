/**
 * HTTP client for the MnemeBrain REST API.
 */

import { randomUUID } from "node:crypto";
import type {
  AttackEdgeResult,
  BeliefChangeDetail,
  BeliefListItem,
  BeliefListResponse,
  BeliefResult,
  BeliefSnapshot,
  BenchmarkAttackResult,
  BenchmarkSandboxResult,
  ConsolidateResult,
  EvidenceDetail,
  ExplanationResult,
  FrameCommitResult,
  FrameContextResult,
  FrameOpenResult,
  GoalEvaluationResult,
  GoalResult,
  MemoryTierResult,
  MultihopResponse,
  MultihopResultItem,
  PolicyResult,
  ReconsolidationQueueResult,
  ReconsolidationRunResult,
  RetrievedBelief,
  RevisionAuditEntry,
  RevisionEvidenceItemOptions,
  RevisionPolicyResult,
  RevisionResult,
  SandboxCommitResult,
  SandboxContextResult,
  SandboxDiffResult,
  SandboxExplainResult,
  SandboxResult,
  SearchResponse,
  SearchResult,
  AskResult,
} from "./models.js";
import { EvidenceInput } from "./models.js";

const DEFAULT_BASE_URL = "http://localhost:8000";

interface RequestOptions {
  method?: string;
  path: string;
  params?: Record<string, string | number>;
  body?: unknown;
}

export class MnemeBrainClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private _sandbox?: SandboxSubClient;
  private _revision?: RevisionSubClient;
  private _attacks?: AttackSubClient;
  private _reconsolidation?: ReconsolidationSubClient;
  private _goals?: GoalSubClient;
  private _policies?: PolicySubClient;

  constructor(baseUrl: string = DEFAULT_BASE_URL, timeout: number = 30_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeout = timeout;
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const { method = "GET", path, params, body } = options;
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {};
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeout),
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), init);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new MnemeBrainError(
        `HTTP ${response.status}: ${response.statusText}${text ? ` - ${text}` : ""}`,
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  async health(): Promise<Record<string, unknown>> {
    return this.request({ path: "/health" });
  }

  async believe(
    claim: string,
    evidence: EvidenceInput[],
    beliefType: string = "inference",
    tags: string[] = [],
    sourceAgent: string = "",
  ): Promise<BeliefResult> {
    const data = await this.request<{
      id: string;
      truth_state: string;
      confidence: number;
      conflict: boolean;
    }>({
      method: "POST",
      path: "/believe",
      body: {
        claim,
        evidence: evidence.map((e) => e.toDict()),
        belief_type: beliefType,
        tags,
        source_agent: sourceAgent,
      },
    });
    return {
      id: data.id,
      truthState: data.truth_state,
      confidence: data.confidence,
      conflict: data.conflict,
    };
  }

  async explain(claim: string): Promise<ExplanationResult | null> {
    try {
      const data = await this.request<{
        claim: string;
        truth_state: string;
        confidence: number;
        supporting: Array<{
          id: string;
          source_ref: string;
          content: string;
          polarity: string;
          weight: number;
          reliability: number;
          scope?: string;
        }>;
        attacking: Array<{
          id: string;
          source_ref: string;
          content: string;
          polarity: string;
          weight: number;
          reliability: number;
          scope?: string;
        }>;
        expired: Array<{
          id: string;
          source_ref: string;
          content: string;
          polarity: string;
          weight: number;
          reliability: number;
          scope?: string;
        }>;
      }>({
        path: "/explain",
        params: { claim },
      });

      const parseEvidence = (
        items: Array<{
          id: string;
          source_ref: string;
          content: string;
          polarity: string;
          weight: number;
          reliability: number;
          scope?: string;
        }>,
      ): EvidenceDetail[] =>
        items.map((e) => ({
          id: e.id,
          sourceRef: e.source_ref,
          content: e.content,
          polarity: e.polarity,
          weight: e.weight,
          reliability: e.reliability,
          scope: e.scope,
        }));

      return {
        claim: data.claim,
        truthState: data.truth_state,
        confidence: data.confidence,
        supporting: parseEvidence(data.supporting),
        attacking: parseEvidence(data.attacking),
        expired: parseEvidence(data.expired),
      };
    } catch (error) {
      if (error instanceof MnemeBrainError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async search(
    query: string,
    limit: number = 10,
    alpha: number = 0.7,
    conflictPolicy: string = "surface",
  ): Promise<SearchResponse> {
    const data = await this.request<{
      results: Array<{
        belief_id: string;
        claim: string;
        truth_state: string;
        confidence: number;
        similarity: number;
        rank_score: number;
      }>;
    }>({
      path: "/search",
      params: { query, limit, alpha, conflict_policy: conflictPolicy },
    });
    return {
      results: data.results.map(
        (r): SearchResult => ({
          beliefId: r.belief_id,
          claim: r.claim,
          truthState: r.truth_state,
          confidence: r.confidence,
          similarity: r.similarity,
          rankScore: r.rank_score,
        }),
      ),
    };
  }

  async retract(evidenceId: string): Promise<BeliefResult[]> {
    const data = await this.request<
      Array<{
        id: string;
        truth_state: string;
        confidence: number;
        conflict: boolean;
      }>
    >({
      method: "POST",
      path: "/retract",
      body: { evidence_id: evidenceId },
    });
    return data.map((r) => ({
      id: r.id,
      truthState: r.truth_state,
      confidence: r.confidence,
      conflict: r.conflict,
    }));
  }

  async revise(
    beliefId: string,
    evidence: EvidenceInput,
  ): Promise<BeliefResult> {
    const data = await this.request<{
      id: string;
      truth_state: string;
      confidence: number;
      conflict: boolean;
    }>({
      method: "POST",
      path: "/revise",
      body: {
        belief_id: beliefId,
        evidence: evidence.toDict(),
      },
    });
    return {
      id: data.id,
      truthState: data.truth_state,
      confidence: data.confidence,
      conflict: data.conflict,
    };
  }

  async listBeliefs(options: {
    truthState?: string;
    beliefType?: string;
    tag?: string;
    minConfidence?: number;
    maxConfidence?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<BeliefListResponse> {
    const params: Record<string, string | number> = {
      min_confidence: options.minConfidence ?? 0.0,
      max_confidence: options.maxConfidence ?? 1.0,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    };
    if (options.truthState !== undefined) params.truth_state = options.truthState;
    if (options.beliefType !== undefined) params.belief_type = options.beliefType;
    if (options.tag !== undefined) params.tag = options.tag;

    const data = await this.request<{
      beliefs: Array<{
        id: string;
        claim: string;
        belief_type: string;
        truth_state: string;
        confidence: number;
        tag_count: number;
        evidence_count: number;
        created_at: string;
        last_revised: string;
      }>;
      total: number;
      offset: number;
      limit: number;
    }>({
      path: "/beliefs",
      params,
    });

    return {
      beliefs: data.beliefs.map(
        (b): BeliefListItem => ({
          id: b.id,
          claim: b.claim,
          beliefType: b.belief_type,
          truthState: b.truth_state,
          confidence: b.confidence,
          tagCount: b.tag_count,
          evidenceCount: b.evidence_count,
          createdAt: b.created_at,
          lastRevised: b.last_revised,
        }),
      ),
      total: data.total,
      offset: data.offset,
      limit: data.limit,
    };
  }

  // -- Working Memory Frame endpoints --

  private parseSnapshot(s: {
    belief_id: string;
    claim: string;
    truth_state: string;
    confidence: number;
    belief_type: string;
    evidence_count: number;
    conflict: boolean;
  }): BeliefSnapshot {
    return {
      beliefId: s.belief_id,
      claim: s.claim,
      truthState: s.truth_state,
      confidence: s.confidence,
      beliefType: s.belief_type,
      evidenceCount: s.evidence_count,
      conflict: s.conflict,
    };
  }

  async frameOpen(
    query: string,
    preloadClaims: string[] = [],
    ttlSeconds: number = 300,
    sourceAgent: string = "",
  ): Promise<FrameOpenResult> {
    const data = await this.request<{
      frame_id: string;
      beliefs_loaded: number;
      conflicts: number;
      snapshots: Array<{
        belief_id: string;
        claim: string;
        truth_state: string;
        confidence: number;
        belief_type: string;
        evidence_count: number;
        conflict: boolean;
      }>;
    }>({
      method: "POST",
      path: "/frame/open",
      body: {
        query,
        preload_claims: preloadClaims,
        ttl_seconds: ttlSeconds,
        source_agent: sourceAgent,
      },
    });
    return {
      frameId: data.frame_id,
      beliefsLoaded: data.beliefs_loaded,
      conflicts: data.conflicts,
      snapshots: data.snapshots.map((s) => this.parseSnapshot(s)),
    };
  }

  async frameAdd(frameId: string, claim: string): Promise<BeliefSnapshot> {
    const data = await this.request<{
      belief_id: string;
      claim: string;
      truth_state: string;
      confidence: number;
      belief_type: string;
      evidence_count: number;
      conflict: boolean;
    }>({
      method: "POST",
      path: `/frame/${frameId}/add`,
      body: { claim },
    });
    return this.parseSnapshot(data);
  }

  async frameScratchpad(
    frameId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    await this.request<undefined>({
      method: "POST",
      path: `/frame/${frameId}/scratchpad`,
      body: { key, value },
    });
  }

  async frameContext(frameId: string): Promise<FrameContextResult> {
    const data = await this.request<{
      query: string;
      beliefs: Array<{
        belief_id: string;
        claim: string;
        truth_state: string;
        confidence: number;
        belief_type: string;
        evidence_count: number;
        conflict: boolean;
      }>;
      scratchpad: Record<string, unknown>;
      conflicts: Array<{
        belief_id: string;
        claim: string;
        truth_state: string;
        confidence: number;
        belief_type: string;
        evidence_count: number;
        conflict: boolean;
      }>;
      step_count: number;
    }>({
      path: `/frame/${frameId}/context`,
    });
    return {
      query: data.query,
      beliefs: data.beliefs.map((s) => this.parseSnapshot(s)),
      scratchpad: data.scratchpad,
      conflicts: data.conflicts.map((s) => this.parseSnapshot(s)),
      stepCount: data.step_count,
    };
  }

  async frameCommit(
    frameId: string,
    newBeliefs: Record<string, unknown>[] = [],
    revisions: Record<string, unknown>[] = [],
  ): Promise<FrameCommitResult> {
    const data = await this.request<{
      frame_id: string;
      beliefs_created: number;
      beliefs_revised: number;
    }>({
      method: "POST",
      path: `/frame/${frameId}/commit`,
      body: {
        new_beliefs: newBeliefs,
        revisions,
      },
    });
    return {
      frameId: data.frame_id,
      beliefsCreated: data.beliefs_created,
      beliefsRevised: data.beliefs_revised,
    };
  }

  async frameClose(frameId: string): Promise<void> {
    await this.request<undefined>({
      method: "DELETE",
      path: `/frame/${frameId}`,
    });
  }

  // -- Phase 5: Consolidation, Memory Tiers, HippoRAG --

  /** Clear all server state and reinitialise. */
  async reset(): Promise<void> {
    await this.request<undefined>({
      method: "POST",
      path: "/reset",
    });
  }

  /** Backdate evidence timestamps by `days` for decay tests. */
  async setTimeOffset(days: number): Promise<void> {
    await this.request<undefined>({
      method: "POST",
      path: "/debug/set_time_offset",
      body: { days },
    });
  }

  /** Run one consolidation cycle. */
  async consolidate(): Promise<ConsolidateResult> {
    const data = await this.request<{
      semantic_beliefs_created: number;
      episodics_pruned: number;
      clusters_found: number;
    }>({
      method: "POST",
      path: "/consolidate",
    });
    return {
      semanticBeliefsCreated: data.semantic_beliefs_created,
      episodicsPruned: data.episodics_pruned,
      clustersFound: data.clusters_found,
    };
  }

  /** Return memory-tier metadata for a belief. */
  async getMemoryTier(beliefId: string): Promise<MemoryTierResult> {
    const encodedId = beliefId.replace(/#/g, "%23");
    const data = await this.request<{
      belief_id: string;
      memory_tier: string;
      consolidated_from_count: number;
    }>({
      path: `/memory_tier/${encodedId}`,
    });
    return {
      beliefId: data.belief_id,
      memoryTier: data.memory_tier,
      consolidatedFromCount: data.consolidated_from_count,
    };
  }

  /** HippoRAG multi-hop retrieval. */
  async queryMultihop(query: string): Promise<MultihopResponse> {
    const data = await this.request<{
      results: Array<{
        belief_id: string;
        claim: string;
        confidence: number;
        truth_state: string;
      }>;
    }>({
      method: "POST",
      path: "/query_multihop",
      body: { query },
    });
    return {
      results: data.results.map(
        (r): MultihopResultItem => ({
          beliefId: r.belief_id,
          claim: r.claim,
          confidence: r.confidence,
          truthState: r.truth_state,
        }),
      ),
    };
  }

  // -- Benchmark endpoints --

  /** Fork a benchmark sandbox. */
  async benchmarkSandboxFork(scenarioLabel: string = ""): Promise<BenchmarkSandboxResult> {
    const data = await this.request<{
      sandbox_id: string;
      resolved_truth_state: string;
      canonical_unchanged: boolean;
    }>({
      method: "POST",
      path: "/benchmark/sandbox/fork",
      body: { scenario_label: scenarioLabel },
    });
    return {
      sandboxId: data.sandbox_id,
      resolvedTruthState: data.resolved_truth_state,
      canonicalUnchanged: data.canonical_unchanged,
    };
  }

  /** Override a belief's truth state in a benchmark sandbox. */
  async benchmarkSandboxAssume(
    sandboxId: string,
    beliefId: string,
    truthState: string,
  ): Promise<BenchmarkSandboxResult> {
    const data = await this.request<{
      sandbox_id: string;
      resolved_truth_state: string;
      canonical_unchanged: boolean;
    }>({
      method: "POST",
      path: `/benchmark/sandbox/${sandboxId}/assume`,
      body: { belief_id: beliefId, truth_state: truthState },
    });
    return {
      sandboxId: data.sandbox_id,
      resolvedTruthState: data.resolved_truth_state,
      canonicalUnchanged: data.canonical_unchanged,
    };
  }

  /** Resolve a belief in a benchmark sandbox. */
  async benchmarkSandboxResolve(
    sandboxId: string,
    beliefId: string,
  ): Promise<BenchmarkSandboxResult> {
    const encodedId = beliefId.replace(/#/g, "%23");
    const data = await this.request<{
      sandbox_id: string;
      resolved_truth_state: string;
      canonical_unchanged: boolean;
    }>({
      path: `/benchmark/sandbox/${sandboxId}/resolve/${encodedId}`,
    });
    return {
      sandboxId: data.sandbox_id,
      resolvedTruthState: data.resolved_truth_state,
      canonicalUnchanged: data.canonical_unchanged,
    };
  }

  /** Discard a benchmark sandbox. */
  async benchmarkSandboxDiscard(sandboxId: string): Promise<void> {
    await this.request<undefined>({
      method: "DELETE",
      path: `/benchmark/sandbox/${sandboxId}`,
    });
  }

  /** Create a benchmark attack edge. */
  async benchmarkAttack(
    attackerId: string,
    targetId: string,
    attackType: string = "undermining",
    weight: number = 0.5,
  ): Promise<BenchmarkAttackResult> {
    const data = await this.request<{
      edge_id: string;
      attacker_id: string;
      target_id: string;
    }>({
      method: "POST",
      path: "/benchmark/attack",
      body: {
        attacker_id: attackerId,
        target_id: targetId,
        attack_type: attackType,
        weight,
      },
    });
    return {
      edgeId: data.edge_id,
      attackerId: data.attacker_id,
      targetId: data.target_id,
    };
  }

  /** @internal — exposes the HTTP transport to sub-clients. */
  _request<T>(options: RequestOptions): Promise<T> {
    return this.request(options);
  }

  get sandbox(): SandboxSubClient {
    this._sandbox ??= new SandboxSubClient(this._request.bind(this));
    return this._sandbox;
  }

  get revision(): RevisionSubClient {
    this._revision ??= new RevisionSubClient(this._request.bind(this));
    return this._revision;
  }

  get attacks(): AttackSubClient {
    this._attacks ??= new AttackSubClient(this._request.bind(this));
    return this._attacks;
  }

  get reconsolidation(): ReconsolidationSubClient {
    this._reconsolidation ??= new ReconsolidationSubClient(this._request.bind(this));
    return this._reconsolidation;
  }

  get goals(): GoalSubClient {
    this._goals ??= new GoalSubClient(this._request.bind(this));
    return this._goals;
  }

  get policies(): PolicySubClient {
    this._policies ??= new PolicySubClient(this._request.bind(this));
    return this._policies;
  }
}

export class MnemeBrainError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MnemeBrainError";
  }
}

// ---------------------------------------------------------------------------
// V4 Sub-Clients
// ---------------------------------------------------------------------------

const V4_PREFIX = "/api/mneme";

type RequestFn = MnemeBrainClient["_request"];

function parseSandbox(d: Record<string, unknown>): SandboxResult {
  return {
    id: d.id as string,
    frameId: (d.frame_id as string | undefined) ?? null,
    scenarioLabel: d.scenario_label as string,
    status: d.status as string,
    createdAt: d.created_at as string,
    expiresAt: (d.expires_at as string | undefined) ?? null,
  };
}

function parseAttackEdge(d: Record<string, unknown>): AttackEdgeResult {
  return {
    id: d.id as string,
    sourceBeliefId: d.source_belief_id as string,
    targetBeliefId: d.target_belief_id as string,
    attackType: d.attack_type as string,
    weight: d.weight as number,
    active: d.active as boolean,
    createdAt: d.created_at as string,
  };
}

function parseGoal(d: Record<string, unknown>): GoalResult {
  return {
    id: d.id as string,
    goal: d.goal as string,
    owner: d.owner as string,
    priority: d.priority as number,
    status: d.status as string,
    createdAt: d.created_at as string,
    deadline: (d.deadline as string | undefined) ?? null,
    successCriteria: (d.success_criteria as Record<string, unknown> | undefined) ?? {},
  };
}

function parseGoalEvaluation(d: Record<string, unknown>): GoalEvaluationResult {
  return {
    goalId: d.goal_id as string,
    status: d.status as string,
    completionFraction: d.completion_fraction as number,
    blockingBeliefIds: d.blocking_belief_ids as string[],
    supportingBeliefIds: d.supporting_belief_ids as string[],
  };
}

function parsePolicy(d: Record<string, unknown>): PolicyResult {
  return {
    id: d.id as string,
    name: d.name as string,
    description: d.description as string,
    version: d.version as number,
    reliability: d.reliability as number,
    status: d.status as string,
    createdAt: d.created_at as string,
    lastUpdated: d.last_updated as string,
    supersededBy: (d.superseded_by as string | undefined) ?? null,
    steps: ((d.steps as Array<Record<string, unknown>> | undefined) ?? []).map((s) => ({
      stepId: s.step_id as number,
      action: s.action as string,
      tool: (s.tool as string | undefined) ?? null,
      conditions: (s.conditions as string[] | undefined) ?? [],
      fallback: (s.fallback as string | undefined) ?? null,
    })),
    applicability: (d.applicability as Record<string, unknown> | undefined) ?? {},
  };
}

export class SandboxSubClient {
  constructor(private readonly req: RequestFn) {}

  async fork(options: {
    frameId?: string;
    scenarioLabel?: string;
    ttlSeconds?: number;
  } = {}): Promise<SandboxResult> {
    const body: Record<string, unknown> = {
      scenario_label: options.scenarioLabel ?? "",
      ttl_seconds: options.ttlSeconds ?? 600,
    };
    if (options.frameId !== undefined) body.frame_id = options.frameId;
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/fork`,
      body,
    });
    return parseSandbox(d);
  }

  async quick(frameId?: string): Promise<SandboxResult> {
    const body: Record<string, unknown> = {};
    if (frameId !== undefined) body.frame_id = frameId;
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/quick`,
      body,
    });
    return parseSandbox(d);
  }

  async getContext(sandboxId: string): Promise<SandboxContextResult> {
    const d = await this.req<Record<string, unknown>>({
      path: `${V4_PREFIX}/sandbox/${sandboxId}/context`,
    });
    return {
      id: d.id as string,
      frameId: (d.frame_id as string | undefined) ?? null,
      scenarioLabel: d.scenario_label as string,
      status: d.status as string,
      beliefOverrides: d.belief_overrides as Record<string, unknown>,
      addedBeliefIds: d.added_belief_ids as string[],
      invalidatedEvidence: d.invalidated_evidence as string[],
      createdAt: d.created_at as string,
      expiresAt: (d.expires_at as string | undefined) ?? null,
    };
  }

  async assume(sandboxId: string, beliefId: string, truthState: string): Promise<void> {
    await this.req<undefined>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/${sandboxId}/assume`,
      body: { belief_id: beliefId, truth_state: truthState },
    });
  }

  async retract(sandboxId: string, evidenceId: string): Promise<void> {
    await this.req<undefined>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/${sandboxId}/retract`,
      body: { evidence_id: evidenceId },
    });
  }

  async believe(sandboxId: string, claim: string, beliefType = "fact"): Promise<{ beliefId: string }> {
    const d = await this.req<{ belief_id: string }>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/${sandboxId}/believe`,
      body: { claim, belief_type: beliefType },
    });
    return { beliefId: d.belief_id };
  }

  async revise(sandboxId: string, options: {
    beliefId: string;
    sourceRef?: string;
    content?: string;
    polarity?: string;
    weight?: number;
    reliability?: number;
  }): Promise<void> {
    await this.req<undefined>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/${sandboxId}/revise`,
      body: {
        belief_id: options.beliefId,
        source_ref: options.sourceRef ?? "",
        content: options.content ?? "",
        polarity: options.polarity ?? "supports",
        weight: options.weight ?? 0.8,
        reliability: options.reliability ?? 0.7,
      },
    });
  }

  async attack(
    sandboxId: string,
    attackerBeliefId: string,
    targetBeliefId: string,
    attackType: string,
    weight = 0.5,
  ): Promise<{ attackEdgeId: string }> {
    const d = await this.req<{ attack_edge_id: string }>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/${sandboxId}/attack`,
      body: {
        attacker_belief_id: attackerBeliefId,
        target_belief_id: targetBeliefId,
        attack_type: attackType,
        weight,
      },
    });
    return { attackEdgeId: d.attack_edge_id };
  }

  async diff(sandboxId: string): Promise<SandboxDiffResult> {
    const d = await this.req<Record<string, unknown>>({
      path: `${V4_PREFIX}/sandbox/${sandboxId}/diff`,
    });
    return {
      beliefChanges: (d.belief_changes as Array<Record<string, unknown>>).map(
        (c): BeliefChangeDetail => ({
          beliefId: c.belief_id as string,
          field: c.field as string,
          oldValue: c.old_value,
          newValue: c.new_value,
        }),
      ),
      evidenceInvalidations: d.evidence_invalidations as string[],
      newBeliefs: d.new_beliefs as string[],
      temporaryAttacks: d.temporary_attacks as unknown[],
      goalChanges: d.goal_changes as unknown[],
      summary: d.summary as string,
    };
  }

  async commit(sandboxId: string, commitMode = "selective", selectedIds?: string[]): Promise<SandboxCommitResult> {
    const body: Record<string, unknown> = { commit_mode: commitMode };
    if (selectedIds !== undefined) body.selected_ids = selectedIds;
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/${sandboxId}/commit`,
      body,
    });
    return {
      sandboxId: d.sandbox_id as string,
      committedBeliefIds: d.committed_belief_ids as string[],
      conflicts: d.conflicts as string[],
    };
  }

  async discard(sandboxId: string): Promise<void> {
    await this.req<undefined>({
      method: "DELETE",
      path: `${V4_PREFIX}/sandbox/${sandboxId}`,
    });
  }

  async explain(sandboxId: string, beliefId: string): Promise<SandboxExplainResult> {
    const d = await this.req<Record<string, unknown>>({
      path: `${V4_PREFIX}/sandbox/${sandboxId}/explain/${beliefId}`,
    });
    return {
      beliefId: d.belief_id as string,
      sandboxId: d.sandbox_id as string,
      resolvedTruthState: d.resolved_truth_state as string,
      hasOverride: d.has_override as boolean,
      overrideFields: d.override_fields as string[],
      invalidatedEvidenceIds: d.invalidated_evidence_ids as string[],
      source: d.source as string,
    };
  }

  async evaluateGoal(sandboxId: string, goalId: string): Promise<GoalEvaluationResult> {
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/sandbox/${sandboxId}/goal/${goalId}/evaluate`,
    });
    return parseGoalEvaluation(d);
  }
}

export class RevisionSubClient {
  constructor(private readonly req: RequestFn) {}

  async setPolicy(
    policyName: string,
    options: { maxRetractionDepth?: number; maxRetractions?: number } = {},
  ): Promise<RevisionPolicyResult> {
    const body: Record<string, unknown> = { policy_name: policyName };
    if (options.maxRetractionDepth !== undefined) body.max_retraction_depth = options.maxRetractionDepth;
    if (options.maxRetractions !== undefined) body.max_retractions = options.maxRetractions;
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/revision/policy`,
      body,
    });
    return {
      policyName: d.policy_name as string,
      maxRetractionDepth: d.max_retraction_depth as number,
      maxRetractions: d.max_retractions as number,
    };
  }

  async getPolicy(): Promise<RevisionPolicyResult> {
    const d = await this.req<Record<string, unknown>>({
      path: `${V4_PREFIX}/revision/policy`,
    });
    return {
      policyName: d.policy_name as string,
      maxRetractionDepth: d.max_retraction_depth as number,
      maxRetractions: d.max_retractions as number,
    };
  }

  async listAudit(): Promise<RevisionAuditEntry[]> {
    const data = await this.req<Array<Record<string, unknown>>>({
      path: `${V4_PREFIX}/revision/audit`,
    });
    return data.map((e): RevisionAuditEntry => ({
      id: e.id as string,
      timestamp: e.timestamp as string,
      incomingBeliefId: e.incoming_belief_id as string,
      policyName: e.policy_name as string,
      revisionDepth: e.revision_depth as number,
      bounded: e.bounded as boolean,
      agentId: e.agent_id as string,
    }));
  }

  async revise(
    incomingBeliefId: string,
    options: {
      conflictingEvidence?: RevisionEvidenceItemOptions[];
      incomingEvidence?: RevisionEvidenceItemOptions[];
      agentId?: string;
    } = {},
  ): Promise<RevisionResult> {
    const toWire = (items: RevisionEvidenceItemOptions[]) =>
      items.map((e) => ({
        source_ref: e.sourceRef ?? "",
        content: e.content ?? "",
        polarity: e.polarity ?? "supports",
        weight: e.weight ?? 0.8,
        reliability: e.reliability ?? 0.7,
        ...(e.id !== undefined ? { id: e.id } : {}),
      }));
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/revise`,
      body: {
        incoming_belief_id: incomingBeliefId,
        conflicting_evidence: toWire(options.conflictingEvidence ?? []),
        incoming_evidence: toWire(options.incomingEvidence ?? []),
        agent_id: options.agentId ?? "",
      },
    });
    return {
      supersededEvidenceIds: d.superseded_evidence_ids as string[],
      retractedBeliefIds: d.retracted_belief_ids as string[],
      revisionDepth: d.revision_depth as number,
      policyName: d.policy_name as string,
      bounded: d.bounded as boolean,
    };
  }
}

export class AttackSubClient {
  constructor(private readonly req: RequestFn) {}

  async create(
    beliefId: string,
    targetBeliefId: string,
    attackType: string,
    weight: number,
  ): Promise<AttackEdgeResult> {
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/beliefs/${beliefId}/attacks`,
      body: { target_belief_id: targetBeliefId, attack_type: attackType, weight },
    });
    return parseAttackEdge(d);
  }

  async list(beliefId: string): Promise<AttackEdgeResult[]> {
    const data = await this.req<Array<Record<string, unknown>>>({
      path: `${V4_PREFIX}/beliefs/${beliefId}/attacks`,
    });
    return data.map(parseAttackEdge);
  }

  async getChain(beliefId: string, maxDepth = 2): Promise<AttackEdgeResult[][]> {
    const d = await this.req<{ chains: Array<Array<Record<string, unknown>>> }>({
      path: `${V4_PREFIX}/beliefs/${beliefId}/attack-chain`,
      params: { max_depth: maxDepth },
    });
    return d.chains.map((chain) => chain.map(parseAttackEdge));
  }

  async deactivate(edgeId: string): Promise<void> {
    await this.req<undefined>({
      method: "DELETE",
      path: `${V4_PREFIX}/attacks/${edgeId}`,
    });
  }
}

export class ReconsolidationSubClient {
  constructor(private readonly req: RequestFn) {}

  async queue(): Promise<ReconsolidationQueueResult> {
    const d = await this.req<{ queue_size: number }>({
      path: `${V4_PREFIX}/reconsolidation/queue`,
    });
    return { queueSize: d.queue_size };
  }

  async run(): Promise<ReconsolidationRunResult> {
    const d = await this.req<{ processed: number; timestamp: string }>({
      method: "POST",
      path: `${V4_PREFIX}/reconsolidation/run`,
    });
    return { processed: d.processed, timestamp: d.timestamp };
  }
}

export class GoalSubClient {
  constructor(private readonly req: RequestFn) {}

  async create(
    goal: string,
    owner: string,
    options: {
      priority?: number;
      successCriteria?: Record<string, unknown>;
      deadline?: string;
    } = {},
  ): Promise<GoalResult> {
    const body: Record<string, unknown> = {
      goal,
      owner,
      priority: options.priority ?? 0.5,
    };
    if (options.successCriteria !== undefined) body.success_criteria = options.successCriteria;
    if (options.deadline !== undefined) body.deadline = options.deadline;
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/goals`,
      body,
    });
    return parseGoal(d);
  }

  async list(): Promise<GoalResult[]> {
    const data = await this.req<Array<Record<string, unknown>>>({
      path: `${V4_PREFIX}/goals`,
    });
    return data.map(parseGoal);
  }

  async get(goalId: string): Promise<GoalResult> {
    const d = await this.req<Record<string, unknown>>({
      path: `${V4_PREFIX}/goals/${goalId}`,
    });
    return parseGoal(d);
  }

  async evaluate(goalId: string): Promise<GoalEvaluationResult> {
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/goals/${goalId}/evaluate`,
    });
    return parseGoalEvaluation(d);
  }

  async updateStatus(goalId: string, status: string): Promise<GoalResult> {
    const d = await this.req<Record<string, unknown>>({
      method: "PUT",
      path: `${V4_PREFIX}/goals/${goalId}/status`,
      body: { status },
    });
    return parseGoal(d);
  }

  async abandon(goalId: string): Promise<void> {
    await this.req<undefined>({
      method: "DELETE",
      path: `${V4_PREFIX}/goals/${goalId}`,
    });
  }
}

export class PolicySubClient {
  constructor(private readonly req: RequestFn) {}

  async create(
    name: string,
    steps: Record<string, unknown>[],
    options: {
      description?: string;
      applicability?: Record<string, unknown>;
    } = {},
  ): Promise<PolicyResult> {
    const d = await this.req<Record<string, unknown>>({
      method: "POST",
      path: `${V4_PREFIX}/policies`,
      body: {
        name,
        description: options.description ?? "",
        steps,
        applicability: options.applicability ?? {},
      },
    });
    return parsePolicy(d);
  }

  async list(): Promise<PolicyResult[]> {
    const data = await this.req<Array<Record<string, unknown>>>({
      path: `${V4_PREFIX}/policies`,
    });
    return data.map(parsePolicy);
  }

  async get(policyId: string): Promise<PolicyResult> {
    const d = await this.req<Record<string, unknown>>({
      path: `${V4_PREFIX}/policies/${policyId}`,
    });
    return parsePolicy(d);
  }

  async getHistory(policyId: string): Promise<PolicyResult[]> {
    const data = await this.req<Array<Record<string, unknown>>>({
      path: `${V4_PREFIX}/policies/${policyId}/history`,
    });
    return data.map(parsePolicy);
  }

  async updateStatus(policyId: string, status: string): Promise<PolicyResult> {
    const d = await this.req<Record<string, unknown>>({
      method: "PUT",
      path: `${V4_PREFIX}/policies/${policyId}/status`,
      body: { status },
    });
    return parsePolicy(d);
  }
}

export class Brain {
  readonly agentId: string;
  private readonly client: MnemeBrainClient;

  constructor(
    agentId: string = "default",
    baseUrl: string = DEFAULT_BASE_URL,
    timeout: number = 30_000,
  ) {
    this.agentId = agentId;
    this.client = new MnemeBrainClient(baseUrl, timeout);
  }

  /** Access the underlying low-level client. */
  get rawClient(): MnemeBrainClient {
    return this.client;
  }

  async believe(
    claim: string,
    evidence?: string[],
    confidence: number = 0.8,
    beliefType: string = "inference",
  ): Promise<BeliefResult> {
    const refs = evidence ?? ["auto"];
    const evidenceItems = refs.map(
      (ref) =>
        new EvidenceInput({
          sourceRef: ref,
          content: claim,
          polarity: "supports",
          weight: confidence,
          reliability: confidence,
        }),
    );
    return this.client.believe(
      claim,
      evidenceItems,
      beliefType,
      [],
      this.agentId,
    );
  }

  async ask(
    question: string,
    _queryType: string = "FACTUAL",
    _agentId?: string,
    limit: number = 5,
  ): Promise<AskResult> {
    const response = await this.client.search(question, limit);
    const retrievedBeliefs: RetrievedBelief[] = response.results.map((r) => ({
      claim: r.claim,
      confidence: r.confidence,
      similarity: r.similarity,
    }));
    return {
      queryId: randomUUID(),
      retrievedBeliefs,
    };
  }

  feedback(_queryId: string, _outcome: string = "COMPLETED"): void {
    // No-op — logged for future use
  }
}
