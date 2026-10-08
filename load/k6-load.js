// P7 load test. Runs in k6, not Node:
//   NFR-005, 200 users, server errors only:  k6 run -e BASE_URL=… load/k6-load.js
//   NFR-002/003, 50 users, latency too:      k6 run -e BASE_URL=… -e PEAK_USERS=50 load/k6-load.js
// The API under test needs AUTH_RATE_LIMIT and API_RATE_LIMIT raised: every virtual user
// signs up from the same IP. Never point this at production.
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const BASE = `${__ENV.BASE_URL || 'http://localhost:3000'}/api/v1`;
const ACCOUNTS = Number(__ENV.ACCOUNTS || 50);
const PEAK = Number(__ENV.PEAK_USERS || 200);
const serverErrors = new Rate('server_errors');

export const options = {
  setupTimeout: '5m',
  scenarios: {
    parents: {
      executor: 'ramping-vus',
      stages: [
        { duration: __ENV.RAMP || '1m', target: PEAK },
        { duration: __ENV.HOLD || '2m', target: PEAK },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    // NFR-005: fewer than 0.1% server errors at 200 concurrent users.
    server_errors: ['rate<0.001'],
    // NFR-003 is measured at 50 users: reads p95 ≤ 300 ms, writes p95 ≤ 500 ms;
    // NFR-002: planning a week p95 ≤ 800 ms.
    ...(PEAK <= 50 && {
      'http_req_duration{kind:read}': ['p(95)<300'],
      'http_req_duration{kind:write}': ['p(95)<500'],
      'http_req_duration{kind:generate}': ['p(95)<800'],
    }),
  },
};

const json = (token) => ({
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
});

function vietnamDate(offsetDays = 0) {
  const ms = Date.now() + 7 * 3600_000 + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function mondayOf(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** One parent account with one 8-month-old child per group of virtual users. */
export function setup() {
  const born = vietnamDate(-245);
  const accounts = [];
  for (let i = 0; i < ACCOUNTS; i += 1) {
    const email = `load-${Date.now()}-${i}@load.test`;
    const signup = http.post(
      `${BASE}/auth/register`,
      JSON.stringify({ email, password: 'Chao ca hoi 2026', consentVersion: '2026-09-28' }),
      { headers: { 'content-type': 'application/json' } },
    );
    if (!check(signup, { 'signed up': (r) => r.status === 201 })) {
      throw new Error(`register ${signup.status}: ${signup.body}`);
    }
    const token = signup.json('accessToken');
    const child = http.post(
      `${BASE}/children`,
      JSON.stringify({
        name: `Bé ${i}`,
        birthDate: born,
        isPremature: false,
        priorReaction: 'never',
        avoidAllergens: i % 3 === 0 ? ['egg'] : [],
        avoidIngredients: [],
      }),
      json(token),
    );
    check(child, { 'child created': (r) => r.status === 201 });
    accounts.push({ token, childId: child.json('id') });
  }
  return { accounts };
}

function record(res, kind) {
  serverErrors.add(res.status >= 500, { kind });
  return res;
}

/** A parent opening the app: today, a recipe, the library, now and then next week's plan. */
export default function ({ accounts }) {
  const { token, childId } = accounts[__VU % accounts.length];
  const read = { ...json(token), tags: { kind: 'read' } };
  const today = vietnamDate();

  record(http.get(`${BASE}/children`, read), 'read');
  const day = record(http.get(`${BASE}/children/${childId}/days/${today}`, read), 'read');
  check(day, { 'day 200': (r) => r.status === 200 });
  const meals = day.status === 200 ? day.json('meals') : [];
  if (meals.length > 0) {
    const meal = meals[__ITER % meals.length];
    record(http.get(`${BASE}/children/${childId}/dishes/${meal.dish.id}`, read), 'read');
    record(http.get(`${BASE}/meals/${meal.id}/swap-suggestions?reason=other`, read), 'read');
  }
  record(http.get(`${BASE}/children/${childId}/dishes`, read), 'read');
  record(http.get(`${BASE}/children/${childId}/journal`, read), 'read');

  if (__ITER % 10 === 0) {
    const nextWeek = mondayOf(vietnamDate(7));
    const generated = record(
      http.post(
        `${BASE}/children/${childId}/weeks/${nextWeek}/generate`,
        JSON.stringify({ overwrite: true }),
        { ...json(token), tags: { kind: 'generate' } },
      ),
      'generate',
    );
    check(generated, { 'week planned': (r) => r.status === 200 });
  }
  if (__ITER % 5 === 0) {
    record(
      http.post(
        `${BASE}/children/${childId}/health`,
        JSON.stringify({ status: __ITER % 2 ? 'normal' : 'recovering', symptoms: [] }),
        { ...json(token), tags: { kind: 'write' } },
      ),
      'write',
    );
  }
  sleep(1 + Math.random() * 2);
}
