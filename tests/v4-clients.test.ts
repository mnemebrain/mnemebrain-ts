import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MnemeBrainClient } from "../src/client.js";

const BASE_URL = "http://localhost:8000";
const V4 = `${BASE_URL}/api/mneme`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

const SANDBOX_RESPONSE = {
  id: "sb-1",
  frame_id: null,
  scenario_label: "test-scenario",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-01-01T00:10:00Z",
};

describe("SandboxSubClient", () => {
  it("fork returns SandboxResult", async () => {
    server.use(
      http.post(`${V4}/sandbox/fork`, () =>
        HttpResponse.json(SANDBOX_RESPONSE, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.fork({ scenarioLabel: "test-scenario" });
    expect(result.id).toBe("sb-1");
    expect(result.status).toBe("active");
    expect(result.frameId).toBeNull();
    expect(result.scenarioLabel).toBe("test-scenario");
  });

  it("fork with missing frame_id and expires_at fields", async () => {
    server.use(
      http.post(`${V4}/sandbox/fork`, () =>
        HttpResponse.json({
          id: "sb-0",
          scenario_label: "minimal",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          // omit: frame_id, expires_at
        }, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.fork();
    expect(result.frameId).toBeNull();
    expect(result.expiresAt).toBeNull();
  });

  it("fork with non-null frame_id and expires_at", async () => {
    server.use(
      http.post(`${V4}/sandbox/fork`, () =>
        HttpResponse.json({
          ...SANDBOX_RESPONSE,
          frame_id: "f-99",
          expires_at: "2026-12-31T00:00:00Z",
        }, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.fork();
    expect(result.frameId).toBe("f-99");
    expect(result.expiresAt).toBe("2026-12-31T00:00:00Z");
  });

  it("fork with frameId and defaults", async () => {
    server.use(
      http.post(`${V4}/sandbox/fork`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("frame_id", "f-1");
        expect(body).toHaveProperty("scenario_label", "");
        expect(body).toHaveProperty("ttl_seconds", 600);
        return HttpResponse.json(SANDBOX_RESPONSE, { status: 201 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.sandbox.fork({ frameId: "f-1" });
  });

  it("quick returns SandboxResult", async () => {
    server.use(
      http.post(`${V4}/sandbox/quick`, () =>
        HttpResponse.json({ ...SANDBOX_RESPONSE, id: "sb-2", scenario_label: "quick" }, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.quick();
    expect(result.id).toBe("sb-2");
  });

  it("quick with frameId", async () => {
    server.use(
      http.post(`${V4}/sandbox/quick`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("frame_id", "f-1");
        return HttpResponse.json({ ...SANDBOX_RESPONSE, id: "sb-3" }, { status: 201 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.quick("f-1");
    expect(result.id).toBe("sb-3");
  });

  it("getContext returns SandboxContextResult", async () => {
    server.use(
      http.get(`${V4}/sandbox/sb-1/context`, () =>
        HttpResponse.json({
          id: "sb-1",
          frame_id: null,
          scenario_label: "test",
          status: "active",
          belief_overrides: { "b-1": { truth_state: "false" } },
          added_belief_ids: ["b-new"],
          invalidated_evidence: ["ev-1"],
          created_at: "2026-01-01T00:00:00Z",
          expires_at: null,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.getContext("sb-1");
    expect(result.id).toBe("sb-1");
    expect(result.addedBeliefIds).toEqual(["b-new"]);
    expect(result.invalidatedEvidence).toEqual(["ev-1"]);
    expect(result.expiresAt).toBeNull();
  });

  it("assume sends POST and resolves", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/assume`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.sandbox.assume("sb-1", "b-1", "false");
  });

  it("retract sends POST and resolves", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/retract`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.sandbox.retract("sb-1", "ev-1");
  });

  it("believe returns beliefId", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/believe`, () =>
        HttpResponse.json({ belief_id: "b-new" }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.believe("sb-1", "sky is blue");
    expect(result.beliefId).toBe("b-new");
  });

  it("revise sends POST and resolves", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/revise`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.belief_id).toBe("b-1");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.sandbox.revise("sb-1", { beliefId: "b-1", content: "updated" });
  });

  it("revise with minimal options uses defaults", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/revise`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({
          belief_id: "b-1",
          source_ref: "",
          content: "",
          polarity: "supports",
          weight: 0.8,
          reliability: 0.7,
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.sandbox.revise("sb-1", { beliefId: "b-1" });
  });

  it("revise with all options", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/revise`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({
          belief_id: "b-1",
          source_ref: "ref-x",
          content: "full content",
          polarity: "attacks",
          weight: 0.6,
          reliability: 0.5,
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.sandbox.revise("sb-1", {
      beliefId: "b-1",
      sourceRef: "ref-x",
      content: "full content",
      polarity: "attacks",
      weight: 0.6,
      reliability: 0.5,
    });
  });

  it("attack returns attackEdgeId", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/attack`, () =>
        HttpResponse.json({ attack_edge_id: "ae-1" }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.attack("sb-1", "b-1", "b-2", "contradicts");
    expect(result.attackEdgeId).toBe("ae-1");
  });

  it("diff returns SandboxDiffResult", async () => {
    server.use(
      http.get(`${V4}/sandbox/sb-1/diff`, () =>
        HttpResponse.json({
          belief_changes: [
            { belief_id: "b-1", field: "truth_state", old_value: "true", new_value: "false" },
          ],
          evidence_invalidations: ["ev-1"],
          new_beliefs: [],
          temporary_attacks: [],
          goal_changes: [],
          summary: "1 override",
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.diff("sb-1");
    expect(result.beliefChanges).toHaveLength(1);
    expect(result.beliefChanges[0]!.beliefId).toBe("b-1");
    expect(result.beliefChanges[0]!.field).toBe("truth_state");
    expect(result.beliefChanges[0]!.oldValue).toBe("true");
    expect(result.beliefChanges[0]!.newValue).toBe("false");
    expect(result.evidenceInvalidations).toEqual(["ev-1"]);
    expect(result.summary).toBe("1 override");
  });

  it("commit returns SandboxCommitResult", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/commit`, () =>
        HttpResponse.json({
          sandbox_id: "sb-1",
          committed_belief_ids: ["b-1"],
          conflicts: [],
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.commit("sb-1", "all");
    expect(result.sandboxId).toBe("sb-1");
    expect(result.committedBeliefIds).toEqual(["b-1"]);
    expect(result.conflicts).toEqual([]);
  });

  it("commit with selectedIds", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/commit`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("commit_mode", "selective");
        expect(body).toHaveProperty("selected_ids", ["b-1", "b-2"]);
        return HttpResponse.json({
          sandbox_id: "sb-1",
          committed_belief_ids: ["b-1", "b-2"],
          conflicts: [],
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.commit("sb-1", "selective", ["b-1", "b-2"]);
    expect(result.committedBeliefIds).toEqual(["b-1", "b-2"]);
  });

  it("discard sends DELETE and resolves", async () => {
    server.use(
      http.delete(`${V4}/sandbox/sb-1`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.sandbox.discard("sb-1");
  });

  it("explain returns SandboxExplainResult", async () => {
    server.use(
      http.get(`${V4}/sandbox/sb-1/explain/b-1`, () =>
        HttpResponse.json({
          belief_id: "b-1",
          sandbox_id: "sb-1",
          resolved_truth_state: "false",
          has_override: true,
          override_fields: ["truth_state"],
          invalidated_evidence_ids: [],
          source: "sandbox",
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.explain("sb-1", "b-1");
    expect(result.beliefId).toBe("b-1");
    expect(result.sandboxId).toBe("sb-1");
    expect(result.hasOverride).toBe(true);
    expect(result.resolvedTruthState).toBe("false");
    expect(result.overrideFields).toEqual(["truth_state"]);
  });

  it("evaluateGoal returns GoalEvaluationResult", async () => {
    server.use(
      http.post(`${V4}/sandbox/sb-1/goal/g-1/evaluate`, () =>
        HttpResponse.json({
          goal_id: "g-1",
          status: "active",
          completion_fraction: 0.4,
          blocking_belief_ids: ["b-2"],
          supporting_belief_ids: ["b-1"],
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.sandbox.evaluateGoal("sb-1", "g-1");
    expect(result.goalId).toBe("g-1");
    expect(result.completionFraction).toBe(0.4);
    expect(result.blockingBeliefIds).toEqual(["b-2"]);
  });

  it("lazy getter returns same instance", () => {
    const client = new MnemeBrainClient(BASE_URL);
    expect(client.sandbox).toBe(client.sandbox);
  });
});

// ---------------------------------------------------------------------------
// Revision
// ---------------------------------------------------------------------------

describe("RevisionSubClient", () => {
  it("setPolicy returns RevisionPolicyResult", async () => {
    server.use(
      http.post(`${V4}/revision/policy`, () =>
        HttpResponse.json({
          policy_name: "recency",
          max_retraction_depth: 3,
          max_retractions: 10,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.revision.setPolicy("recency");
    expect(result.policyName).toBe("recency");
    expect(result.maxRetractionDepth).toBe(3);
    expect(result.maxRetractions).toBe(10);
  });

  it("setPolicy with options passes them through", async () => {
    server.use(
      http.post(`${V4}/revision/policy`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("max_retraction_depth", 5);
        expect(body).toHaveProperty("max_retractions", 20);
        return HttpResponse.json({
          policy_name: "recency",
          max_retraction_depth: 5,
          max_retractions: 20,
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.revision.setPolicy("recency", { maxRetractionDepth: 5, maxRetractions: 20 });
    expect(result.maxRetractionDepth).toBe(5);
    expect(result.maxRetractions).toBe(20);
  });

  it("getPolicy returns RevisionPolicyResult", async () => {
    server.use(
      http.get(`${V4}/revision/policy`, () =>
        HttpResponse.json({
          policy_name: "confidence",
          max_retraction_depth: 5,
          max_retractions: 20,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.revision.getPolicy();
    expect(result.policyName).toBe("confidence");
    expect(result.maxRetractionDepth).toBe(5);
  });

  it("listAudit returns empty array", async () => {
    server.use(
      http.get(`${V4}/revision/audit`, () => HttpResponse.json([])),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.revision.listAudit();
    expect(result).toEqual([]);
  });

  it("listAudit maps snake_case to camelCase", async () => {
    server.use(
      http.get(`${V4}/revision/audit`, () =>
        HttpResponse.json([
          {
            id: "aud-1",
            timestamp: "2026-01-01T00:00:00Z",
            incoming_belief_id: "b-1",
            policy_name: "recency",
            revision_depth: 2,
            bounded: true,
            agent_id: "agent-x",
          },
        ]),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.revision.listAudit();
    expect(result).toHaveLength(1);
    expect(result[0]!.incomingBeliefId).toBe("b-1");
    expect(result[0]!.policyName).toBe("recency");
    expect(result[0]!.revisionDepth).toBe(2);
    expect(result[0]!.bounded).toBe(true);
    expect(result[0]!.agentId).toBe("agent-x");
  });

  it("revise returns RevisionResult", async () => {
    server.use(
      http.post(`${V4}/revise`, () =>
        HttpResponse.json({
          superseded_evidence_ids: ["ev-1"],
          retracted_belief_ids: [],
          revision_depth: 1,
          policy_name: "recency",
          bounded: false,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.revision.revise("b-1");
    expect(result.supersededEvidenceIds).toEqual(["ev-1"]);
    expect(result.revisionDepth).toBe(1);
    expect(result.policyName).toBe("recency");
    expect(result.bounded).toBe(false);
  });

  it("revise with evidence items maps fields correctly", async () => {
    server.use(
      http.post(`${V4}/revise`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const conflicting = body.conflicting_evidence as Array<Record<string, unknown>>;
        expect(conflicting).toHaveLength(1);
        expect(conflicting[0]).toEqual({
          source_ref: "ref-a",
          content: "conflicting content",
          polarity: "attacks",
          weight: 0.6,
          reliability: 0.5,
          id: "ev-existing",
        });
        const incoming = body.incoming_evidence as Array<Record<string, unknown>>;
        expect(incoming).toHaveLength(1);
        expect(incoming[0]).toEqual({
          source_ref: "",
          content: "",
          polarity: "supports",
          weight: 0.8,
          reliability: 0.7,
        });
        return HttpResponse.json({
          superseded_evidence_ids: [],
          retracted_belief_ids: [],
          revision_depth: 0,
          policy_name: "recency",
          bounded: false,
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.revision.revise("b-1", {
      conflictingEvidence: [
        { sourceRef: "ref-a", content: "conflicting content", polarity: "attacks", weight: 0.6, reliability: 0.5, id: "ev-existing" },
      ],
      incomingEvidence: [{}],
      agentId: "test-agent",
    });
  });

  it("lazy getter returns same instance", () => {
    const client = new MnemeBrainClient(BASE_URL);
    expect(client.revision).toBe(client.revision);
  });
});

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

const ATTACK_EDGE = {
  id: "ae-1",
  source_belief_id: "b-1",
  target_belief_id: "b-2",
  attack_type: "contradicts",
  weight: 0.8,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("AttackSubClient", () => {
  it("create returns AttackEdgeResult", async () => {
    server.use(
      http.post(`${V4}/beliefs/b-1/attacks`, () =>
        HttpResponse.json(ATTACK_EDGE, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.attacks.create("b-1", "b-2", "contradicts", 0.8);
    expect(result.id).toBe("ae-1");
    expect(result.attackType).toBe("contradicts");
    expect(result.sourceBeliefId).toBe("b-1");
    expect(result.targetBeliefId).toBe("b-2");
    expect(result.active).toBe(true);
  });

  it("list returns empty array", async () => {
    server.use(
      http.get(`${V4}/beliefs/b-1/attacks`, () => HttpResponse.json([])),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.attacks.list("b-1");
    expect(result).toEqual([]);
  });

  it("list returns mapped AttackEdgeResult[]", async () => {
    server.use(
      http.get(`${V4}/beliefs/b-1/attacks`, () => HttpResponse.json([ATTACK_EDGE])),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.attacks.list("b-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("ae-1");
  });

  it("getChain returns nested arrays", async () => {
    server.use(
      http.get(`${V4}/beliefs/b-1/attack-chain`, () =>
        HttpResponse.json({ chains: [[ATTACK_EDGE]] }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.attacks.getChain("b-1", 2);
    expect(result).toHaveLength(1);
    expect(result[0]!).toHaveLength(1);
    expect(result[0]![0]!.attackType).toBe("contradicts");
  });

  it("getChain returns empty chains", async () => {
    server.use(
      http.get(`${V4}/beliefs/b-1/attack-chain`, () =>
        HttpResponse.json({ chains: [] }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.attacks.getChain("b-1");
    expect(result).toEqual([]);
  });

  it("deactivate sends DELETE and resolves", async () => {
    server.use(
      http.delete(`${V4}/attacks/ae-1`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.attacks.deactivate("ae-1");
  });

  it("lazy getter returns same instance", () => {
    const client = new MnemeBrainClient(BASE_URL);
    expect(client.attacks).toBe(client.attacks);
  });
});

// ---------------------------------------------------------------------------
// Reconsolidation
// ---------------------------------------------------------------------------

describe("ReconsolidationSubClient", () => {
  it("queue returns queueSize", async () => {
    server.use(
      http.get(`${V4}/reconsolidation/queue`, () =>
        HttpResponse.json({ queue_size: 5 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.reconsolidation.queue();
    expect(result.queueSize).toBe(5);
  });

  it("run returns processed and timestamp", async () => {
    server.use(
      http.post(`${V4}/reconsolidation/run`, () =>
        HttpResponse.json({ processed: 3, timestamp: "2026-01-01T00:00:00Z" }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.reconsolidation.run();
    expect(result.processed).toBe(3);
    expect(result.timestamp).toBe("2026-01-01T00:00:00Z");
  });

  it("lazy getter returns same instance", () => {
    const client = new MnemeBrainClient(BASE_URL);
    expect(client.reconsolidation).toBe(client.reconsolidation);
  });
});

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const GOAL_RESPONSE = {
  id: "g-1",
  goal: "deploy feature",
  owner: "agent-1",
  priority: 0.8,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  deadline: null,
  success_criteria: {},
};

describe("GoalSubClient", () => {
  it("create returns GoalResult", async () => {
    server.use(
      http.post(`${V4}/goals`, () =>
        HttpResponse.json(GOAL_RESPONSE, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.create("deploy feature", "agent-1", { priority: 0.8 });
    expect(result.id).toBe("g-1");
    expect(result.goal).toBe("deploy feature");
    expect(result.owner).toBe("agent-1");
    expect(result.priority).toBe(0.8);
    expect(result.deadline).toBeNull();
    expect(result.successCriteria).toEqual({});
  });

  it("create with successCriteria and deadline", async () => {
    server.use(
      http.post(`${V4}/goals`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("success_criteria", { metric: "uptime", target: 0.99 });
        expect(body).toHaveProperty("deadline", "2026-12-31");
        return HttpResponse.json({
          ...GOAL_RESPONSE,
          success_criteria: { metric: "uptime", target: 0.99 },
          deadline: "2026-12-31",
        }, { status: 201 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.create("deploy feature", "agent-1", {
      successCriteria: { metric: "uptime", target: 0.99 },
      deadline: "2026-12-31",
    });
    expect(result.deadline).toBe("2026-12-31");
    expect(result.successCriteria).toEqual({ metric: "uptime", target: 0.99 });
  });

  it("create with missing optional goal fields", async () => {
    server.use(
      http.post(`${V4}/goals`, () =>
        HttpResponse.json({
          id: "g-3",
          goal: "test",
          owner: "a",
          priority: 0.5,
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          // omit: deadline, success_criteria
        }, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.create("test", "a");
    expect(result.deadline).toBeNull();
    expect(result.successCriteria).toEqual({});
  });

  it("list returns empty array", async () => {
    server.use(
      http.get(`${V4}/goals`, () => HttpResponse.json([])),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.list();
    expect(result).toEqual([]);
  });

  it("get returns GoalResult", async () => {
    server.use(
      http.get(`${V4}/goals/g-1`, () => HttpResponse.json(GOAL_RESPONSE)),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.get("g-1");
    expect(result.id).toBe("g-1");
    expect(result.goal).toBe("deploy feature");
  });

  it("get with non-null deadline and success_criteria", async () => {
    server.use(
      http.get(`${V4}/goals/g-2`, () =>
        HttpResponse.json({
          ...GOAL_RESPONSE,
          id: "g-2",
          deadline: "2026-06-30",
          success_criteria: { uptime: 0.99 },
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.get("g-2");
    expect(result.deadline).toBe("2026-06-30");
    expect(result.successCriteria).toEqual({ uptime: 0.99 });
  });

  it("evaluate returns GoalEvaluationResult", async () => {
    server.use(
      http.post(`${V4}/goals/g-1/evaluate`, () =>
        HttpResponse.json({
          goal_id: "g-1",
          status: "active",
          completion_fraction: 0.5,
          blocking_belief_ids: [],
          supporting_belief_ids: ["b-1"],
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.evaluate("g-1");
    expect(result.goalId).toBe("g-1");
    expect(result.completionFraction).toBe(0.5);
    expect(result.supportingBeliefIds).toEqual(["b-1"]);
  });

  it("updateStatus returns updated GoalResult", async () => {
    server.use(
      http.put(`${V4}/goals/g-1/status`, () =>
        HttpResponse.json({ ...GOAL_RESPONSE, status: "completed" }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.goals.updateStatus("g-1", "completed");
    expect(result.status).toBe("completed");
  });

  it("abandon sends DELETE and resolves", async () => {
    server.use(
      http.delete(`${V4}/goals/g-1`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.goals.abandon("g-1");
  });

  it("lazy getter returns same instance", () => {
    const client = new MnemeBrainClient(BASE_URL);
    expect(client.goals).toBe(client.goals);
  });
});

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

const POLICY_RESPONSE = {
  id: "p-1",
  name: "auth-flow",
  description: "Handles auth",
  version: 1,
  reliability: 1.0,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  last_updated: "2026-01-01T00:00:00Z",
  superseded_by: null,
  steps: [
    { step_id: 1, action: "check token", tool: null, conditions: [], fallback: null },
  ],
  applicability: {},
};

describe("PolicySubClient", () => {
  it("create returns PolicyResult", async () => {
    server.use(
      http.post(`${V4}/policies`, () =>
        HttpResponse.json(POLICY_RESPONSE, { status: 201 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.create(
      "auth-flow",
      [{ step_id: 1, action: "check token" }],
      { description: "Handles auth" },
    );
    expect(result.id).toBe("p-1");
    expect(result.name).toBe("auth-flow");
    expect(result.version).toBe(1);
    expect(result.reliability).toBe(1.0);
    expect(result.supersededBy).toBeNull();
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.stepId).toBe(1);
    expect(result.steps[0]!.action).toBe("check token");
    expect(result.steps[0]!.tool).toBeNull();
  });

  it("create without options uses defaults", async () => {
    server.use(
      http.post(`${V4}/policies`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("description", "");
        expect(body).toHaveProperty("applicability", {});
        return HttpResponse.json(POLICY_RESPONSE, { status: 201 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.policies.create("auth-flow", [{ step_id: 1, action: "check token" }]);
  });

  it("create with applicability passes through", async () => {
    server.use(
      http.post(`${V4}/policies`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("applicability", { domain: "auth" });
        return HttpResponse.json({
          ...POLICY_RESPONSE,
          applicability: { domain: "auth" },
        }, { status: 201 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.create(
      "auth-flow",
      [{ step_id: 1, action: "check token" }],
      { description: "Auth", applicability: { domain: "auth" } },
    );
    expect(result.applicability).toEqual({ domain: "auth" });
  });

  it("list returns empty array", async () => {
    server.use(
      http.get(`${V4}/policies`, () => HttpResponse.json([])),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.list();
    expect(result).toEqual([]);
  });

  it("get returns PolicyResult", async () => {
    server.use(
      http.get(`${V4}/policies/p-1`, () => HttpResponse.json(POLICY_RESPONSE)),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.get("p-1");
    expect(result.id).toBe("p-1");
    expect(result.lastUpdated).toBe("2026-01-01T00:00:00Z");
    expect(result.applicability).toEqual({});
  });

  it("get with superseded_by and rich steps", async () => {
    server.use(
      http.get(`${V4}/policies/p-2`, () =>
        HttpResponse.json({
          id: "p-2",
          name: "auth-v2",
          description: "Updated auth",
          version: 2,
          reliability: 0.95,
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          last_updated: "2026-02-01T00:00:00Z",
          superseded_by: "p-3",
          steps: [
            {
              step_id: 1,
              action: "validate token",
              tool: "jwt-validator",
              conditions: ["token_present", "not_expired"],
              fallback: "redirect to login",
            },
          ],
          applicability: { domain: "auth" },
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.get("p-2");
    expect(result.supersededBy).toBe("p-3");
    expect(result.steps[0]!.tool).toBe("jwt-validator");
    expect(result.steps[0]!.conditions).toEqual(["token_present", "not_expired"]);
    expect(result.steps[0]!.fallback).toBe("redirect to login");
    expect(result.applicability).toEqual({ domain: "auth" });
  });

  it("get with missing optional fields uses defaults", async () => {
    server.use(
      http.get(`${V4}/policies/p-3`, () =>
        HttpResponse.json({
          id: "p-3",
          name: "minimal",
          description: "",
          version: 1,
          reliability: 1.0,
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          last_updated: "2026-01-01T00:00:00Z",
          // omit: superseded_by, steps, applicability
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.get("p-3");
    expect(result.supersededBy).toBeNull();
    expect(result.steps).toEqual([]);
    expect(result.applicability).toEqual({});
  });

  it("get with step missing optional fields", async () => {
    server.use(
      http.get(`${V4}/policies/p-4`, () =>
        HttpResponse.json({
          ...POLICY_RESPONSE,
          id: "p-4",
          steps: [{ step_id: 1, action: "noop" }],
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.get("p-4");
    expect(result.steps[0]!.tool).toBeNull();
    expect(result.steps[0]!.conditions).toEqual([]);
    expect(result.steps[0]!.fallback).toBeNull();
  });

  it("getHistory returns array of PolicyResult", async () => {
    server.use(
      http.get(`${V4}/policies/p-1/history`, () => HttpResponse.json([])),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.getHistory("p-1");
    expect(result).toEqual([]);
  });

  it("updateStatus returns updated PolicyResult", async () => {
    server.use(
      http.put(`${V4}/policies/p-1/status`, () =>
        HttpResponse.json({ ...POLICY_RESPONSE, status: "retired" }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.policies.updateStatus("p-1", "retired");
    expect(result.status).toBe("retired");
  });

  it("lazy getter returns same instance", () => {
    const client = new MnemeBrainClient(BASE_URL);
    expect(client.policies).toBe(client.policies);
  });
});
