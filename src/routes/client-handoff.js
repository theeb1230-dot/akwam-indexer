const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const router = express.Router();

async function resolveArabSeedPlayer(episodeId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(episodeId)) {
    throw new Error("Invalid episode id");
  }

  const embedUrl =
    `https://arabsseed.christmas/embed.php?vid=${encodeURIComponent(episodeId)}`;

  const response = await axios.get(embedUrl, {
    timeout: 15000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const $ = cheerio.load(response.data);

  const playerUrl = $("iframe")
    .map((_, el) => $(el).attr("src"))
    .get()
    .find(src => /^https?:\/\/[^/]*okhd\./i.test(src || ""));

  if (!playerUrl) {
    throw new Error("OKHD iframe not found");
  }

  return {
    embedUrl,
    playerUrl
  };
}

router.get("/arabseed/:episodeId", async (req, res) => {
  try {
    const episodeId = String(req.params.episodeId || "").trim();
    const result = await resolveArabSeedPlayer(episodeId);

    res.json({
      ok: true,
      mode: "client_handoff",
      provider: "arabseed",
      episode_id: episodeId,
      arabseed_embed: result.embedUrl,
      player_url: result.playerUrl
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/arabseed/:episodeId/open", async (req, res) => {
  try {
    const episodeId = String(req.params.episodeId || "").trim();
    const result = await resolveArabSeedPlayer(episodeId);

    const safeUrl = String(result.playerUrl)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    return res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Theeb Player Handoff</title>
<style>
body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#08090d;
  color:#fff;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
.box{
  width:min(90%,420px);
  text-align:center;
}
h1{font-size:24px;margin-bottom:12px}
p{opacity:.7;line-height:1.8}
a{
  display:block;
  margin-top:24px;
  padding:18px;
  border-radius:14px;
  background:#fff;
  color:#000;
  text-decoration:none;
  font-size:20px;
  font-weight:700;
}
</style>
</head>
<body>
<div class="box">
  <h1>🐺 ذيب</h1>
  <p>تم العثور على مشغل الحلقة.</p>
  <a href="${safeUrl}" rel="noopener noreferrer">
    ▶️ مشاهدة الحلقة
  </a>
</div>
</body>
</html>`);
  } catch (error) {
    res.status(502).send(error.message);
  }
});


router.get("/arabseed/:episodeId/watch-page.html", async (req, res) => {
  try {
    const episodeId = String(req.params.episodeId || "").trim();
    const result = await resolveArabSeedPlayer(episodeId);

    const safeUrl = String(result.playerUrl)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    res.status(200);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", "inline; filename=\"theeb-watch.html\"");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    return res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ذيب - مشاهدة</title>
<style>
body{
  margin:0;
  min-height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  background:#08090d;
  color:#fff;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
main{
  width:min(90%,420px);
  text-align:center;
}
a{
  display:block;
  padding:18px;
  margin-top:24px;
  border-radius:14px;
  background:#fff;
  color:#000;
  text-decoration:none;
  font-size:20px;
  font-weight:700;
}
</style>
</head>
<body>
<main>
<h1>🐺 ذيب</h1>
<p>تم العثور على مشغل الحلقة.</p>
<a href="${safeUrl}" target="_self">▶ مشاهدة الحلقة</a>
</main>
</body>
</html>`);
  } catch (error) {
    res.status(502).send(error.message);
  }
});

module.exports = router;
