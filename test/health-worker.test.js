const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `theeb-health-${process.pid}.sqlite`
);

const jobs = require("../src/services/job-manager");
const {
  safeCandidate,
  executeHealthCheck
} = require("../src/workers/health-worker");

test("temporary media URLs are excluded from durable health results", () => {
  const safe = safeCandidate({
    provider: "fixture",
    episode_id: "e1",
    watch_id: "w1",
    type: "direct_mp4",
    direct_url: "https://temporary.invalid/video.mp4?token=secret"
  });

  assert.equal("direct_url" in safe, false);
  assert.equal(JSON.stringify(safe).includes("token"), false);
});

test("embed health requires browser playback evidence", async () => {
  const job = jobs.create({
    type: "health-check",
    payload: {
      canonical_episode_id: 999,
      query: "Fixture",
      group_key: "series:fixture",
      season: 1,
      episode: 1
    }
  });

  const originalStore = require("../src/db/schema");
  originalStore.prepare(`
    INSERT INTO canonical_series (id, title) VALUES (999, 'Fixture')
  `).run();
  originalStore.prepare(`
    INSERT INTO canonical_episodes (
      id, canonical_series_id, season_number, episode_number
    ) VALUES (999, 999, 1, 1)
  `).run();

  const result = await executeHealthCheck(job, {
    async executePlayback() {
      return {
        status: "ready",
        selected_source: {
          provider: "wecima",
          episode_id: "e1",
          watch_id: "w1",
          server: "mp4",
          type: "embed",
          embed_url: "https://embed.invalid/e1"
        },
        attempts: []
      };
    },
    async probe() {
      return {
        embed_status: "reachable",
        playback_status: "verified",
        video_element_discovered: true,
        loadedmetadata: true,
        canplay: true,
        playing: true,
        max_current_time: 2.5,
        checked_at: new Date().toISOString()
      };
    },
    recordVerification() {
      return { health_state: "PLAYBACK_VERIFIED" };
    },
    healthyTtlMs: 1000
  });

  assert.equal(result.status, "PLAYBACK_VERIFIED");
  const stored = jobs.get(job.id);
  assert.equal(stored.status, "completed");
  assert.equal(JSON.stringify(stored.result).includes("embed.invalid"), false);
});
