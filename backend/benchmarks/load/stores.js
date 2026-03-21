// Store discovery + preferences benchmark.
// Tests geolocation queries and authenticated store preference CRUD.
//
// Run:
//   K6_JWT=<token> k6 run --vus 1 --duration 30s backend/benchmarks/load/stores.js
//   K6_JWT=<token> k6 run --out json=backend/benchmarks/load/results/stores-<date>.json backend/benchmarks/load/stores.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_URL, JWT, authHeaders, publicHeaders, defaultThresholds } from "./config.js";

const nearbyDuration = new Trend("stores_nearby_duration", true);
const prefListDuration = new Trend("stores_pref_list_duration", true);
const prefAddDuration = new Trend("stores_pref_add_duration", true);
const prefRemoveDuration = new Trend("stores_pref_remove_duration", true);

export const options = {
  thresholds: defaultThresholds,
};

// Montreal-area coordinates for nearby queries
const locations = [
  { lat: 45.5017, lng: -73.5673 },  // Downtown Montreal
  { lat: 45.5235, lng: -73.5953 },  // Mile End
  { lat: 45.4628, lng: -73.5825 },  // Verdun
  { lat: 46.8139, lng: -71.2080 },  // Quebec City
];

export default function () {
  // 1. Nearby stores (public, geolocation query)
  const loc = locations[Math.floor(Math.random() * locations.length)];
  const nearbyRes = http.get(
    `${BASE_URL}/api/stores/nearby?lat=${loc.lat}&lng=${loc.lng}&limit=5`,
    publicHeaders,
  );
  nearbyDuration.add(nearbyRes.timings.duration);
  check(nearbyRes, {
    "nearby 200": (r) => r.status === 200,
  });

  if (!JWT) {
    sleep(1);
    return;
  }

  // 2. List current preferences
  const listRes = http.get(`${BASE_URL}/api/stores/preferences`, authHeaders);
  prefListDuration.add(listRes.timings.duration);
  check(listRes, {
    "pref list 200": (r) => r.status === 200,
  });

  // 3. Add a store preference (pick from nearby results)
  const nearbyBody = JSON.parse(nearbyRes.body);
  if (nearbyBody.length > 0) {
    const storeId = nearbyBody[0].saq_store_id;
    const addRes = http.post(
      `${BASE_URL}/api/stores/preferences`,
      JSON.stringify({ saq_store_id: storeId }),
      authHeaders,
    );
    prefAddDuration.add(addRes.timings.duration);
    const added = check(addRes, {
      "pref add 200 or 409": (r) => r.status === 200 || r.status === 409,
    });

    // 4. Remove the preference we just added (cleanup)
    if (added && addRes.status === 200) {
      const removeRes = http.del(
        `${BASE_URL}/api/stores/preferences/${storeId}`,
        null,
        authHeaders,
      );
      prefRemoveDuration.add(removeRes.timings.duration);
      check(removeRes, {
        "pref remove 204": (r) => r.status === 204,
      });
    }
  }

  sleep(1);
}
