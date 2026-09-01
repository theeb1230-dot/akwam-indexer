const test = require("node:test");
const assert = require("node:assert/strict");
const {
  migrate
} = require("../scripts/migrate-postgres");

test("migration runner applies unapplied files once", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (/SELECT version/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const result = await migrate({ client });
  assert.deepEqual(result.executed, ["001_initial", "002_client_api"]);
  assert.ok(queries.some(sql => /CREATE TABLE IF NOT EXISTS canonical_series/.test(sql)));
});

test("migration runner skips recorded versions", async () => {
  const client = {
    async query(sql) {
      if (/SELECT version/.test(sql)) {
        return { rows: [{ version: "001_initial" }, { version: "002_client_api" }] };
      }
      return { rows: [] };
    }
  };

  const result = await migrate({ client });
  assert.deepEqual(result.executed, []);
});
