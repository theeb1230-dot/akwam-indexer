const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresPlaybackSessionRepository
} = require("../src/repositories/playback-session-repository");
const {
  withRepository
} = require("../src/services/playback-session-store");

function fakePool() {
  const sessions = new Map();
  const events = new Map();

  return {
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, " ").trim();

      if (text.startsWith("SELECT id FROM canonical_episodes")) {
        return { rowCount: params[0] === 9150 ? 1 : 0, rows: params[0] === 9150 ? [{ id: 9150 }] : [] };
      }
      if (text.startsWith("SELECT pc.id, pc.provider, pc.watch_id") && text.includes("WHERE ps.id")) {
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
      if (text.startsWith("SELECT pc.id, pc.provider, pc.watch_id") && text.includes("WHERE pc.canonical_episode_id")) {
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
        sessions.set(params[0], {
          id: params[0],
          canonical_episode_id: params[1],
          state: params[2],
          requested_quality: params[3],
          client_platform: params[4],
          client_version: params[5],
          selected_candidate_id: params[6],
          plan_version: 1,
          created_at: params[7],
          updated_at: params[8],
          expires_at: params[9]
        });
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith("SELECT * FROM playback_sessions")) {
        const row = sessions.get(params[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (text.includes("SET state = 'expired'")) {
        sessions.get(params[0]).state = "expired";
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith("SELECT 1 FROM playback_session_events")) {
        const key = `${params[0]}:${params[1]}`;
        return { rowCount: events.has(key) ? 1 : 0, rows: events.has(key) ? [{ "?column?": 1 }] : [] };
      }
      if (text.startsWith("SELECT COUNT(*)::int AS count")) {
        const count = [...events.values()].filter(item => item.session_id === params[0] && item.received_at >= params[1]).length;
        return { rowCount: 1, rows: [{ count }] };
      }
      if (text.startsWith("INSERT INTO playback_session_events")) {
        const key = `${params[0]}:${params[1]}`;
        if (events.has(key)) return { rowCount: 0, rows: [] };
        events.set(key, {
          session_id: params[0],
          event_id: params[1],
          event_type: params[2],
          position_seconds: params[3],
          error_code: params[4],
          details: params[5],
          occurred_at: params[6],
          received_at: params[7]
        });
        return { rowCount: 1, rows: [{ id: events.size }] };
      }
      if (text.includes("SET state = 'ready'")) {
        sessions.get(params[0]).state = "ready";
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("SET state = 'unavailable'")) {
        sessions.get(params[0]).state = "unavailable";
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith("SELECT po.id, po.quality, po.status")) {
        return { rowCount: 0, rows: [] };
      }

      throw new Error(`UNHANDLED_SQL: ${text}`);
    }
  };
}

test("PostgreSQL playback session repository matches the public contract", async () => {
  const repository = new PostgresPlaybackSessionRepository(fakePool());
  const sessions = withRepository(repository);
  const now = new Date("2026-09-04T12:00:00.000Z");
  const id = "00000000-0000-4000-8000-000000000099";

  const created = await sessions.createSession({
    canonical_episode_id: 9150,
    quality: "720p",
    client: { platform: "web", version: "1.0.0" }
  }, { id, now });

  assert.equal(created.state, "ready");
  assert.match(created.playback.uri, /\/v1\/playback\/sessions\//);

  const handoff = await sessions.mediaHandoff(id);
  assert.equal(
    handoff.uri,
    "/play/fixture/watch-1/episode-1?quality=720p"
  );

  assert.deepEqual(await sessions.recordFeedback(id, {
    event_id: "frame-1",
    type: "first_frame",
    occurred_at: now.toISOString(),
    position_seconds: 2
  }, { now }), { accepted: true, duplicate: false });

  const ready = await sessions.getSession(id, { now });
  assert.equal(ready.state, "ready");
  assert.match(ready.playback.uri, /\/v1\/playback\/sessions\//);

  assert.deepEqual(await sessions.recordFeedback(id, {
    event_id: "frame-1",
    type: "first_frame",
    occurred_at: now.toISOString(),
    position_seconds: 2
  }, { now }), { accepted: true, duplicate: true });

  assert.deepEqual(await sessions.downloadOptions(9150), {
    canonical_episode_id: 9150,
    count: 0,
    items: [],
    automatic_download: false,
    action_required: "user_selection"
  });
});
