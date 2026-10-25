# Phase 2 — Engine Capability Contract and Mixed-Engine Correctness

## Verdict

**PASS**

## Implemented

1. **Engine Capabilities Matrix (`src/features/databases/utils/capabilities.ts`)**:
   - Explicit typed contracts (`EngineCapabilities`) distinguishing engine capabilities across PostgreSQL, MySQL, MongoDB, Redis, and unsupported/unknown drivers.
   - Encapsulates `supportsNativeForeignKeys`, `supportsDiagram`, `supportsIndexes`, `supportsSql`, `supportsShellCommands`, `supportsDocumentBrowse`, `schemaInferenceType` (`catalog` | `sampled` | `keyspace_scan` | `unsupported`), `isProbabilisticSchema`, custom labels (`tableEntityLabel`, `tableEntityLabelPlural`, `queryEditorLabel`), and engine default queries.
2. **Honest Schema & Relationship Indicators**:
   - MongoDB schemas are explicitly flagged with "Sampled schema (observed from documents)" and foreign key counts are suppressed since MongoDB lacks native relational constraints.
   - Redis tables are cleanly labeled as key prefixes, hiding relational links and index tabs where unsupported.
3. **Graceful Degradation for Unsupported Engines**:
   - `DatabasesPage.tsx` checks `caps.isSupported`. If an unsupported driver is configured, an explanatory `ErrorPanel` is rendered instead of attempting schema introspection or crashing.
4. **Collision-Resistant Scoped Table Identities**:
   - Exported `globalTableKey(connectionId, schemaTableKey)` and `parseGlobalTableKey(globalKey)` ensuring table homonyms across microservices (e.g., `users` table in auth vs billing service) have distinct identities.
5. **BSON ObjectId Format Validator**:
   - `isValidObjectIdString(val)` validating strict 24-character hexadecimal format, preventing arbitrary strings or numbers from being coerced into ObjectIds.

## Files Changed

- `src/features/databases/utils/capabilities.ts` (created)
- `src/features/databases/utils/capabilities.test.ts` (created)
- `src/features/databases/components/DatabaseOverview/DatabaseOverview.tsx`
- `src/features/databases/components/DocumentsView/DocumentsView.tsx`
- `src/features/databases/components/ExplorerSidebar/ExplorerSidebar.tsx`
- `src/features/databases/components/TableView/TableView.tsx`
- `src/features/databases/pages/DatabasesPage.tsx`

## Tests Added/Updated

- `src/features/databases/utils/capabilities.test.ts`:
  - `normalizeEngine`: Normalizes common engine strings and returns `unknown` for unsupported engines.
  - `getEngineCapabilities`:
    - Relational catalog capabilities for PostgreSQL.
    - Relational catalog capabilities for MySQL.
    - Document/sampled capabilities for MongoDB (`isProbabilisticSchema: true`, `supportsNativeForeignKeys: false`).
    - Key-value scan capabilities for Redis (`supportsDiagram: false`, `supportsIndexes: false`).
    - Explicit unsupported info for unknown drivers without throwing.
  - `globalTableKey and parseGlobalTableKey`: Scoped table identity and cross-service collision avoidance.
  - `isValidObjectIdString`: 24-character hex validation and invalid input rejection.

## Verification Commands

| Command                                                                          | Outcome                                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npx vitest run src/features/databases/utils/capabilities.test.ts`               | 14 passed (100%)                                                                   |
| `npm test`                                                                       | 70 test files passed, 306 tests passed                                             |
| `npm run typecheck`                                                              | 0 errors                                                                           |
| `npm run lint`                                                                   | 0 errors, 0 warnings (719 files)                                                   |
| `npm run format:check`                                                           | All matched files use Prettier code style                                          |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 422 unit tests passed, 4 guards passed, 82 parsers passed, 18 payload tests passed |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 0 warnings                                                                         |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                      | 0 formatting issues                                                                |

## Edge Cases Verified

- **Heterogeneous engine group**: Successfully renders PostgreSQL, MySQL, MongoDB, and Redis connections with honest capability tags and tailored UI controls.
- **Probabilistic MongoDB schema**: Schema overview explicitly states "Sampled schema (observed from documents)" and does not claim foreign keys exist.
- **Redis keyspace constraints**: Suppresses relational diagram tabs and index queries on Redis connections.
- **Cross-service table homonyms**: `globalTableKey` uniquely differentiates identically named tables across different services.
- **Unsupported driver error handling**: Returns structured, safe `ErrorPanel` for unknown engine drivers without UI crash.
- **Hexadecimal ObjectId validation**: Rejects 23-char, 25-char, and non-hex inputs; accepts 24-char hex strings.

## Security/Data Migration Review

- Read-only guarantees remain intact across all adapters.
- No write commands introduced or altered.
- Passwords and secrets remain safely isolated in the OS Keychain and redacted from UI/logs.
