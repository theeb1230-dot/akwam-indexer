const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_PATH = path.join(os.tmpdir(), `theeb-v1-${process.pid}.sqlite`);

const db = require("../src/db/schema");
const sessions = require("../src/services/playback-session-store");

function fixtureEpisode() {
  db.prepare("INSERT OR IGNORE INTO canonical_series (id, title) VALUES (9100, 'Contract fixture')").run();
  db.prepare(`
    INSERT OR IGNORE INTO canonical_episodes
      (id, canonical_series_id, season_number, episode_number)
    VALUES (9150, 9100, 1, 15)
  `).run();
}

test("session starts in an honest planning state without external source data", async () => {
  fixtureEpisode();
  const now = new Date();
  const session = await await await sessions.createSession({
    canonical_episode_id: 9150,
    quality: "720p",
    client: { platform: "android_tv", version: "2.2.0" }
  }, { id: "00000000-0000-4000-8000-000000000009", now });

  assert.equal(session.state, "planning");
  assert.equal(session.playback, null);
  assert.equal(session.client.platform, "android_tv");
  assert.equal(JSON.stringify(session).includes("provider"), false);
  assert.equal(JSON.stringify(session).includes("direct_url"), false);
});

test("feedback is idempotent and validates its event taxonomy", async () => {
  fixtureEpisode();
  const id = "00000000-0000-4000-8000-000000000019";
  const now = new Date();
  sessions.createSession({
    canonical_episode_id: 9150,
    client: { platform: "ios" }
  }, { id, now });

  const feedback = {
    event_id: "device-event-1",
    type: "first_frame",
    occurred_at: now.toISOString(),
    position_seconds: 2.1
  };
  assert.deepEqual(await sessions.recordFeedback(id, feedback), { accepted: true, duplicate: false });
  assert.deepEqual(await sessions.recordFeedback(id, feedback), { accepted: true, duplicate: true });
  await assert.rejects(() => await await sessions.recordFeedback(id, { ...feedback, event_id: "x", type: "http_200" }), /EVENT_TYPE_INVALID/);
});

test("feedback bounds untrusted timestamps, labels and volume", async () => {
  fixtureEpisode();
  const id = "00000000-0000-4000-8000-000000000029";
  const now = new Date("2026-09-01T12:00:00Z");
  sessions.createSession({
    canonical_episode_id: 9150,
    client: { platform: "android" }
  }, { id, now, ttlMs: 60 * 60 * 1000 });

  sessions.recordFeedback(id, {
    event_id: "skewed",
    type: "buffering",
    occurred_at: "2000-01-01T00:00:00Z",
    details: { network_type: "wifi" }
  }, { now });
  const stored = db.prepare(`
    SELECT occurred_at, received_at FROM playback_session_events
    WHERE session_id = ? AND event_id = 'skewed'
  `).get(id);
  assert.equal(stored.occurred_at, now.toISOString());
  assert.equal(stored.received_at, now.toISOString());

  await assert.rejects(() => sessions.recordFeedback(id, {
    event_id: "bad-label",
    type: "playing",
    occurred_at: now.toISOString(),
    details: { arbitrary_metric_label: "unbounded" }
  }, { now }), /EVENT_DETAILS_UNKNOWN_FIELD/);

  for (let index = 1; index < sessions.MAX_FEEDBACK_EVENTS_PER_MINUTE; index += 1) {
    sessions.recordFeedback(id, {
      event_id: `bounded-${index}`,
      type: "buffering",
      occurred_at: now.toISOString()
    }, { now });
  }
  await assert.rejects(() => sessions.recordFeedback(id, {
    event_id: "over-limit",
    type: "buffering",
    occurred_at: now.toISOString()
  }, { now }), /FEEDBACK_RATE_LIMITED/);
});

test("watch and download remain separate contracts", async () => {
  fixtureEpisode();
  const session = await sessions.createSession({
    canonical_episode_id: 9150,
    client: { platform: "web" }
  });
  const downloads = await sessions.downloadOptions(9150);

  assert.equal(session.playback, null);
  assert.equal(downloads.canonical_episode_id, 9150);
  assert.deepEqual(downloads.items, []);
  assert.equal(Object.hasOwn(downloads, "playback"), false);
});

test("invalid client input fails with stable machine codes", async () => {
  fixtureEpisode();
  await assert.rejects(() => sessions.createSession({ canonical_episode_id: 9150, client: { platform: "provider-webview" } }), /CLIENT_PLATFORM_INVALID/);
  await assert.rejects(() => sessions.createSession({ canonical_episode_id: 9150, quality: "4k", client: { platform: "android" } }), /QUALITY_INVALID/);
});
