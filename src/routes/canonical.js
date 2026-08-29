const express = require("express");
const db = require("../db/schema");
const router = express.Router();

router.get("/series", (req, res) => {
  const items = db.prepare(`
    SELECT cs.*, ck.canonical_key,
      COUNT(DISTINCT ps.id) AS source_count,
      COUNT(DISTINCT ce.id) AS episode_count
    FROM canonical_series cs
    LEFT JOIN canonical_keys ck
      ON ck.canonical_series_id = cs.id
    LEFT JOIN provider_series ps
      ON ps.canonical_series_id = cs.id
    LEFT JOIN canonical_episodes ce
      ON ce.canonical_series_id = cs.id
    GROUP BY cs.id
    ORDER BY cs.updated_at DESC
  `).all();

  res.json({ count: items.length, items });
});

router.get("/series/:id/episodes", (req, res) => {
  const series = db.prepare(`
    SELECT cs.*, ck.canonical_key
    FROM canonical_series cs
    LEFT JOIN canonical_keys ck
      ON ck.canonical_series_id = cs.id
    WHERE cs.id = ?
  `).get(req.params.id);

  if (!series) {
    return res.status(404).json({
      error: "CANONICAL_SERIES_NOT_FOUND"
    });
  }

  const episodes = db.prepare(`
    SELECT ce.*,
      COUNT(DISTINCT pe.id) AS source_count,
      COUNT(DISTINCT pc.id) AS playback_option_count
    FROM canonical_episodes ce
    LEFT JOIN provider_episodes pe
      ON pe.canonical_episode_id = ce.id
    LEFT JOIN playback_candidates pc
      ON pc.canonical_episode_id = ce.id
      AND pc.status = 'active'
    WHERE ce.canonical_series_id = ?
    GROUP BY ce.id
    ORDER BY ce.season_number, ce.episode_number
  `).all(series.id);

  res.json({ series, count: episodes.length, episodes });
});

router.get("/episodes/:id/playback", (req, res) => {
  const episode = db.prepare(`
    SELECT * FROM canonical_episodes WHERE id = ?
  `).get(req.params.id);

  if (!episode) {
    return res.status(404).json({
      error: "CANONICAL_EPISODE_NOT_FOUND"
    });
  }

  const fallbackPlan = db.prepare(`
    SELECT pc.provider, pe.provider_episode_id,
      pc.watch_id, pc.server,
      pc.playback_type AS type, pc.quality,
      pc.priority AS fallback_order,
      pc.status, pc.locator_json, pc.updated_at
    FROM playback_candidates pc
    JOIN provider_episodes pe
      ON pe.id = pc.provider_episode_id
    WHERE pc.canonical_episode_id = ?
      AND pc.status = 'active'
    ORDER BY pc.priority, pc.id
  `).all(episode.id).map(item => ({
    ...item,
    locator: JSON.parse(item.locator_json || "null"),
    locator_json: undefined
  }));

  res.json({
    episode,
    playback_option_count: fallbackPlan.length,
    fallback_plan: fallbackPlan
  });
});

module.exports = router;
