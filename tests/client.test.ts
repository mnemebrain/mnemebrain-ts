import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MnemeBrainClient, MnemeBrainError, Brain } from "../src/client.js";
import { EvidenceInput } from "../src/models.js";

const BASE_URL = "http://localhost:8000";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("MnemeBrainClient", () => {
  it("health", async () => {
    server.use(
      http.get(`${BASE_URL}/health`, () =>
        HttpResponse.json({ status: "ok" }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.health();
    expect(result).toEqual({ status: "ok" });
  });

  it("believe", async () => {
    server.use(
      http.post(`${BASE_URL}/believe`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("claim", "user is vegetarian");
        expect(body).toHaveProperty("belief_type", "inference");
        return HttpResponse.json({
          id: "abc-123",
          truth_state: "true",
          confidence: 0.85,
          conflict: false,
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.believe("user is vegetarian", [
      new EvidenceInput({
        sourceRef: "msg_12",
        content: "They said no meat please",
        polarity: "supports",
        weight: 0.8,
        reliability: 0.9,
      }),
    ]);
    expect(result.id).toBe("abc-123");
    expect(result.truthState).toBe("true");
    expect(result.confidence).toBe(0.85);
    expect(result.conflict).toBe(false);
  });

  it("search", async () => {
    server.use(
      http.get(`${BASE_URL}/search`, () =>
        HttpResponse.json({
          results: [
            {
              belief_id: "b-1",
              claim: "user is vegetarian",
              truth_state: "true",
              confidence: 0.85,
              similarity: 0.92,
              rank_score: 0.88,
            },
          ],
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.search("vegetarian");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].claim).toBe("user is vegetarian");
    expect(result.results[0].similarity).toBe(0.92);
  });

  it("explain", async () => {
    server.use(
      http.get(`${BASE_URL}/explain`, () =>
        HttpResponse.json({
          claim: "user is vegetarian",
          truth_state: "true",
          confidence: 0.85,
          supporting: [
            {
              id: "e-1",
              source_ref: "msg_12",
              content: "no meat",
              polarity: "supports",
              weight: 0.8,
              reliability: 0.9,
            },
          ],
          attacking: [],
          expired: [],
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.explain("user is vegetarian");
    expect(result).not.toBeNull();
    expect(result!.truthState).toBe("true");
    expect(result!.supporting).toHaveLength(1);
    expect(result!.supporting[0].sourceRef).toBe("msg_12");
  });

  it("explain not found", async () => {
    server.use(
      http.get(`${BASE_URL}/explain`, () =>
        HttpResponse.json({ detail: "Belief not found" }, { status: 404 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.explain("nonexistent claim");
    expect(result).toBeNull();
  });

  it("retract", async () => {
    server.use(
      http.post(`${BASE_URL}/retract`, () =>
        HttpResponse.json([
          {
            id: "b-1",
            truth_state: "neither",
            confidence: 0.0,
            conflict: false,
          },
        ]),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const results = await client.retract("e-1");
    expect(results).toHaveLength(1);
    expect(results[0].truthState).toBe("neither");
  });

  it("revise", async () => {
    server.use(
      http.post(`${BASE_URL}/revise`, () =>
        HttpResponse.json({
          id: "b-1",
          truth_state: "true",
          confidence: 0.95,
          conflict: false,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.revise(
      "b-1",
      new EvidenceInput({
        sourceRef: "msg_50",
        content: "confirmed",
        polarity: "supports",
        weight: 0.9,
        reliability: 0.95,
      }),
    );
    expect(result.confidence).toBe(0.95);
  });

  it("HTTP error throws MnemeBrainError", async () => {
    server.use(
      http.get(`${BASE_URL}/health`, () =>
        HttpResponse.json({ error: "server error" }, { status: 500 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await expect(client.health()).rejects.toThrow(MnemeBrainError);
    await expect(client.health()).rejects.toMatchObject({ status: 500 });
  });

  it("HTTP error with empty body", async () => {
    server.use(
      http.get(`${BASE_URL}/health`, () =>
        new HttpResponse(null, { status: 502 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await expect(client.health()).rejects.toThrow(MnemeBrainError);
    await expect(client.health()).rejects.toMatchObject({ status: 502 });
  });

  it("explain rethrows non-404 errors", async () => {
    server.use(
      http.get(`${BASE_URL}/explain`, () =>
        HttpResponse.json({ error: "server error" }, { status: 500 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await expect(client.explain("some claim")).rejects.toThrow(MnemeBrainError);
    await expect(client.explain("some claim")).rejects.toMatchObject({ status: 500 });
  });
});

describe("listBeliefs", () => {
  it("list beliefs with filters", async () => {
    server.use(
      http.get(`${BASE_URL}/beliefs`, () =>
        HttpResponse.json({
          beliefs: [
            {
              id: "b-1",
              claim: "user is vegetarian",
              belief_type: "preference",
              truth_state: "true",
              confidence: 0.92,
              tag_count: 2,
              evidence_count: 3,
              created_at: "2026-01-15T10:00:00+00:00",
              last_revised: "2026-01-18T14:30:00+00:00",
            },
          ],
          total: 1,
          offset: 0,
          limit: 50,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.listBeliefs({
      truthState: "true",
      beliefType: "preference",
      tag: "food",
    });
    expect(result.total).toBe(1);
    expect(result.beliefs).toHaveLength(1);
    expect(result.beliefs[0].claim).toBe("user is vegetarian");
    expect(result.beliefs[0].beliefType).toBe("preference");
    expect(result.beliefs[0].tagCount).toBe(2);
  });

  it("list beliefs no filters", async () => {
    server.use(
      http.get(`${BASE_URL}/beliefs`, () =>
        HttpResponse.json({ beliefs: [], total: 0, offset: 0, limit: 50 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.listBeliefs();
    expect(result.total).toBe(0);
    expect(result.beliefs).toEqual([]);
  });
});

describe("WorkingMemoryFrame", () => {
  const SNAPSHOT = {
    belief_id: "b-1",
    claim: "auth uses JWT",
    truth_state: "true",
    confidence: 0.92,
    belief_type: "fact",
    evidence_count: 3,
    conflict: false,
  };

  it("frame open", async () => {
    server.use(
      http.post(`${BASE_URL}/frame/open`, () =>
        HttpResponse.json({
          frame_id: "f-123",
          beliefs_loaded: 1,
          conflicts: 0,
          snapshots: [SNAPSHOT],
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.frameOpen(
      "should we refactor auth?",
      ["auth uses JWT"],
      600,
      "planner",
    );
    expect(result.frameId).toBe("f-123");
    expect(result.beliefsLoaded).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].claim).toBe("auth uses JWT");
  });

  it("frame add", async () => {
    server.use(
      http.post(`${BASE_URL}/frame/f-123/add`, () =>
        HttpResponse.json(SNAPSHOT),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.frameAdd("f-123", "auth uses JWT");
    expect(result.beliefId).toBe("b-1");
    expect(result.confidence).toBe(0.92);
  });

  it("frame scratchpad", async () => {
    server.use(
      http.post(`${BASE_URL}/frame/f-123/scratchpad`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.frameScratchpad("f-123", "step_1", "JWT is well established");
  });

  it("frame context", async () => {
    server.use(
      http.get(`${BASE_URL}/frame/f-123/context`, () =>
        HttpResponse.json({
          query: "should we refactor auth?",
          beliefs: [SNAPSHOT],
          scratchpad: { step_1: "JWT is well established" },
          conflicts: [],
          step_count: 1,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.frameContext("f-123");
    expect(result.query).toBe("should we refactor auth?");
    expect(result.beliefs).toHaveLength(1);
    expect(result.scratchpad.step_1).toBe("JWT is well established");
    expect(result.stepCount).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it("frame commit", async () => {
    server.use(
      http.post(`${BASE_URL}/frame/f-123/commit`, () =>
        HttpResponse.json({
          frame_id: "f-123",
          beliefs_created: 1,
          beliefs_revised: 0,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.frameCommit("f-123", [
      { claim: "new fact", evidence: [], belief_type: "fact" },
    ]);
    expect(result.frameId).toBe("f-123");
    expect(result.beliefsCreated).toBe(1);
    expect(result.beliefsRevised).toBe(0);
  });

  it("frame close", async () => {
    server.use(
      http.delete(`${BASE_URL}/frame/f-123`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.frameClose("f-123");
  });
});

describe("Brain", () => {
  it("believe simple", async () => {
    server.use(
      http.post(`${BASE_URL}/believe`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.claim).toBe("Paris is the capital of France");
        expect(body.source_agent).toBe("test-agent");
        const evidence = body.evidence as Array<Record<string, unknown>>;
        expect(evidence).toHaveLength(1);
        expect(evidence[0].source_ref).toBe("wiki_paris");
        return HttpResponse.json({
          id: "abc-123",
          truth_state: "true",
          confidence: 0.9,
          conflict: false,
        });
      }),
    );
    const brain = new Brain("test-agent", BASE_URL);
    const result = await brain.believe(
      "Paris is the capital of France",
      ["wiki_paris"],
      0.9,
    );
    expect(result.id).toBe("abc-123");
    expect(result.truthState).toBe("true");
  });

  it("believe without evidence", async () => {
    server.use(
      http.post(`${BASE_URL}/believe`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        const evidence = body.evidence as Array<Record<string, unknown>>;
        expect(evidence).toHaveLength(1);
        expect(evidence[0].source_ref).toBe("auto");
        expect(body.belief_type).toBe("inference");
        return HttpResponse.json({
          id: "abc-456",
          truth_state: "true",
          confidence: 0.8,
          conflict: false,
        });
      }),
    );
    const brain = new Brain("test-agent", BASE_URL);
    const result = await brain.believe("sky is blue");
    expect(result.id).toBe("abc-456");
  });

  it("ask", async () => {
    server.use(
      http.get(`${BASE_URL}/search`, () =>
        HttpResponse.json({
          results: [
            {
              belief_id: "b-1",
              claim: "Paris: Paris is the capital of France.",
              truth_state: "true",
              confidence: 0.9,
              similarity: 0.88,
              rank_score: 0.89,
            },
            {
              belief_id: "b-2",
              claim: "France: France is in Europe.",
              truth_state: "true",
              confidence: 0.85,
              similarity: 0.72,
              rank_score: 0.78,
            },
          ],
        }),
      ),
    );
    const brain = new Brain("test-agent", BASE_URL);
    const result = await brain.ask("What is the capital of France?");
    expect(result.retrievedBeliefs).toHaveLength(2);
    expect(result.retrievedBeliefs[0].claim).toContain("Paris");
    expect(result.queryId).toBeTruthy();
  });

  it("feedback noop", () => {
    const brain = new Brain("test-agent", BASE_URL);
    brain.feedback("some-query-id", "COMPLETED");
  });

  it("rawClient accessor", async () => {
    server.use(
      http.get(`${BASE_URL}/health`, () =>
        HttpResponse.json({ status: "ok" }),
      ),
    );
    const brain = new Brain("test", BASE_URL);
    const result = await brain.rawClient.health();
    expect(result).toEqual({ status: "ok" });
  });
});

// ---------------------------------------------------------------------------
// Phase 5: Consolidation, Memory Tiers, HippoRAG
// ---------------------------------------------------------------------------

describe("Phase 5", () => {
  it("reset", async () => {
    server.use(
      http.post(`${BASE_URL}/reset`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.reset();
  });

  it("setTimeOffset", async () => {
    server.use(
      http.post(`${BASE_URL}/debug/set_time_offset`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("days", 30);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.setTimeOffset(30);
  });

  it("consolidate", async () => {
    server.use(
      http.post(`${BASE_URL}/consolidate`, () =>
        HttpResponse.json({
          semantic_beliefs_created: 3,
          episodics_pruned: 5,
          clusters_found: 2,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.consolidate();
    expect(result.semanticBeliefsCreated).toBe(3);
    expect(result.episodicsPruned).toBe(5);
    expect(result.clustersFound).toBe(2);
  });

  it("getMemoryTier", async () => {
    server.use(
      http.get(`${BASE_URL}/memory_tier/b-1`, () =>
        HttpResponse.json({
          belief_id: "b-1",
          memory_tier: "semantic",
          consolidated_from_count: 4,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.getMemoryTier("b-1");
    expect(result.beliefId).toBe("b-1");
    expect(result.memoryTier).toBe("semantic");
    expect(result.consolidatedFromCount).toBe(4);
  });

  it("getMemoryTier encodes # in belief ID", async () => {
    server.use(
      http.get(`${BASE_URL}/memory_tier/b%231`, () =>
        HttpResponse.json({
          belief_id: "b#1",
          memory_tier: "episodic",
          consolidated_from_count: 0,
        }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.getMemoryTier("b#1");
    expect(result.beliefId).toBe("b#1");
    expect(result.memoryTier).toBe("episodic");
  });

  it("queryMultihop", async () => {
    server.use(
      http.post(`${BASE_URL}/query_multihop`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("query", "capital of France");
        return HttpResponse.json({
          results: [
            {
              belief_id: "b-1",
              claim: "Paris is the capital of France",
              confidence: 0.95,
              truth_state: "true",
            },
            {
              belief_id: "b-2",
              claim: "France is in Europe",
              confidence: 0.9,
              truth_state: "true",
            },
          ],
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.queryMultihop("capital of France");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].beliefId).toBe("b-1");
    expect(result.results[0].claim).toBe("Paris is the capital of France");
    expect(result.results[0].confidence).toBe(0.95);
    expect(result.results[0].truthState).toBe("true");
    expect(result.results[1].beliefId).toBe("b-2");
  });

  it("queryMultihop empty results", async () => {
    server.use(
      http.post(`${BASE_URL}/query_multihop`, () =>
        HttpResponse.json({ results: [] }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.queryMultihop("nonexistent topic");
    expect(result.results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Benchmark endpoints
// ---------------------------------------------------------------------------

describe("Benchmark", () => {
  const BENCHMARK_SANDBOX = {
    sandbox_id: "bsb-1",
    resolved_truth_state: "true",
    canonical_unchanged: true,
  };

  it("benchmarkSandboxFork", async () => {
    server.use(
      http.post(`${BASE_URL}/benchmark/sandbox/fork`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("scenario_label", "test-scenario");
        return HttpResponse.json(BENCHMARK_SANDBOX);
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.benchmarkSandboxFork("test-scenario");
    expect(result.sandboxId).toBe("bsb-1");
    expect(result.resolvedTruthState).toBe("true");
    expect(result.canonicalUnchanged).toBe(true);
  });

  it("benchmarkSandboxFork default label", async () => {
    server.use(
      http.post(`${BASE_URL}/benchmark/sandbox/fork`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("scenario_label", "");
        return HttpResponse.json(BENCHMARK_SANDBOX);
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.benchmarkSandboxFork();
  });

  it("benchmarkSandboxAssume", async () => {
    server.use(
      http.post(`${BASE_URL}/benchmark/sandbox/bsb-1/assume`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("belief_id", "b-1");
        expect(body).toHaveProperty("truth_state", "false");
        return HttpResponse.json({
          ...BENCHMARK_SANDBOX,
          resolved_truth_state: "false",
          canonical_unchanged: false,
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.benchmarkSandboxAssume("bsb-1", "b-1", "false");
    expect(result.sandboxId).toBe("bsb-1");
    expect(result.resolvedTruthState).toBe("false");
    expect(result.canonicalUnchanged).toBe(false);
  });

  it("benchmarkSandboxResolve", async () => {
    server.use(
      http.get(`${BASE_URL}/benchmark/sandbox/bsb-1/resolve/b-1`, () =>
        HttpResponse.json(BENCHMARK_SANDBOX),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.benchmarkSandboxResolve("bsb-1", "b-1");
    expect(result.sandboxId).toBe("bsb-1");
    expect(result.resolvedTruthState).toBe("true");
  });

  it("benchmarkSandboxResolve encodes # in belief ID", async () => {
    server.use(
      http.get(`${BASE_URL}/benchmark/sandbox/bsb-1/resolve/b%231`, () =>
        HttpResponse.json(BENCHMARK_SANDBOX),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.benchmarkSandboxResolve("bsb-1", "b#1");
    expect(result.sandboxId).toBe("bsb-1");
  });

  it("benchmarkSandboxDiscard", async () => {
    server.use(
      http.delete(`${BASE_URL}/benchmark/sandbox/bsb-1`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const client = new MnemeBrainClient(BASE_URL);
    await client.benchmarkSandboxDiscard("bsb-1");
  });

  it("benchmarkAttack", async () => {
    server.use(
      http.post(`${BASE_URL}/benchmark/attack`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("attacker_id", "b-1");
        expect(body).toHaveProperty("target_id", "b-2");
        expect(body).toHaveProperty("attack_type", "undermining");
        expect(body).toHaveProperty("weight", 0.5);
        return HttpResponse.json({
          edge_id: "ae-1",
          attacker_id: "b-1",
          target_id: "b-2",
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.benchmarkAttack("b-1", "b-2");
    expect(result.edgeId).toBe("ae-1");
    expect(result.attackerId).toBe("b-1");
    expect(result.targetId).toBe("b-2");
  });

  it("benchmarkAttack with custom type and weight", async () => {
    server.use(
      http.post(`${BASE_URL}/benchmark/attack`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("attack_type", "contradicts");
        expect(body).toHaveProperty("weight", 0.9);
        return HttpResponse.json({
          edge_id: "ae-2",
          attacker_id: "b-3",
          target_id: "b-4",
        });
      }),
    );
    const client = new MnemeBrainClient(BASE_URL);
    const result = await client.benchmarkAttack("b-3", "b-4", "contradicts", 0.9);
    expect(result.edgeId).toBe("ae-2");
  });
});
