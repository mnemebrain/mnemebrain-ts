# mnemebrain

> TypeScript SDK for [MnemeBrain](https://mnemebrain.ai) — belief-based memory for AI agents.

[![CI](https://github.com/mnemebrain/mnemebrain-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/mnemebrain/mnemebrain-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mnemebrain)](https://www.npmjs.com/package/mnemebrain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Agents today store text. MnemeBrain stores **beliefs** — with evidence, confidence, provenance, and revision logic built on [Belnap four-valued logic](https://en.wikipedia.org/wiki/Four-valued_logic#Belnap).

## Install

```bash
npm install mnemebrain
```

Requires Node.js >= 18.

## Quick Start

```typescript
import { Brain } from "mnemebrain";

const brain = new Brain("my-agent", process.env.MNEMEBRAIN_URL ?? "http://localhost:8000");

// Store a belief with evidence
const belief = await brain.believe("User prefers dark mode", ["They toggled it on twice"]);
console.log(belief.truthState); // "true"
console.log(belief.confidence); // 0.63

// Query beliefs
const result = await brain.ask("What are the user's UI preferences?");
console.log(result.retrievedBeliefs); // ranked by confidence + similarity
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Belief** | A claim with a truth state (TRUE, FALSE, BOTH, NEITHER) |
| **Evidence** | Append-only supporting/attacking evidence with weight and decay |
| **Confidence** | Computed from evidence weights, decays over time |
| **Working Memory** | Scoped frames for multi-step reasoning |
| **Sandbox** | Isolated what-if environments for speculative reasoning |

## API

### Brain (High-Level)

```typescript
import { Brain } from "mnemebrain";
const brain = new Brain("my-agent", "http://localhost:8000");

await brain.believe(claim, ["evidence string"]);
const result = await brain.ask(query);
// result.retrievedBeliefs: Array<{ claim, confidence, similarity }>
```

### MnemeBrainClient (Full API)

```typescript
import { MnemeBrainClient, EvidenceInput, Polarity } from "mnemebrain";

const client = new MnemeBrainClient("http://localhost:8000");

// Health check
await client.health();

// Belief operations
await client.believe("claim", [
  new EvidenceInput({ content: "source", polarity: Polarity.SUPPORTS }),
]);
await client.search("query");
await client.explain("claim");
await client.retract(evidenceId);
await client.revise(beliefId, [new EvidenceInput({ content: "new info" })]);

// Working memory frames
const frame = await client.frameOpen("agent-1");
await client.frameAdd(frame.frameId, "claim-1");
const ctx = await client.frameContext(frame.frameId);
await client.frameCommit(frame.frameId);
await client.frameClose(frame.frameId);

// List & filter beliefs
await client.listBeliefs({ truthState: "TRUE", minConfidence: 0.5 });
```

### V4 Sub-Clients

```typescript
// Sandboxes — isolated what-if reasoning
const sandbox = await client.sandbox.fork("experiment-1");
await client.sandbox.assume(sandbox.sandboxId, "hypothesis");
const diff = await client.sandbox.diff(sandbox.sandboxId);
await client.sandbox.commit(sandbox.sandboxId);

// Revision — policy-driven belief updates
await client.revision.setPolicy({ maxRevisionsPerHour: 10 });
await client.revision.revise(beliefId, { evidenceItems: [...] });

// Attacks — structured argumentation
await client.attacks.create({ sourceId, targetId, attackType: "REBUTS" });

// Goals & Policies
await client.goals.create({ description: "Learn user preferences" });
await client.policies.create({ name: "privacy", rules: [...] });
```

## Running the Backend

```bash
cd backend
uv sync --extra dev
uv run python -m mnemebrain
# Server starts at http://localhost:8000
```

## Development

```bash
npm install
npm run build        # Compile TypeScript
npm test             # Unit tests
npm run typecheck    # Type checking
npm run test:coverage # Coverage (100% enforced)

# Integration/E2E (requires running backend)
npm run test:integration
npm run test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full details.

## License

[MIT](LICENSE)
