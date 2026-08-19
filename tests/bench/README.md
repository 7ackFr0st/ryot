# Perf benchmarks (k6)

Backs the "avant/apres" measurements required by the perf plan
(`~/.claude/plans/fais-un-plan-pour-streamed-sketch.md`, Point 0). Targets the
real Postgres+MinIO+backend+frontend+Caddy stack from
`tests/src/setup/test-orchestrator.ts` — same one the vitest integration suite
uses, so results aren't polluted by testcontainers-vs-real-deploy differences.

## Prerequisites

- [k6](https://k6.io) installed and on PATH (`k6 version` should work).
- `yarn install` run at repo root at least once.

## Workflow

1. Start the bench environment (builds+runs the real backend in release mode,
   real frontend, real Caddy, seeds one test user + one metadata item in
   Watchlist — first run is slow because of the release build):

   ```
   yarn workspace @ryot/tests bench:setup
   ```

   It prints ready-to-run `k6 run ...` commands with the right `GRAPHQL_URL`,
   `API_KEY`, `METADATA_ID` filled in. Leave this terminal running.

2. In another terminal, run the k6 script(s) relevant to the plan point you're
   about to touch, with `-BEFORE` in the `--summary-export` filename:

   - `metadata-details.js` — points 2 (in-process cache) and 4 (N+1 fixes).
   - `presigned-urls.js` — point 3 (batch image presign URLs).
   - `concurrent-load.js` — point 5 (DB pool sizing).

3. Implement the plan point.

4. Restart the bench env (Ctrl+C in the setup terminal, re-run
   `bench:setup` so the new code is actually built and running), then re-run
   the same k6 script with `-AFTER` in the filename.

5. Compare `tests/bench/results/*-BEFORE.json` vs `*-AFTER.json` — look at
   `metrics.http_req_duration.values.{p(95),p(99),avg}` and
   `metrics.http_reqs.values.rate`.

6. Ctrl+C the setup terminal to tear the environment down.

`tests/bench/results/` is gitignored — these are local scratch numbers, not
checked-in benchmarks.
