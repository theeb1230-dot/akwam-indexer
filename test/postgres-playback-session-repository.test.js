const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresPlaybackSessionRepository
} = require("../src/repositories/playback-session-repository");
const {
  withRepository
} = require("../src/services/playback-session-store");

test("PostgreSQL repository selects playback candidates and persists ready sessions", async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, " ").trim();
      calls.push({ text, params });

      if (text.startsWith("SELECT id FROM canonical_episodes")) {
        return { rowCount: 1, rows: [{ id: 9150 }] };
      }

      if (text.includes("FROM playback_candidates pc") && text.includes("WHERE pc.canonical_episode_id")) {
        return {
          rowCount: 1,
          rows: [{
            id: 44,
            provider: "fixture",
            watch_id: "watch-1",
            quality: "720p",
            playback_type: "resolver",
            provider_episode_id: "episode-1"
          }]
        };
      }

      if (text.startsWith("INSERT INTO playback_sessions")) {
        assert.equal(params[2], "ready");
        assert.equal(params[6], 44);
        return { rowCount: 1, rows: [] };
      }

      throw new Error(`UNHANDLED_SQL: ${text}`);
    }
  };

  const repository = new PostgresPlaybackSessionRepository(pool);
  assert.equal(await repository.episodeExists(9150), true);

  const candidate = await repository.selectCandidate(9150, "720p");
  assert.equal(candidate.id, 44);
  assert.equal(candidate.provider, "fixture");

  await repository.createSession({
    id: "00000000-0000-4000-8000-000000000099",
    canonical_episode_id: 9150,
    state: "ready",
    requested_quality: "720p",
    client_platform: "web",
    client_version: "1.0.0",
    selected_candidate_id: 44,
    created_at: "2026-09-04T12:00:00.000Z",
    updated_at: "2026-09-04T12:00:00.000Z",
    expires_at: "2026-09-04T12:30:00.000Z"
  });

  assert.ok(calls.some(call => call.text.startsWith("INSERT INTO playback_sessions")));
});

test("playback session media handoff uses selected candidate without exposing locators", async () => {
  const id = "00000000-0000-4000-8000-000000000099";
  const row = {
    id,
    canonical_episode_id: 9150,
    state: "ready",
    requested_quality: "720p",
    client_platform: "web",
    client_version: "1.0.0",
    plan_version: 1,
    created_at: "2026-09-04T12:00:00.000Z",
    updated_at: "2026-09-04T12:00:00.000Z",
    expires_at: "2026-09-04T12:30:00.000Z"
  };

  const repository = {
    async getSession(sessionId) {
      return sessionId === id ? row : null;
    },
    async expireSession() {},
    async selectedCandidate(sessionId) {
      assert.equal(sessionId, id);
      return {
        id: 44,
        provider: "fixture",
        watch_id: "watch-1",
        quality: "720p",
        playback_type: "resolver",
        provider_episode_id: "episode-1"
      };
    }
  };

  const sessions = withRepository(repository);
  const handoff = await sessions.mediaHandoff(id);

  assert.deepEqual(handoff, {
    session_id: id,
    uri: "/play/fixture/watch-1/episode-1?quality=720p"
  });
  assert.equal(JSON.stringify(handoff).includes("locator"), false);
});
