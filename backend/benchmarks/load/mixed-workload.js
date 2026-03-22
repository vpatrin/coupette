// Mixed workload benchmark — simulates realistic traffic distribution.
// Use this to find the break point between tiers.
//
// Traffic mix (approximating real usage):
//   70% search/browse (authenticated, DB-bound)
//   20% watches CRUD (authenticated, DB-bound)
//   10% chat (authenticated, LLM-bound)
//
// Run:
//   K6_JWT=<token> k6 run --vus 5 --duration 2m backend/benchmarks/load/mixed-workload.js
//   K6_JWT=<token> k6 run --stage 1m:10,2m:30,1m:50,1m:10 backend/benchmarks/load/mixed-workload.js
//
// Ramp example finds the break point by gradually increasing VUs.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { BASE_URL, JWT, authHeaders } from "./config.js";

const searchOps = new Counter("ops_search");
const watchOps = new Counter("ops_watches");
const chatOps = new Counter("ops_chat");

const searchLatency = new Trend("mixed_search_p95", true);
const watchLatency = new Trend("mixed_watches_p95", true);
const chatLatency = new Trend("mixed_chat_p95", true);

export const options = {
  thresholds: {
    "mixed_search_p95": ["p(95)<500"],
    "mixed_watches_p95": ["p(95)<500"],
    "mixed_chat_p95": ["p(95)<10000"],
    "http_req_failed": ["rate<0.05"],
  },
};

const searchQueries = [
  "",
  "?q=pinot",
  "?category[]=Vin%20rouge&max_price=20",
  "?country=Italie&sort=price_asc",
  "?available=true&limit=50",
];

function doSearch() {
  const qs = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  const res = http.get(`${BASE_URL}/api/products${qs}`, authHeaders);
  searchLatency.add(res.timings.duration);
  searchOps.add(1);
  check(res, { "search ok": (r) => r.status === 200 });
}

function doWatches() {
  if (!JWT) return doSearch(); // fall back if no token
  const res = http.get(`${BASE_URL}/api/watches`, authHeaders);
  watchLatency.add(res.timings.duration);
  watchOps.add(1);
  check(res, { "watches ok": (r) => r.status === 200 });
}

function doChat() {
  if (!JWT) return doSearch(); // fall back if no token

  const res = http.post(
    `${BASE_URL}/api/chat/sessions`,
    JSON.stringify({ message: "Suggest a wine under $20" }),
    authHeaders,
  );
  chatLatency.add(res.timings.duration);
  chatOps.add(1);

  const ok = check(res, { "chat ok": (r) => r.status === 200 });

  // Cleanup session
  if (ok) {
    const session = JSON.parse(res.body);
    http.del(`${BASE_URL}/api/chat/sessions/${session.id}`, null, authHeaders);
  }
}

export default function () {
  const roll = Math.random();

  if (roll < 0.7) {
    doSearch();
    sleep(0.5);
  } else if (roll < 0.9) {
    doWatches();
    sleep(1);
  } else {
    doChat();
    sleep(3); // longer pause after LLM calls
  }
}
