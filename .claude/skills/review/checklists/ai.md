# AI checklist

Applies when the diff touches an LLM call, a prompt, intent parsing, retrieval, or embeddings — and in depth with `/review ai`. Pipeline contract and file map: `docs/specs/rag.md`; the eval gate and caching rules are in `rag.md`.

State each finding as its effect on quality, latency, cost, or reliability. Prompt injection, data leaking to the model, or a broken pipeline is a BLOCK. Claims about quality need eval scores; suggest `/eval-pipeline`, never run it unasked.

- **AI-1** User input is delimited in the prompt and can't override the system instructions.
- **AI-2** Model output is parsed robustly — structured outputs or `strict` tools, a defined path for malformed responses.
- **AI-3** 429, 5xx, and timeouts degrade gracefully: bounded retries with backoff, then a fallback the user can see.
- **AI-4** The retrieval query comes from the parsed intent, not the raw message; candidate count and context size are deliberate.
- **AI-5** The model fits the task (Haiku for parsing and curation); temperature fits it (0 for parsing); no LLM call where deterministic code suffices.
- **AI-6** A prompt change states its token delta and per-call cost; anything above ~$0.01 per query is flagged.
- **AI-7** Each stage (intent, retrieval, curation) is testable with the LLM mocked at its boundary.
- **AI-8** A prompt diff is shown old → new, and the eval set still covers the behavior it changes.
