// Product search + filter benchmark.
// Auth required — tests DB query performance under load.
//
// Run:
//   k6 run --vus 1 --duration 30s backend/benchmarks/load/search.js
//   k6 run --vus 5 --duration 1m backend/benchmarks/load/search.js
//   k6 run --out json=backend/benchmarks/load/results/search-<date>.json backend/benchmarks/load/search.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { BASE_URL, authHeaders, defaultThresholds } from "./config.js";

// Custom metrics for per-endpoint tracking
const searchDuration = new Trend("search_duration", true);
const facetsDuration = new Trend("facets_duration", true);
const detailDuration = new Trend("detail_duration", true);
const searchFailRate = new Rate("search_fail_rate");

export const options = {
  thresholds: defaultThresholds,
};

// Sample filter combinations that hit different query paths
const searchScenarios = [
  { name: "unfiltered", qs: "" },
  { name: "by_category", qs: "?category[]=Vin%20rouge" },
  { name: "by_country", qs: "?country=France" },
  { name: "by_price_range", qs: "?min_price=15&max_price=30" },
  { name: "text_search", qs: "?q=cabernet" },
  { name: "combined_filters", qs: "?category[]=Vin%20rouge&country=France&max_price=25" },
  { name: "available_only", qs: "?available=true" },
  { name: "sorted_price", qs: "?sort=price_asc&limit=50" },
];

export default function () {
  // 1. Product search with random filter scenario
  const scenario = searchScenarios[Math.floor(Math.random() * searchScenarios.length)];
  const searchRes = http.get(
    `${BASE_URL}/api/products${scenario.qs}`,
    authHeaders,
  );

  searchDuration.add(searchRes.timings.duration);
  const searchBody = JSON.parse(searchRes.body);
  const searchOk = check(searchRes, {
    "search 200": (r) => r.status === 200,
    "search has items": () => Array.isArray(searchBody.products),
  });
  searchFailRate.add(!searchOk);

  // 2. Facets endpoint (filter counts)
  const facetsRes = http.get(
    `${BASE_URL}/api/products/facets`,
    authHeaders,
  );
  facetsDuration.add(facetsRes.timings.duration);
  check(facetsRes, {
    "facets 200": (r) => r.status === 200,
  });

  // 3. Product detail by SKU (grab one from search results if available)
  if (searchBody.products && searchBody.products.length > 0) {
    const sku = searchBody.products[0].sku;
    const detailRes = http.get(
      `${BASE_URL}/api/products/${sku}`,
      authHeaders,
    );
    detailDuration.add(detailRes.timings.duration);
    check(detailRes, {
      "detail 200": (r) => r.status === 200,
    });
  }

  // Polite pause between iterations — don't hammer prod
  sleep(1);
}
