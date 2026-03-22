// Watch CRUD benchmark.
// Tests authenticated DB write/read performance.
//
// Run:
//   K6_JWT=<token> k6 run --vus 1 --duration 30s backend/benchmarks/load/watches.js
//   K6_JWT=<token> k6 run \
//     --out json=results/watches-<date>.json watches.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_URL, JWT, authHeaders, defaultThresholds } from "./config.js";

const listDuration = new Trend("watches_list_duration", true);
const createDuration = new Trend("watches_create_duration", true);
const deleteDuration = new Trend("watches_delete_duration", true);

export const options = {
  thresholds: defaultThresholds,
};

// SKUs to cycle through — pick a few that exist in the catalog
// These are placeholders; replace with real SKUs from your DB
const testSkus = [
  "14741478",
  "14961539",
  "15086742",
];

export default function () {
  if (!JWT) {
    console.error("K6_JWT is required. Export a valid JWT token.");
    return;
  }

  // 1. List current watches
  const listRes = http.get(`${BASE_URL}/api/watches`, authHeaders);
  listDuration.add(listRes.timings.duration);
  check(listRes, {
    "list 200": (r) => r.status === 200,
  });

  // 2. Create a watch (pick a random SKU)
  const sku = testSkus[Math.floor(Math.random() * testSkus.length)];
  const createRes = http.post(
    `${BASE_URL}/api/watches`,
    JSON.stringify({ sku }),
    authHeaders,
  );
  createDuration.add(createRes.timings.duration);
  const created = check(createRes, {
    "create 200 or 409": (r) => r.status === 200 || r.status === 409,
  });

  // 3. List again to verify
  const listRes2 = http.get(`${BASE_URL}/api/watches`, authHeaders);
  check(listRes2, {
    "list after create 200": (r) => r.status === 200,
  });

  // 4. Delete the watch we just created (cleanup)
  if (created && createRes.status === 200) {
    const deleteRes = http.del(
      `${BASE_URL}/api/watches/${sku}`,
      null,
      authHeaders,
    );
    deleteDuration.add(deleteRes.timings.duration);
    check(deleteRes, {
      "delete 204": (r) => r.status === 204,
    });
  }

  sleep(1);
}
