/**
 * End-to-end workflow tests for the MnemeBrain TypeScript SDK.
 *
 * Tests complete user journeys: believe -> search -> explain -> revise -> retract
 * and the WorkingMemoryFrame lifecycle.
 *
 * Prerequisites:
 *   - MnemeBrain backend running at http://localhost:8000
 *   - Set MNEMEBRAIN_E2E=1 to enable
 *
 * Run:
 *   MNEMEBRAIN_E2E=1 npx vitest run tests/e2e/
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Brain, MnemeBrainClient } from "../../src/client.js";
import { EvidenceInput } from "../../src/models.js";

const BASE_URL = process.env.MNEMEBRAIN_URL ?? "http://localhost:8000";
const ENABLED = process.env.MNEMEBRAIN_E2E === "1";

describe.skipIf(!ENABLED)("E2E: Belief lifecycle", () => {
  let client: MnemeBrainClient;
  let beliefId: string;
  let evidenceId: string;

  beforeAll(() => {
    client = new MnemeBrainClient(BASE_URL);
  });

  it("step 1: store a belief with evidence", async () => {
    const result = await client.believe(
      "e2e test: the user prefers dark mode",
      [
        new EvidenceInput({
          sourceRef: "e2e_msg_1",
          content: "User said: I always use dark mode",
          polarity: "supports",
          weight: 0.85,
          reliability: 0.9,
        }),
      ],
      "preference",
      ["e2e-test", "ui-preference"],
      "e2e-agent",
    );

    expect(result.id).toBeTruthy();
    expect(result.truthState).toBe("true");
    expect(result.confidence).toBeGreaterThan(0);
    beliefId = result.id;
  });

  it("step 2: search for the belief semantically", async () => {
    const result = await client.search("dark mode preference", 5);
    expect(result.results.length).toBeGreaterThan(0);

    const match = result.results.find((r) => r.claim.includes("dark mode"));
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.5);
  });

  it("step 3: explain the belief", async () => {
    const explanation = await client.explain(
      "e2e test: the user prefers dark mode",
    );
    expect(explanation).not.toBeNull();
    expect(explanation!.truthState).toBe("true");
    expect(explanation!.supporting.length).toBeGreaterThan(0);
    expect(explanation!.supporting[0].sourceRef).toBe("e2e_msg_1");
    evidenceId = explanation!.supporting[0].id;
  });

  it("step 4: revise the belief with new evidence", async () => {
    const result = await client.revise(
      beliefId,
      new EvidenceInput({
        sourceRef: "e2e_msg_2",
        content: "User changed system theme to dark",
        polarity: "supports",
        weight: 0.9,
        reliability: 0.95,
      }),
    );

    expect(result.id).toBe(beliefId);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("step 5: retract evidence and observe belief update", async () => {
    const results = await client.retract(evidenceId);
    expect(results.length).toBeGreaterThan(0);

    const updated = results.find((r) => r.id === beliefId);
    expect(updated).toBeDefined();
  });

  it("step 6: list beliefs with filters", async () => {
    const result = await client.listBeliefs({
      beliefType: "preference",
      tag: "e2e-test",
      limit: 10,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.beliefs)).toBe(true);
  });
});

describe.skipIf(!ENABLED)("E2E: WorkingMemoryFrame lifecycle", () => {
  let client: MnemeBrainClient;

  beforeAll(async () => {
    client = new MnemeBrainClient(BASE_URL);

    // Seed a belief for the frame to load
    await client.believe(
      "e2e test: auth uses JWT tokens",
      [
        new EvidenceInput({
          sourceRef: "e2e_arch_doc",
          content: "Architecture doc specifies JWT for auth",
        }),
      ],
      "fact",
      ["e2e-test"],
    );
  });

  it("full frame lifecycle: open -> add -> scratchpad -> context -> commit -> close", async () => {
    // Open frame
    const frame = await client.frameOpen(
      "should we refactor auth?",
      ["e2e test: auth uses JWT tokens"],
      600,
      "e2e-planner",
    );
    expect(frame.frameId).toBeTruthy();
    expect(frame.beliefsLoaded).toBeGreaterThanOrEqual(0);

    // Add belief to frame
    const snapshot = await client.frameAdd(
      frame.frameId,
      "e2e test: auth uses JWT tokens",
    );
    expect(snapshot.beliefId).toBeTruthy();

    // Write to scratchpad
    await client.frameScratchpad(
      frame.frameId,
      "analysis_step_1",
      "JWT is industry standard, no refactor needed",
    );

    // Get context
    const ctx = await client.frameContext(frame.frameId);
    expect(ctx.query).toBe("should we refactor auth?");
    expect(ctx.scratchpad).toHaveProperty("analysis_step_1");
    expect(ctx.stepCount).toBeGreaterThanOrEqual(0);

    // Commit new belief from reasoning
    const commitResult = await client.frameCommit(frame.frameId, [
      {
        claim: "e2e test: auth refactor not needed",
        evidence: [],
        belief_type: "inference",
      },
    ]);
    expect(commitResult.frameId).toBe(frame.frameId);
    expect(commitResult.beliefsCreated).toBe(1);
  });

  it("frame close without commit", async () => {
    const frame = await client.frameOpen("temporary reasoning", [], 60);
    expect(frame.frameId).toBeTruthy();
    await client.frameClose(frame.frameId);
  });
});

describe.skipIf(!ENABLED)("E2E: Phase 5 — Consolidation & HippoRAG", () => {
  let client: MnemeBrainClient;

  beforeAll(async () => {
    client = new MnemeBrainClient(BASE_URL);

    // Seed several related beliefs for consolidation
    for (let i = 0; i < 5; i++) {
      await client.believe(
        `e2e test: consolidation fact ${i}`,
        [
          new EvidenceInput({
            sourceRef: `e2e_consol_${i}`,
            content: `Evidence for consolidation test ${i}`,
          }),
        ],
        "inference",
        ["e2e-test", "consolidation"],
      );
    }
  });

  it("step 1: run consolidation cycle", async () => {
    const result = await client.consolidate();
    expect(typeof result.semanticBeliefsCreated).toBe("number");
    expect(typeof result.episodicsPruned).toBe("number");
    expect(typeof result.clustersFound).toBe("number");
  });

  it("step 2: check memory tier of a belief", async () => {
    const belief = await client.believe(
      "e2e test: tier check target",
      [
        new EvidenceInput({
          sourceRef: "e2e_tier",
          content: "Tier verification evidence",
        }),
      ],
      "fact",
      ["e2e-test"],
    );

    const tier = await client.getMemoryTier(belief.id);
    expect(tier.beliefId).toBe(belief.id);
    expect(typeof tier.memoryTier).toBe("string");
    expect(typeof tier.consolidatedFromCount).toBe("number");
  });

  it("step 3: multi-hop retrieval", async () => {
    const result = await client.queryMultihop("consolidation test");
    expect(Array.isArray(result.results)).toBe(true);
    for (const item of result.results) {
      expect(item.beliefId).toBeTruthy();
      expect(typeof item.confidence).toBe("number");
      expect(typeof item.truthState).toBe("string");
    }
  });

  it("step 4: benchmark sandbox fork, assume, resolve, discard", async () => {
    const fork = await client.benchmarkSandboxFork("e2e-benchmark");
    expect(fork.sandboxId).toBeTruthy();
    expect(typeof fork.canonicalUnchanged).toBe("boolean");

    // Create a belief to work with
    const belief = await client.believe(
      "e2e test: benchmark target",
      [
        new EvidenceInput({
          sourceRef: "e2e_bench",
          content: "Benchmark evidence",
        }),
      ],
      "fact",
    );

    const assumed = await client.benchmarkSandboxAssume(
      fork.sandboxId,
      belief.id,
      "false",
    );
    expect(assumed.sandboxId).toBe(fork.sandboxId);

    const resolved = await client.benchmarkSandboxResolve(
      fork.sandboxId,
      belief.id,
    );
    expect(resolved.sandboxId).toBe(fork.sandboxId);

    await client.benchmarkSandboxDiscard(fork.sandboxId);
  });

  it("step 5: benchmark attack", async () => {
    const b1 = await client.believe(
      "e2e test: benchmark attacker",
      [new EvidenceInput({ sourceRef: "e2e_a", content: "A" })],
      "fact",
    );
    const b2 = await client.believe(
      "e2e test: benchmark target for attack",
      [new EvidenceInput({ sourceRef: "e2e_b", content: "B" })],
      "fact",
    );

    const result = await client.benchmarkAttack(b1.id, b2.id, "contradicts", 0.8);
    expect(result.edgeId).toBeTruthy();
    expect(result.attackerId).toBe(b1.id);
    expect(result.targetId).toBe(b2.id);
  });
});

describe.skipIf(!ENABLED)("E2E: Brain high-level API", () => {
  let brain: Brain;

  beforeAll(() => {
    brain = new Brain("e2e-experiment", BASE_URL);
  });

  it("believe and ask round-trip", async () => {
    await brain.believe(
      "e2e test: Python is dynamically typed",
      ["e2e_wiki_python"],
      0.95,
      "fact",
    );

    const result = await brain.ask("Is Python dynamically typed?");
    expect(result.queryId).toBeTruthy();
    expect(result.retrievedBeliefs.length).toBeGreaterThan(0);

    const match = result.retrievedBeliefs.find((b) =>
      b.claim.includes("dynamically typed"),
    );
    expect(match).toBeDefined();
    expect(match!.confidence).toBeGreaterThan(0);
  });

  it("feedback is a no-op", () => {
    brain.feedback("some-id", "COMPLETED");
  });
});
