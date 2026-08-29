const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

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

function absoluteUrl(value, base) {
  if (!value) return null;

  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
}

function normalizeRedirect(location, currentUrl) {
  if (!location) return null;

  const fixed = repairUtf8(location);

  try {
    return new URL(
      fixed,
      currentUrl
    ).href;
  } catch {
    return null;
  }
}

function getWatchInfo(url) {
  const match = String(url).match(
    /\/watch\/(\d+)\/(\d+)/
  );

  if (!match) {
    return {
      watchId: null,
      episodeId: null
    };
  }

  return {
    watchId: match[1],
    episodeId: match[2]
  };
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
      redirectCount >= MAX_REDIRECTS
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

function elementAttributes(node) {
  const attrs = {};

  if (!node?.attribs) {
    return attrs;
  }

  for (
    const [key, value]
    of Object.entries(node.attribs)
  ) {
    attrs[key] = value;
  }

  return attrs;
}

function inspectPage(html, finalUrl) {
  const $ = cheerio.load(html);

  const {
    watchId,
    episodeId
  } = getWatchInfo(finalUrl);

  const title =
    clean(
      $("title").text()
    ) || null;

  const h1 =
    clean(
      $("h1").first().text()
    ) || null;

  const iframes = [];

  $("iframe").each(
    (index, element) => {
      const node = $(element);

      iframes.push({
        index,
        src:
          absoluteUrl(
            node.attr("src"),
            finalUrl
          ),

        attributes:
          elementAttributes(
            element
          )
      });
    }
  );

  const videos = [];

  $("video").each(
    (index, element) => {
      const node = $(element);

      const sources = [];

      node.find("source").each(
        (sourceIndex, sourceElement) => {
          const source =
            $(sourceElement);

          sources.push({
            src:
              absoluteUrl(
                source.attr("src"),
                finalUrl
              ),

            type:
              source.attr("type") ||
              null
          });
        }
      );

      videos.push({
        index,

        src:
          absoluteUrl(
            node.attr("src"),
            finalUrl
          ),

        poster:
          absoluteUrl(
            node.attr("poster"),
            finalUrl
          ),

        attributes:
          elementAttributes(
            element
          ),

        sources
      });
    }
  );

  const standaloneSources = [];

  $("source").each(
    (index, element) => {
      const node = $(element);

      standaloneSources.push({
        index,

        src:
          absoluteUrl(
            node.attr("src"),
            finalUrl
          ),

        type:
          node.attr("type") ||
          null
      });
    }
  );

  const scripts = [];

  $("script").each(
    (index, element) => {
      const node = $(element);

      const src =
        node.attr("src");

      const content =
        node.html() || "";

      const playerRelated =
        /player|video|jwplayer|plyr|hls|dash|iframe/i.test(
          `${src || ""} ${content}`
        );

      if (!playerRelated) {
        return;
      }

      scripts.push({
        index,

        src:
          src
            ? absoluteUrl(
                src,
                finalUrl
              )
            : null,

        inline:
          !src,

        // تشخيص فقط، لا نحفظ السكربت كاملًا
        preview:
          !src
            ? clean(content)
                .slice(0, 300)
            : null
      });
    }
  );

  const interestingElements = [];

  $(
    '[id*="player"],' +
    '[class*="player"],' +
    '[id*="video"],' +
    '[class*="video"]'
  ).each(
    (index, element) => {
      if (
        interestingElements.length >= 30
      ) {
        return;
      }

      const node =
        $(element);

      interestingElements.push({
        tag:
          element.tagName ||
          element.name ||
          null,

        id:
          node.attr("id") ||
          null,

        class:
          node.attr("class") ||
          null
      });
    }
  );

  return {
    source: "akwam",

    source_url:
      finalUrl,

    scraped_at:
      new Date()
        .toISOString(),

    watch: {
      id:
        watchId,

      episode_id:
        episodeId,

      title,
      h1
    },

    diagnostics: {
      iframe_count:
        iframes.length,

      video_count:
        videos.length,

      source_count:
        standaloneSources.length,

      player_script_count:
        scripts.length
    },

    iframes,
    videos,

    sources:
      standaloneSources,

    player_scripts:
      scripts,

    player_elements:
      interestingElements
  };
}

function saveJson(data) {
  const outputDir =
    path.join(
      process.cwd(),
      "data",
      "watch"
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

  const watchId =
    data.watch?.id ||
    "unknown";

  const filename =
    `watch-${watchId}.json`;

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
      "❌ ضع رابط صفحة المشاهدة بعد الأمر"
    );

    console.log("");
    console.log("مثال:");

    console.log(
      "node src/scraper/watch.js https://akwam.ss/watch/111112/60515"
    );

    process.exit(1);
  }

  try {
    console.log("");
    console.log(
      "📡 AKWAM WATCH INSPECTOR"
    );

    console.log("");

    const {
      response,
      finalUrl
    } =
      await requestPage(url);

    console.log("");
    console.log(
      "✅ WATCH PAGE RECEIVED"
    );

    console.log(
      "HTTP:",
      response.status
    );

    const data =
      inspectPage(
        response.data,
        finalUrl
      );

    const savedPath =
      saveJson(data);

    console.log("");
    console.log(
      "🎬 Watch ID:",
      data.watch.id
    );

    console.log(
      "🎞 Episode ID:",
      data.watch.episode_id
    );

    console.log("");
    console.log(
      "🔎 DIAGNOSTICS"
    );

    console.log(
      JSON.stringify(
        data.diagnostics,
        null,
        2
      )
    );

    console.log("");
    console.log(
      "🖼 IFRAMES"
    );

    console.log(
      JSON.stringify(
        data.iframes,
        null,
        2
      )
    );

    console.log("");
    console.log(
      "🎥 VIDEO ELEMENTS"
    );

    console.log(
      JSON.stringify(
        data.videos,
        null,
        2
      )
    );

    console.log("");
    console.log(
      "📦 SOURCE ELEMENTS"
    );

    console.log(
      JSON.stringify(
        data.sources,
        null,
        2
      )
    );

    console.log("");
    console.log(
      "🧩 PLAYER SCRIPTS"
    );

    console.log(
      JSON.stringify(
        data.player_scripts,
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
      "❌ WATCH INSPECTION FAILED"
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