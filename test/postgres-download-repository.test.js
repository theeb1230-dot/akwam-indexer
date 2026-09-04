const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresDownloadRepository
} = require("../src/repositories/download-repository");
const {
  createDownloadResolver
} = require("../src/services/download-resolver");

function fakePool() {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT ce\.\*, cs\.title AS series_title/.test(sql)) {
        return {
          rows: [{
            id: "10",
            canonical_series_id: "1",
            season_number: "1",
            episode_number: "2",
            title: "Episode 2",
            series_title: "Fixture"
          }]
        };
      }
      if (/FROM provider_episodes/.test(sql)) {
        return {
          rows: [{
            id: "21",
            canonical_episode_id: "10",
            provider: "fixture",
            provider_episode_id: "e2",
            source_url: "https://example.test/e2"
          }]
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  return {
    calls,
    async query(sql, values) { return client.query(sql, values); },
    async connect() { return client; }
  };
}

test("PostgreSQL download repository persists stable locators without direct URLs", async () => {
  const pool = fakePool();
  const repository = new PostgresDownloadRepository(pool);

  const episode = await repository.getEpisode(10);
  assert.equal(episode.id, 10);

  const sources = await repository.listSources(10);
  assert.equal(sources[0].id, 21);

  await repository.replaceCandidates(sources[0], [{
    candidate_id: "candidate-1",
    provider: "fixture",
    download_id: "d1",
    quality: "720p",
    format: "mp4",
    locator: {
      provider: "fixture",
      provider_episode_id: "e2",
      download_id: "d1",
      quality: "720p",
      format: "mp4",
      type: "download_file"
    },
    metadata: {
      filename: "episode.mp4",
      note: "stable metadata"
    }
  }]);

  const insert = pool.calls.find(call => /INSERT INTO download_candidates/.test(call.sql));
  assert.ok(insert);
  const serialized = JSON.stringify(insert.values);
  assert.doesNotMatch(serialized, /direct_url|download_url|resolved_url|page_url/);
  assert.match(insert.sql, /locator/);
  assert.match(insert.sql, /metadata/);
});

test("download resolver works with async repository contract", async () => {
  const persisted = [];
  const repository = {
    async getEpisode(id) {
      return id === 10
        ? {
            id: 10,
            season_number: 1,
            episode_number: 2,
            title: "Episode 2",
            series_title: "Fixture"
          }
        : null;
    },
    async listSources(id) {
      return id === 10
        ? [{
            id: 21,
            canonical_episode_id: 10,
            provider: "fixture",
            provider_episode_id: "e2"
          }]
        : [];
    },
    async replaceCandidates(source, candidates) {
      persisted.push({ source, candidates });
    }
  };

  const providers = new Map([[
    "fixture",
    {
      async getDownloadOptions() {
        return [{
          id: "d1",
          quality: "720p",
          format: "mp4",
          direct_url: "https://cdn.example.test/e2.mp4",
          filename: "episode.mp4"
        }];
      }
    }
  ]]);

  const resolver = createDownloadResolver({ repository, providers });
  const result = await resolver.resolveDownloadOptions(10);

  assert.equal(result.download_option_count, 1);
  assert.equal(result.automatic_download, false);
  assert.equal(result.action_required, "user_selection");
  assert.equal(result.download_options[0].live_url, "https://cdn.example.test/e2.mp4");
  assert.equal(persisted.length, 1);
  assert.doesNotMatch(JSON.stringify(persisted[0].candidates[0].metadata), /cdn\.example\.test/);
});
