const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const BASE = "https://akwam.ss";
const MAX_REDIRECTS = 5;

function clean(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function repairUtf8(text = "") {
  if (!text) return text;

  if (/[ØÙÃ]/.test(text)) {
    try {
      return Buffer
        .from(text, "latin1")
        .toString("utf8");
    } catch {
      return text;
    }
  }

  return text;
}

function absoluteUrl(url, base = BASE) {
  if (!url) return null;

  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

function normalizeRedirect(location, currentUrl) {
  if (!location) return null;

  const fixed =
    repairUtf8(location);

  try {
    return new URL(
      fixed,
      currentUrl
    ).href;
  } catch {
    return null;
  }
}

function detectQuality(text = "") {
  const match =
    clean(text).match(
      /\b(2160p|1440p|1080p|720p|480p|360p|240p)\b/i
    );

  return match
    ? match[1].toLowerCase()
    : null;
}

function getEpisodeId(url) {
  if (!url) return null;

  const match =
    String(url).match(
      /\/episode\/(\d+)/
    );

  return match
    ? match[1]
    : null;
}

function getWatchId(url) {
  if (!url) return null;

  const match =
    String(url).match(
      /\/watch\/(\d+)\/(\d+)/
    );

  return match
    ? match[1]
    : null;
}

function watchBelongsToEpisode(
  url,
  episodeId
) {
  if (!url || !episodeId) {
    return false;
  }

  const match =
    String(url).match(
      /\/watch\/(\d+)\/(\d+)/
    );

  if (!match) {
    return false;
  }

  return match[2] ===
    String(episodeId);
}

async function requestPage(
  url,
  redirectCount = 0
) {
  console.log(
    `🌐 GET [${redirectCount}]`
  );

  console.log(url);

  const response =
    await axios.get(url, {
      timeout: 20000,

      maxRedirects: 0,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
          "Version/18.0 Mobile/15E148 Safari/604.1",

        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",

        "Cache-Control":
          "no-cache",

        Pragma:
          "no-cache"
      },

      validateStatus(status) {
        return (
          status >= 200 &&
          status < 400
        );
      }
    });

  if (
    response.status >= 300 &&
    response.status < 400
  ) {
    if (
      redirectCount >=
      MAX_REDIRECTS
    ) {
      throw new Error(
        "Too many redirects"
      );
    }

    const rawLocation =
      response.headers.location;

    if (!rawLocation) {
      throw new Error(
        "Redirect without Location"
      );
    }

    const nextUrl =
      normalizeRedirect(
        rawLocation,
        url
      );

    console.log("");
    console.log(
      `↪ REDIRECT ${response.status}`
    );

    console.log(
      "FIXED:",
      nextUrl
    );

    console.log("");

    if (!nextUrl) {
      throw new Error(
        "Invalid redirect URL"
      );
    }

    return requestPage(
      nextUrl,
      redirectCount + 1
    );
  }

  return {
    response,
    finalUrl: url
  };
}

function buildTabQualityMap($) {
  const map = {};

  $('a[href*="#tab-"]').each(
    (index, element) => {
      const node =
        $(element);

      const href =
        node.attr("href");

      if (!href) return;

      const match =
        href.match(
          /#(tab-\d+)/
        );

      if (!match) return;

      const tabId =
        match[1];

      const quality =
        detectQuality(
          node.text()
        );

      if (!quality) return;

      map[tabId] =
        quality;
    }
  );

  return map;
}

function collectWatchSources(
  $,
  finalUrl,
  episodeId,
  tabQualityMap
) {
  const sources = [];
  const seen = new Set();

  for (
    const [tabId, quality]
    of Object.entries(tabQualityMap)
  ) {
    const tab =
      $(`#${tabId}`);

    if (!tab.length) {
      continue;
    }

    tab.find('a[href*="/watch/"]')
      .each(
        (index, element) => {
          const href =
            $(element)
              .attr("href");

          const url =
            absoluteUrl(
              href,
              finalUrl
            );

          if (
            !watchBelongsToEpisode(
              url,
              episodeId
            )
          ) {
            return;
          }

          if (seen.has(url)) {
            return;
          }

          seen.add(url);

          sources.push({
            quality,
            watch_id:
              getWatchId(url),

            watch_url:
              url,

            relation:
              "tab"
          });
        }
      );
  }

  $('a[href*="/watch/"]').each(
    (index, element) => {
      const node =
        $(element);

      const href =
        node.attr("href");

      const url =
        absoluteUrl(
          href,
          finalUrl
        );

      if (
        !watchBelongsToEpisode(
          url,
          episodeId
        )
      ) {
        return;
      }

      if (seen.has(url)) {
        return;
      }

      let quality =
        detectQuality(
          node.text()
        );

      if (!quality) {
        const parentText =
          clean(
            node
              .closest(
                "div,li,section,article"
              )
              .text()
          );

        quality =
          detectQuality(
            parentText
          );
      }

      seen.add(url);

      sources.push({
        quality:
          quality || null,

        watch_id:
          getWatchId(url),

        watch_url:
          url,

        relation:
          quality
            ? "nearby-text"
            : "unresolved"
      });
    }
  );

  return sources;
}

function parseEpisode(
  html,
  finalUrl
) {
  const $ =
    cheerio.load(html);

  const episodeId =
    getEpisodeId(finalUrl);

  const title =
    clean(
      $("h1")
        .first()
        .text()
    ) ||
    clean(
      $('meta[property="og:title"]')
        .attr("content")
    ) ||
    clean(
      $("title")
        .text()
    ) ||
    null;

  const description =
    clean(
      $('meta[name="description"]')
        .attr("content")
    ) ||
    clean(
      $('meta[property="og:description"]')
        .attr("content")
    ) ||
    null;

  const image =
    absoluteUrl(
      $('meta[property="og:image"]')
        .attr("content") ||
      $("img")
        .first()
        .attr("src"),

      finalUrl
    );

  const tabQualityMap =
    buildTabQualityMap($);

  const watchSources =
    collectWatchSources(
      $,
      finalUrl,
      episodeId,
      tabQualityMap
    );

  const qualities =
    [
      ...new Set(
        [
          ...Object.values(
            tabQualityMap
          ),

          ...watchSources
            .map(
              item =>
                item.quality
            )
            .filter(Boolean)
        ]
      )
    ];

  let previousEpisode =
    null;

  let nextEpisode =
    null;

  $('a[href*="/episode/"]').each(
    (index, element) => {
      const node =
        $(element);

      const text =
        clean(
          node.text()
        );

      const href =
        absoluteUrl(
          node.attr("href"),
          finalUrl
        );

      if (
        !href ||
        href === finalUrl
      ) {
        return;
      }

      if (
        /الحلقة السابقة/i
          .test(text)
      ) {
        previousEpisode = {
          title: text,
          url: href
        };
      }

      if (
        /الحلقة التالية/i
          .test(text)
      ) {
        nextEpisode = {
          title: text,
          url: href
        };
      }
    }
  );

  return {
    source:
      "akwam",

    source_url:
      finalUrl,

    scraped_at:
      new Date()
        .toISOString(),

    episode: {
      id:
        episodeId,

      title,
      description,
      image
    },

    qualities,

    quality_tabs:
      tabQualityMap,

    watch_sources:
      watchSources,

    navigation: {
      previous:
        previousEpisode,

      next:
        nextEpisode
    }
  };
}

function saveJson(data) {
  const outputDir =
    path.join(
      process.cwd(),
      "data",
      "episodes"
    );

  if (
    !fs.existsSync(
      outputDir
    )
  ) {
    fs.mkdirSync(
      outputDir,
      {
        recursive: true
      }
    );
  }

  const episodeId =
    data.episode?.id ||
    "unknown";

  const filename =
    `episode-${episodeId}.json`;

  const fullPath =
    path.join(
      outputDir,
      filename
    );

  fs.writeFileSync(
    fullPath,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  return fullPath;
}

async function main() {
  const url =
    process.argv[2];

  if (!url) {
    console.log("");
    console.log(
      "❌ ضع رابط الحلقة بعد الأمر"
    );

    console.log("");
    console.log(
      "مثال:"
    );

    console.log(
      "node src/scraper/episode.js https://akwam.ss/episode/60515"
    );

    process.exit(1);
  }

  try {
    console.log("");
    console.log(
      "🎬 AKWAM EPISODE"
    );

    console.log("");

    const {
      response,
      finalUrl
    } =
      await requestPage(url);

    const data =
      parseEpisode(
        response.data,
        finalUrl
      );

    const savedPath =
      saveJson(data);

    console.log("");
    console.log(
      "✅ EPISODE SCRAPE COMPLETE"
    );

    console.log(
      "🎞 Episode:",
      data.episode.id
    );

    console.log(
      "📺 Qualities:",
      data.qualities.join(", ")
    );

    console.log(
      "▶ Watch sources:",
      data.watch_sources.length
    );

    console.log("");
    console.log(
      JSON.stringify(
        data.watch_sources,
        null,
        2
      )
    );

    console.log("");
    console.log(
      "💾 Saved:"
    );

    console.log(
      savedPath
    );

    console.log("");
  } catch (error) {
    console.log("");
    console.log(
      "❌ EPISODE SCRAPE FAILED"
    );

    if (error.response) {
      console.log(
        "HTTP:",
        error.response.status
      );
    }

    console.log(
      "MESSAGE:",
      error.message
    );

    process.exit(1);
  }
}

main();