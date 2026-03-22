// Shared config for all k6 scripts.
// JWT and BASE_URL loaded from root .env by tier runner scripts.

export const BASE_URL = __ENV.K6_BASE_URL || "https://coupette.club";
export const JWT = __ENV.K6_JWT || "";

export const authHeaders = {
  headers: {
    Authorization: `Bearer ${JWT}`,
    "Content-Type": "application/json",
  },
};

export const publicHeaders = {
  headers: {
    "Content-Type": "application/json",
  },
};

// Standard thresholds — adjust per scenario
export const defaultThresholds = {
  http_req_duration: ["p(95)<500"],
  http_req_failed: ["rate<0.01"],
};

// LLM-bound endpoints get relaxed thresholds
export const llmThresholds = {
  http_req_duration: ["p(95)<10000"],
  http_req_failed: ["rate<0.01"],
};
