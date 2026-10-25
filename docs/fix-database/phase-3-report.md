# Phase 3 — Cross-Database Relationship Detection and Mapping Correctness

## Verdict

**PASS**

## Implemented

1. **Persistent Custom Application Relationships (`store.rs`, `commands/databases.rs`)**:
   - Backend data model `DbCustomMapping` and `DbRejectedCandidate` persisted in `DbStore` with group-scoping and serde defaults.
   - Store operations: `add_custom_mapping`, `remove_custom_mapping`, `list_custom_mappings`, `add_rejected_candidate`, `remove_rejected_candidate`, `list_rejected_candidates`.
   - Lifecycle reconciliation: `remove_connection`, `remove_group`, and `move_connection` safely delete associated custom mappings and candidate rejections, preventing cross-group leakage and orphan references.
   - IPC Tauri commands registered and tested:
     - `db_list_custom_mappings`, `db_save_custom_mapping`, `db_delete_custom_mapping`
     - `db_list_rejected_candidates`, `db_reject_candidate`, `db_unreject_candidate`
2. **Ambiguity Resolution & Transparent Provenance (`relations.ts`)**:
   - Upgraded `Link` interface with `provenance` (`declared` | `inferred` | `configured`), `status` (`active` | `ambiguous` | `incompatible` | `rejected` | `stale`), `compatibility` (`compatible` | `incompatible` | `unknown`), `compatibilityReason`, `candidates: RelationCandidate[]`, `mappingId`, and `notes`.
   - Closed **ISS-01**: Replaced silent first-match dropping with explicit ambiguity detection. When multiple candidates match across services, `crossDbLinks` flags the relation with `status: 'ambiguous'` and attaches all candidates for explicit user resolution.
3. **Type Compatibility Classifier (`relations.ts`)**:
   - Closed **ISS-07**: Added `classifyTypeCompatibility(sourceType, targetType)`. Incompatible pairs (e.g. integer vs MongoDB ObjectId, UUID vs integer, boolean vs text) are flagged as `incompatible` with explanatory reasons and suppressed from spurious inferred edge rendering.
4. **Interactive UI Workflows**:
   - `AmbiguousRelationsDialog`: Allows users to inspect ambiguous cross-database candidate ties, select the intended target table/column, or reject candidate false-positives.
   - `CustomMappingsDialog`: Empowers users to configure explicit application-level cross-service links across microservice databases with custom notes and one-click deletion.
   - `MapView`: Updated with Badges showing Ambiguous candidate counts and Custom mapping counts with accessible trigger dialogs.
   - Accessible SVG Diagram (`diagramSvg.ts`): Visual distinction between declared (solid accent), configured (solid teal/emerald), inferred (dashed), and ambiguous (dashed warning/amber) relationship edges with descriptive tooltip titles and ARIA metadata.

## Files Changed

- `src-tauri/src/services/databases/store.rs`
- `src-tauri/src/commands/databases.rs`
- `src-tauri/src/lib.rs`
- `src/shared/tauri/commands.ts`
- `src/features/databases/api/databases.schema.ts`
- `src/features/databases/api/keys.ts`
- `src/features/databases/api/useDatabases.ts`
- `src/features/databases/utils/relations.ts`
- `src/features/databases/utils/relations.test.ts`
- `src/features/databases/utils/diagram.ts`
- `src/features/databases/utils/diagram.test.ts`
- `src/features/databases/utils/diagramSvg.ts`
- `src/features/databases/components/AmbiguousRelationsDialog/AmbiguousRelationsDialog.tsx` (created)
- `src/features/databases/components/AmbiguousRelationsDialog/index.ts` (created)
- `src/features/databases/components/CustomMappingsDialog/CustomMappingsDialog.tsx` (created)
- `src/features/databases/components/CustomMappingsDialog/index.ts` (created)
- `src/features/databases/components/MapView/MapView.tsx`
- `src/features/databases/pages/DatabasesPage.tsx`

## Tests Added/Updated

- `src-tauri/src/services/databases/store.rs`:
  - `custom_mappings_and_rejections_lifecycle_and_reconciliation`: Verifies CRUD operations, scoping by group, and cascading cleanup when connections or groups are deleted or moved.
- `src/features/databases/utils/relations.test.ts`:
  - Cross-database heuristic detection with declared/inferred/configured provenance.
  - Multi-candidate ambiguity detection preserving all candidates.
  - Type incompatibility filtering (integer vs ObjectId, UUID vs int).
  - Explicit custom mappings overrides and stale mapping detection.
  - Candidate rejection persistence and filtering.

## Verification Commands

| Command                                                                          | Outcome                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 423 passed in lib, 4 guards passed, 82 parsers passed, 18 payloads passed         |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 0 warnings                                                                        |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                      | 0 formatting issues                                                               |
| `npm run lint`                                                                   | 0 errors, 0 warnings (723 files)                                                  |
| `npm run typecheck`                                                              | 0 errors                                                                          |
| `npm test`                                                                       | 70 test files passed, 310 tests passed (including tokens guard & relations suite) |

## Edge Cases Verified

- **Candidate tie-breaking**: When two target tables both have `id`, `crossDbLinks` preserves both candidates and flags the edge as ambiguous instead of silently discarding all but the first.
- **Heterogeneous column types**: Inferred FK heuristic between `user_id (int4)` and `_id (ObjectId)` is flagged as incompatible and rejected.
- **Connection deletion cascade**: Deleting or moving a connection automatically purges custom mappings linked to it so stale cross-database links do not point to nonexistent connections.
