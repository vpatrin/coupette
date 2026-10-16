# RAG checklist

Applies when the diff touches the paths in `rules/rag.md`. Prompt, retrieval, and embedding changes are the risky lane.

- **RAG-1** Prompt, retrieval, or embedding-pipeline change: `make eval` scores (before and after) are in the evidence table. Refactors and log changes say "eval waived" explicitly.
- **RAG-2** Embedding model or dimension change: re-embedding cost surfaced and Victor's go-ahead recorded in the PR Decisions.
- **RAG-3** A static prompt prefix above the cacheable minimum (4096 tokens on Haiku 4.5) uses `cache_control`.
- **RAG-4** Prompt changes report the token delta in the PR Decisions.
- **RAG-5** Retrieval still works for a user with no behavioral signal (cold start).
