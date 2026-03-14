import { describe, it, expect } from "vitest";
import {
  TruthState,
  BeliefType,
  Polarity,
  EvidenceInput,
} from "../src/models.js";

describe("Enums", () => {
  it("TruthState values", () => {
    expect(TruthState.TRUE).toBe("true");
    expect(TruthState.FALSE).toBe("false");
    expect(TruthState.BOTH).toBe("both");
    expect(TruthState.NEITHER).toBe("neither");
  });

  it("BeliefType values", () => {
    expect(BeliefType.FACT).toBe("fact");
    expect(BeliefType.PREFERENCE).toBe("preference");
    expect(BeliefType.INFERENCE).toBe("inference");
    expect(BeliefType.PREDICTION).toBe("prediction");
  });

  it("Polarity values", () => {
    expect(Polarity.SUPPORTS).toBe("supports");
    expect(Polarity.ATTACKS).toBe("attacks");
  });
});

describe("EvidenceInput", () => {
  it("toDict without scope", () => {
    const ev = new EvidenceInput({ sourceRef: "ref1", content: "test content" });
    const d = ev.toDict();
    expect(d).toEqual({
      source_ref: "ref1",
      content: "test content",
      polarity: "supports",
      weight: 0.7,
      reliability: 0.8,
    });
    expect(d).not.toHaveProperty("scope");
  });

  it("toDict with scope", () => {
    const ev = new EvidenceInput({
      sourceRef: "ref1",
      content: "test content",
      polarity: "attacks",
      weight: 0.5,
      reliability: 0.6,
      scope: "global",
    });
    const d = ev.toDict();
    expect(d.scope).toBe("global");
    expect(d.polarity).toBe("attacks");
    expect(d.weight).toBe(0.5);
    expect(d.reliability).toBe(0.6);
  });

  it("defaults", () => {
    const ev = new EvidenceInput({ sourceRef: "r", content: "c" });
    expect(ev.polarity).toBe("supports");
    expect(ev.weight).toBe(0.7);
    expect(ev.reliability).toBe(0.8);
    expect(ev.scope).toBeUndefined();
  });
});
