/**
 * Integration tests for MnemeBrainClient against a live backend.
 *
 * Prerequisites:
 *   - MnemeBrain backend running at http://localhost:8000
 *   - Set MNEMEBRAIN_INTEGRATION=1 to enable
 *
 * Run:
 *   MNEMEBRAIN_INTEGRATION=1 npx vitest run tests/integration/
 */

import { describe, it, expect, beforeAll } from "vitest";
import { MnemeBrainClient, MnemeBrainError } from "../../src/client.js";
import { EvidenceInput } from "../../src/models.js";

const BASE_URL = process.env.MNEMEBRAIN_URL ?? "http://localhost:8000";
const ENABLED = process.env.MNEMEBRAIN_INTEGRATION === "1";

describe.skipIf(!ENABLED)("MnemeBrainClient integration", () => {
  let client: MnemeBrainClient;

  beforeAll(() => {
    client = new MnemeBrainClient(BASE_URL);
  });

  it("health check", async () => {
    const result = await client.health();
    expect(result).toHaveProperty("status");
  });

  it("believe and search round-trip", async () => {
    const belief = await client.believe(
      "integration test: TypeScript SDK works",
      [
        new EvidenceInput({
          sourceRef: "test_ts_sdk",
          content: "Automated integration test",
          polarity: "supports",
          weight: 0.9,
          reliability: 0.95,
        }),
      ],
      "fact",
      ["integration-test"],
      "ts-sdk-integration",
    );

    expect(belief.id).toBeTruthy();
    expect(belief.truthState).toBe("true");
    expect(typeof belief.confidence).toBe("number");

    const searchResult = await client.search("TypeScript SDK works", 5);
    expect(searchResult.results.length).toBeGreaterThan(0);

    const match = searchResult.results.find((r) =>
      r.claim.includes("TypeScript SDK works"),
    );
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0);
  });

  it("explain returns justification chain", async () => {
    const explanation = await client.explain(
      "integration test: TypeScript SDK works",
    );
    if (explanation) {
      expect(explanation.claim).toContain("TypeScript SDK works");
      expect(typeof explanation.confidence).toBe("number");
      expect(Array.isArray(explanation.supporting)).toBe(true);
    }
  });

  it("explain returns null for unknown claim", async () => {
    const result = await client.explain(
      "nonexistent claim that definitely does not exist 9999",
    );
    expect(result).toBeNull();
  });

  it("revise adds evidence to existing belief", async () => {
    const belief = await client.believe(
      "integration test: revise target",
      [
        new EvidenceInput({
          sourceRef: "test_revise_1",
          content: "Initial evidence",
        }),
      ],
      "inference",
      ["integration-test"],
    );

    const revised = await client.revise(
      belief.id,
      new EvidenceInput({
        sourceRef: "test_revise_2",
        content: "Additional confirming evidence",
        weight: 0.95,
        reliability: 0.95,
      }),
    );

    expect(revised.id).toBe(belief.id);
    expect(typeof revised.confidence).toBe("number");
  });

  it("list beliefs with filters", async () => {
    const result = await client.listBeliefs({
      truthState: "true",
      limit: 10,
    });

    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.beliefs)).toBe(true);
    expect(result.limit).toBe(10);
  });

  it("list beliefs returns paginated result", async () => {
    const page1 = await client.listBeliefs({ limit: 2, offset: 0 });
    const page2 = await client.listBeliefs({ limit: 2, offset: 2 });

    expect(page1.offset).toBe(0);
    expect(page2.offset).toBe(2);
    if (page1.total > 2) {
      expect(page1.beliefs[0]?.id).not.toBe(page2.beliefs[0]?.id);
    }
  });

  it("consolidate runs a cycle", async () => {
    const result = await client.consolidate();
    expect(typeof result.semanticBeliefsCreated).toBe("number");
    expect(typeof result.episodicsPruned).toBe("number");
    expect(typeof result.clustersFound).toBe("number");
  });

  it("getMemoryTier returns tier metadata", async () => {
    // First create a belief to query
    const belief = await client.believe(
      "integration test: memory tier target",
      [
        new EvidenceInput({
          sourceRef: "test_tier",
          content: "Tier test evidence",
        }),
      ],
      "fact",
      ["integration-test"],
    );

    const tier = await client.getMemoryTier(belief.id);
    expect(tier.beliefId).toBe(belief.id);
    expect(typeof tier.memoryTier).toBe("string");
    expect(typeof tier.consolidatedFromCount).toBe("number");
  });

  it("queryMultihop returns results", async () => {
    const result = await client.queryMultihop("TypeScript SDK");
    expect(Array.isArray(result.results)).toBe(true);
    for (const item of result.results) {
      expect(item.beliefId).toBeTruthy();
      expect(typeof item.claim).toBe("string");
      expect(typeof item.confidence).toBe("number");
      expect(typeof item.truthState).toBe("string");
    }
  });

  it("HTTP error for invalid endpoint", async () => {
    const badClient = new MnemeBrainClient(BASE_URL);
    try {
      await (badClient as unknown as { request: (opts: { path: string }) => Promise<unknown> })
        .request({ path: "/nonexistent-endpoint" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MnemeBrainError);
    }
  });
});
