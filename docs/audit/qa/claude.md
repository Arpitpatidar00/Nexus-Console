# QA Checklist — Claude Chats & AI Assistant

| Dimension          | Scenario                  | Verification Steps                                                                | Status |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Chat history & AI Explain | Reads local chat sessions; AI Explain streams from local Ollama (127.0.0.1:11434) |  [x]   |
| **Missing CLI**    | Ollama not running        | Graceful banner informing user to launch Ollama; no process execution fallback    |  [x]   |
| **Redaction**      | Secret masking            | API keys and tokens in terminal output masked before display in prompt preview    |  [x]   |
| **User Consent**   | Prompt confirmation       | Displays exact prompt preview with local delivery notice before dispatch          |  [x]   |
| **Cancel Confirm** | Dismiss modal             | Closing preview aborts HTTP request without sending data                          |  [x]   |
| **Theme**          | Light + Dark              | Markdown messages, code blocks, diff syntax highlighting legible in light/dark    |  [x]   |
