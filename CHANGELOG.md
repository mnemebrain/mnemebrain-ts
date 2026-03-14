# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.1] - 2026-03-14

### Fixed

- Fix `undefined` query params being sent as string `"undefined"` in HTTP requests
- Fix `Brain` quick start examples to match actual constructor signature

### Changed

- Tighten `prepublishOnly` to run typecheck + tests before build

## [0.1.0-alpha.0] - 2026-03-14

### Added

- Core `MnemeBrainClient` with full HTTP client for MnemeBrain API
- High-level `Brain` class for simplified agent integration
- Belnap 4-valued logic types (`TruthState`: TRUE, FALSE, BOTH, NEITHER)
- Belief operations: `believe`, `search`, `explain`, `retract`, `revise`
- Working memory frame support: `frameOpen`, `frameAdd`, `frameScratchpad`, `frameContext`, `frameCommit`, `frameClose`
- V4 sub-clients: `SandboxSubClient`, `RevisionSubClient`, `AttackSubClient`, `ReconsolidationSubClient`, `GoalSubClient`, `PolicySubClient`
- Phase 5 features: `consolidate`, `getMemoryTier`, `queryMultihop`
- Benchmark operations for evaluation harness
- `EvidenceInput` helper class with `toDict()` serialization
- Full TypeScript type definitions for all API responses (60+ interfaces)
- 100% unit test coverage with MSW-based HTTP mocking
- Integration and E2E test suites
- CI/CD workflows for testing and npm publishing
