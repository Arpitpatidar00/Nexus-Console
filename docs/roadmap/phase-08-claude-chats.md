# Phase 8: Claude Chats Upgrades — Specification

> **Phase:** P8  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 8 deepens developer productivity around Claude Code CLI history:

1. **Full-Text Search:** High-performance search across all project session transcripts (`.jsonl`), highlighting query snippets and matching prompt context.
2. **Session Resume:** One-click "Resume in Terminal" command that opens the interactive PTY drawer with `claude --resume <sessionId>` and sets working directory to the project root. Strict UUID format validation.
3. **Markdown Export:** Turn multi-turn AI coding transcripts into clean, readable GitHub-flavored markdown with collapsible tool invocations.
4. **Token Usage & Economics:** Analyzes per-turn token usage (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) to provide estimated costs and token volume per project.
5. **Context Analysis (Read-Only):** Scans the context window for a session, categorizing memory consumption (large tool outputs, system instructions, user prompts) and advising `/compact` when near capacity.

---

## 2. IPC Commands (`src-tauri/src/commands/archiver.rs`)

- `claude_search_transcripts`: Query all transcripts for keyword matches with text snippets.
- `claude_export_markdown`: Convert a session transcript into a downloadable or savable markdown file.
- `claude_session_context`: Analyze token and byte weights of tool results and context items.
- `claude_project_usage`: Weekly aggregated token usage and estimated spend per project.

---

## 3. Safety Constraints

- Transcripts are strictly read-only; never mutated or trimmed in-place.
- Session IDs validated strictly (`^[a-zA-Z0-9_-]+$`) before interpolation into resume commands.
- Token costs clearly labeled as estimates based on model metadata.
