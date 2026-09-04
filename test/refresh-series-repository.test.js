const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresRefreshSeriesRepository
} = require("../src/repositories/refresh-series-repository");
const {
  dueSeries
} = require("../src/services/refresh-scheduler");

test("PostgreSQL refresh repository selects stale active provider series", async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rows: [{
          id: "42",
          provider: "fixture",
          provider_series_id: "s42",
          title: "Fixture",
          updated_at: "2026-09-01T00:00:00.000Z"
        }]
      };
    }
  };

  const repository = new PostgresRefreshSeriesRepository(pool);
  const rows = await repository.dueSeries({
    cutoff: "2026-09-04T00:00:00.000Z",
    limit: 20
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 42);
  assert.equal(rows[0].provider, "fixture");
  assert.match(calls[0].sql, /FROM provider_series ps/);
  assert.match(calls[0].sql, /ps\.active = TRUE/);
  assert.deepEqual(calls[0].values, ["2026-09-04T00:00:00.000Z", 20]);
});

test("refresh scheduler awaits injected repository contract", async () => {
  const calls = [];
  const repository = {
    async dueSeries(input) {
      calls.push(input);
      return [{
        id: 9,
        provider: "fixture",
        provider_series_id: "s9",
        title: "Fixture"
      }];
    }
  };

  const rows = await dueSeries({
    now: new Date("2026-09-04T12:00:00.000Z"),
    ttlMs: 60_000,
    limit: 5,
    repository
  });

  assert.equal(rows[0].provider_series_id, "s9");
  assert.equal(calls[0].limit, 5);
  assert.equal(calls[0].cutoff, "2026-09-04T11:59:00.000Z");
});
