const express = require("express");
const telemetry = require("../services/playback-telemetry");
const router = express.Router();

router.post("/sessions", (req, res) => {
  try {
    const session = telemetry.createSession(req.body || {});
    res.status(201).json({ session_id: session.id, status: session.status });
  } catch (error) {
    res.status(400).json({ error: error.code || "PLAYBACK_SESSION_INVALID" });
  }
});

router.post("/sessions/:sessionId/events", (req, res) => {
  try {
    const session = telemetry.recordEvent(req.params.sessionId, req.body || {});
    res.status(202).json({ accepted: true, session: {
      id: session.id, status: session.status, first_frame_ms: session.first_frame_ms,
      buffering_count: session.buffering_count, stalled_count: session.stalled_count
    }});
  } catch (error) {
    const status = error.code === "PLAYBACK_SESSION_NOT_FOUND" ? 404 : 400;
    res.status(status).json({ error: error.code || "PLAYBACK_EVENT_INVALID" });
  }
});

module.exports = router;
