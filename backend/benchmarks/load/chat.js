// Chat / recommendation pipeline benchmark.
// LLM-bound — run at LOW VUs only (1-2) to avoid burning Claude credits.
//
// Measures the full pipeline: intent parsing → embedding → retrieval → curation.
//
// Run:
//   K6_JWT=<token> k6 run --vus 1 --iterations 3 backend/benchmarks/load/chat.js
//   K6_JWT=<token> k6 run \
//     --out json=results/chat-<date>.json chat.js
//
// Cost estimate: ~$0.01 per iteration (Haiku input + output tokens).

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_URL, JWT, authHeaders, llmThresholds } from "./config.js";

const createSessionDuration = new Trend("chat_create_session_duration", true);
const messageDuration = new Trend("chat_message_duration", true);
const listSessionsDuration = new Trend("chat_list_sessions_duration", true);
const deleteSessionDuration = new Trend("chat_delete_session_duration", true);

export const options = {
  // Safe defaults — override on CLI for stress testing
  vus: 1,
  iterations: 3,
  thresholds: llmThresholds,
};

// Queries that exercise different intent routes (first messages only)
const queries = [
  // Recommendation intent (full RAG pipeline)
  "Recommend a red wine under $25 for pasta night",
  "What's a good Bordeaux for a dinner party?",
  // Wine chat intent (sommelier, no RAG)
  "What's the difference between Syrah and Shiraz?",
];

export default function () {
  if (!JWT) {
    console.error("K6_JWT is required. Export a valid JWT token.");
    return;
  }

  // 1. Create a new chat session with first message
  const query = queries[Math.floor(Math.random() * queries.length)];
  const createRes = http.post(
    `${BASE_URL}/api/chat/sessions`,
    JSON.stringify({ message: query }),
    authHeaders,
  );
  createSessionDuration.add(createRes.timings.duration);

  const sessionCreated = check(createRes, {
    "create session 200": (r) => r.status === 200,
  });

  if (!sessionCreated) {
    console.error(`Session create failed: ${createRes.status} ${createRes.body}`);
    return;
  }

  const session = JSON.parse(createRes.body);
  const sessionId = session.id;

  // 2. Send a follow-up message (multi-turn)
  const followUp = "Can you suggest something cheaper?";
  const msgRes = http.post(
    `${BASE_URL}/api/chat/sessions/${sessionId}/messages`,
    JSON.stringify({ message: followUp }),
    authHeaders,
  );
  messageDuration.add(msgRes.timings.duration);
  check(msgRes, {
    "follow-up 200": (r) => r.status === 200,
  });

  // 3. List sessions (read performance)
  const listRes = http.get(`${BASE_URL}/api/chat/sessions`, authHeaders);
  listSessionsDuration.add(listRes.timings.duration);
  check(listRes, {
    "list sessions 200": (r) => r.status === 200,
  });

  // 4. Cleanup — delete the session we created
  const deleteRes = http.del(
    `${BASE_URL}/api/chat/sessions/${sessionId}`,
    null,
    authHeaders,
  );
  deleteSessionDuration.add(deleteRes.timings.duration);
  check(deleteRes, {
    "delete session 204": (r) => r.status === 204,
  });

  // Longer pause — be gentle with LLM calls
  sleep(3);
}
