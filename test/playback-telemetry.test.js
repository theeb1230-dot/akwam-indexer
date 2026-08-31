const test = require("node:test");
const assert = require("node:assert/strict");
const telemetry = require("../src/services/playback-telemetry");

test("playback telemetry aggregates first frame, buffering, stalls and completion", () => {
  const session = telemetry.createSession({ client_platform: "flutter-tv" });
  telemetry.recordEvent(session.id, { event_type: "first_frame", position_seconds: 0 });
  telemetry.recordEvent(session.id, { event_type: "buffering", position_seconds: 4 });
  telemetry.recordEvent(session.id, { event_type: "stalled", position_seconds: 5 });
  const ended = telemetry.recordEvent(session.id, { event_type: "ended", position_seconds: 1800 });
  assert.equal(ended.status, "ended");
  assert.equal(ended.buffering_count, 1);
  assert.equal(ended.stalled_count, 1);
  assert.notEqual(ended.first_frame_ms, null);
});

test("playback telemetry rejects unknown events", () => {
  const session = telemetry.createSession();
  assert.throws(() => telemetry.recordEvent(session.id, { event_type: "arbitrary" }), /INVALID_PLAYBACK_EVENT/);
});
