const cheerio = require("cheerio");
const { safeGet } = require("../services/safe-media-request");

const BASE = "https://akwam.ss";

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

function absoluteUrl(value, base = BASE) {
  if (!value) return null;

  try {
    return new URL(value, base).href;
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

function extractEpisodeNumber(text = "") {
  const value = clean(text);

  const patterns = [
    /(?:الحلقة|حلقة)\s*[-:]?\s*(\d+)/i,
    /episode\s*[-:]?\s*(\d+)/i,
    /\bE(?:P)?\s*0*(\d+)\b/i
  ];

  for (const pattern of patterns) {
    const match =
      value.match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function getEpisodeId(url) {
  const match =
    String(url || "").match(
      /\/episode\/(\d+)/
    );

  return match
    ? match[1]
    : null;
}

function getWatchInfoFromUrl(url) {
  const match =
    String(url || "").match(
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

function findValue(bodyText, label) {
  const text =
    clean(bodyText);

  const escaped =
    label.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const regex =
    new RegExp(
      `${escaped}\\s*[:：]?\\s*([^|•]+?)` +
      `(?=\\s+(?:اللغة|الجودة|السنة|انتاج|الإنتاج|مدة|التصنيف|$))`,
      "i"
    );

  const match =
    text.match(regex);

  return match
    ? clean(match[1])
    : null;
}

async function requestPage(url) {
  const response =
    await safeGet(url, {
      timeout: 20000,

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

      validateStatus: status => status >= 200 && status < 400
    }, {
      maxRedirects: 5
    });

  return {
    response,
    finalUrl: response.finalUrl
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

      const quality =
        detectQuality(
          node.text()
        );

      if (!quality) return;

      map[match[1]] =
        quality;
    }
  );

  return map;
}

class AkwamProvider {
  constructor() {
    this.id = "akwam";
    this.name = "Akwam";
    this.baseUrl = BASE;
  }

  async search(query) {
    const q = clean(query);

    if (!q) {
      return [];
    }

    const url =
      `${BASE}/search?q=${encodeURIComponent(q)}`;

    const {
      response,
      finalUrl
    } = await requestPage(url);

    const $ =
      cheerio.load(response.data);

    const results = new Map();

    $('a[href*="/series/"]').each(
      (index, element) => {
        const node = $(element);

        const href =
          absoluteUrl(
            node.attr("href"),
            finalUrl
          );

        if (!href) {
          return;
        }

        const match =
          href.match(
            /\/series\/(\d+)(?:\/|$)/
          );

        if (!match) {
          return;
        }

        const providerSeriesId =
          match[1];

        if (results.has(providerSeriesId)) {
          return;
        }

        const container =
          node.closest(
            ".movie, .entry, .item, .box, article, li"
          );

        const img =
          node.find("img").first().length
            ? node.find("img").first()
            : container.find("img").first();

        const image =
          absoluteUrl(
            img.attr("data-src") ||
            img.attr("src"),
            finalUrl
          );

        const imageAlt =
          clean(
            img.attr("alt")
          );

        const anchorText =
          clean(
            node.text()
          );

        const containerText =
          clean(
            container.text()
          );

        const title =
          imageAlt ||
          anchorText ||
          containerText ||
          null;

        if (!title) {
          return;
        }

        results.set(
          providerSeriesId,
          {
            provider: this.id,
            provider_series_id:
              providerSeriesId,

            title,

            image: image || null,

            source_url: href,

            type: "series"
          }
        );
      }
    );

    return Array.from(
      results.values()
    );
  }

  async getSeries(idOrUrl) {
    const url =
      String(idOrUrl).startsWith("http")
        ? idOrUrl
        : `${BASE}/series/${idOrUrl}`;

    const {
      response,
      finalUrl
    } =
      await requestPage(url);

    const $ =
      cheerio.load(
        response.data
      );

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
          .attr("content"),
        finalUrl
      );

    const bodyText =
      $("body").text();

    const episodesMap =
      new Map();

    $('a[href*="/episode/"]').each(
      (index, element) => {
        const node =
          $(element);

        const href =
          absoluteUrl(
            node.attr("href"),
            finalUrl
          );

        if (!href) return;

        const text =
          clean(
            node.text()
          );

        const number =
          extractEpisodeNumber(
            text
          ) ||
          extractEpisodeNumber(
            href
          );

        const id =
          getEpisodeId(
            href
          );

        if (
          !number ||
          !id
        ) {
          return;
        }

        if (
          !episodesMap.has(
            number
          )
        ) {
          episodesMap.set(
            number,
            {
              id,
              number,
              title:
                text ||
                `الحلقة ${number}`,
              page_url:
                href
            }
          );
        }
      }
    );

    const episodes =
      [
        ...episodesMap.values()
      ].sort(
        (a, b) =>
          a.number -
          b.number
      );

    return {
      provider:
        this.id,

      source_url:
        finalUrl,

      series: {
        title,
        description,
        image,

        language:
          findValue(
            bodyText,
            "اللغة"
          ),

        quality:
          findValue(
            bodyText,
            "الجودة"
          ),

        country:
          findValue(
            bodyText,
            "انتاج"
          ) ||
          findValue(
            bodyText,
            "الإنتاج"
          ),

        year:
          findValue(
            bodyText,
            "السنة"
          )
      },

      episode_count:
        episodes.length,

      episodes
    };
  }

  async getEpisode(idOrUrl) {
    const url =
      String(idOrUrl)
        .startsWith("http")
        ? idOrUrl
        : `${BASE}/episode/${idOrUrl}`;

    const {
      response,
      finalUrl
    } =
      await requestPage(url);

    const $ =
      cheerio.load(
        response.data
      );

    const episodeId =
      getEpisodeId(
        finalUrl
      );

    const title =
      clean(
        $("h1")
          .first()
          .text()
      ) ||
      null;

    const description =
      clean(
        $('meta[name="description"]')
          .attr("content")
      ) ||
      null;

    const image =
      absoluteUrl(
        $('meta[property="og:image"]')
          .attr("content"),
        finalUrl
      );

    const tabQualityMap =
      buildTabQualityMap($);

    const watchOptions = [];
    const seen =
      new Set();

    for (
      const [tabId, quality]
      of Object.entries(
        tabQualityMap
      )
    ) {
      const tab =
        $(`#${tabId}`);

      tab.find(
        'a[href*="/watch/"]'
      ).each(
        (index, element) => {
          const watchUrl =
            absoluteUrl(
              $(element)
                .attr("href"),
              finalUrl
            );

          if (!watchUrl) {
            return;
          }

          const info =
            getWatchInfoFromUrl(
              watchUrl
            );

          if (
            info.episodeId !==
            String(
              episodeId
            )
          ) {
            return;
          }

          if (
            seen.has(
              watchUrl
            )
          ) {
            return;
          }

          seen.add(
            watchUrl
          );

          watchOptions.push({
            quality,

            watch_id:
              info.watchId,

            page_url:
              watchUrl
          });
        }
      );
    }

    return {
      provider:
        this.id,

      source_url:
        finalUrl,

      episode: {
        id:
          episodeId,

        title,
        description,
        image
      },

      qualities:
        [
          ...new Set(
            watchOptions
              .map(
                item =>
                  item.quality
              )
              .filter(Boolean)
          )
        ],

      watch_options:
        watchOptions
    };
  }

  async getWatchInfo(
    watchId,
    episodeId
  ) {
    const url =
      `${BASE}/watch/${watchId}/${episodeId}`;

    const {
      response,
      finalUrl
    } =
      await requestPage(url);

    const $ =
      cheerio.load(
        response.data
      );

    const video =
      $("video#player")
        .first();

    const sources = [];

    video
      .find("source")
      .each(
        (index, element) => {
          const node =
            $(element);

          const src =
            node.attr("src") ||
            "";

          if (!src) {
            return;
          }

          sources.push({
            quality:
              detectQuality(
                src
              ),

            type:
              node.attr("type") ||
              null,

            direct_url:
              absoluteUrl(
                src,
                finalUrl
              )
          });
        }
      );

    const playerScript =
      $("script")
        .toArray()
        .some(
          element =>
            /new\s+Plyr\s*\(/i.test(
              $(element)
                .html() ||
                ""
            )
        );

    return {
      provider:
        this.id,

      source_url:
        finalUrl,

      watch: {
        id:
          String(watchId),

        episode_id:
          String(
            episodeId
          )
      },

      player:
        playerScript
          ? "plyr"
          : video.length
            ? "html5"
            : "unknown",

      source_count:
        sources.length,

      available_qualities:
        [
          ...new Set(
            sources
              .map(
                item =>
                  item.quality
              )
              .filter(Boolean)
          )
        ],

      media_types:
        [
          ...new Set(
            sources
              .map(
                item =>
                  item.type
              )
              .filter(Boolean)
          )
        ],

      sources
    };
  }
}

module.exports =
  new AkwamProvider();
