const axios = require("axios");
const cheerio = require("cheerio");

class CimaLeekProvider {
  constructor() {
    this.id = "cimaleek";
    this.name = "CimaLeek";
    this.baseUrl = "https://web.cimalek.buzz";

    this.http = axios.create({
      timeout: 20000,
      maxRedirects: 10,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "ar,en;q=0.8"
      }
    });
  }

  cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizeUrl(value, base = this.baseUrl) {
    if (!value) return null;

    const raw = String(value).trim();

    if (
      !raw ||
      raw.startsWith("data:") ||
      raw.startsWith("javascript:")
    ) {
      return null;
    }

    try {
      return new URL(raw, base).href;
    } catch {
      return null;
    }
  }

  async fetchPage(url) {
    const response = await this.http.get(url);

    if (response.status !== 200) {
      throw new Error(
        `CimaLeek returned HTTP ${response.status}`
      );
    }

    return {
      html: response.data,
      finalUrl:
        response.request?.res?.responseUrl || url
    };
  }

  extractSeriesId(url) {
    try {
      const pathname =
        new URL(url, this.baseUrl).pathname;

      const match =
        pathname.match(
          /\/series\/(.+?)-(\d+)\/?$/i
        );

      if (!match) return null;

      return {
        slug: match[1],
        id: match[2]
      };
    } catch {
      return null;
    }
  }

  extractMeta($, property, name) {
    if (property) {
      const value =
        $(`meta[property="${property}"]`)
          .attr("content");

      if (value) {
        return this.cleanText(value);
      }
    }

    if (name) {
      const value =
        $(`meta[name="${name}"]`)
          .attr("content");

      if (value) {
        return this.cleanText(value);
      }
    }

    return null;
  }

  extractTitle($) {
    return (
      this.extractMeta(
        $,
        "og:title"
      ) ||
      this.cleanText(
        $("h1").first().text()
      ) ||
      this.cleanText(
        $("title").text()
      ) ||
      null
    );
  }

  extractDescription($) {
    return (
      this.extractMeta(
        $,
        "og:description"
      ) ||
      this.extractMeta(
        $,
        null,
        "description"
      ) ||
      null
    );
  }

  extractImage($, baseUrl) {
    const candidates = [
      this.extractMeta(
        $,
        "og:image"
      ),

      this.extractMeta(
        $,
        null,
        "twitter:image"
      )
    ];

    for (const candidate of candidates) {
      const url =
        this.normalizeUrl(
          candidate,
          baseUrl
        );

      if (url) {
        return url;
      }
    }

    for (const element of $("img").toArray()) {
      const img = $(element);

      const raw =
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        img.attr("data-original") ||
        img.attr("src");

      const url =
        this.normalizeUrl(
          raw,
          baseUrl
        );

      if (url) {
        return url;
      }
    }

    return null;
  }

  extractSeasonNumber(text, url) {
    const cleaned =
      this.cleanText(text);

    const patterns = [
      /(?:الموسم|season)\s*(\d+)/i,
      /^(\d{1,2})$/
    ];

    for (const pattern of patterns) {
      const match =
        cleaned.match(pattern);

      if (match) {
        return Number(match[1]);
      }
    }

    try {
      const pathname =
        new URL(url).pathname;

      const match =
        pathname.match(
          /season[-_]?(\d+)/i
        );

      if (match) {
        return Number(match[1]);
      }
    } catch {}

    return null;
  }

  extractEpisodeNumber(text, fallbackIndex) {
    const cleaned =
      this.cleanText(text);

    const patterns = [
      /(?:الحلقة|episode|ep)\s*0*(\d+)/i,
      /\((\d+)\)/,
      /^0*(\d+)$/
    ];

    for (const pattern of patterns) {
      const match =
        cleaned.match(pattern);

      if (match) {
        return Number(match[1]);
      }
    }

    return fallbackIndex;
  }

  extractSeasonLinks($, pageUrl) {
    const seasons = new Map();

    $('a[href*="/seasons/"]').each(
      (_, element) => {
        const raw =
          $(element).attr("href");

        const url =
          this.normalizeUrl(
            raw,
            pageUrl
          );

        if (!url) return;

        const text =
          this.cleanText(
            $(element).text()
          );

        if (!seasons.has(url)) {
          seasons.set(url, {
            url,
            title: text,
            number:
              this.extractSeasonNumber(
                text,
                url
              )
          });
        }
      }
    );

    return [...seasons.values()];
  }

  extractEpisodeLinks(
    $,
    pageUrl,
    seasonNumber = null
  ) {
    const episodes =
      new Map();

    let fallbackIndex = 0;

    $('a[href*="/episodes/"]').each(
      (_, element) => {
        const raw =
          $(element).attr("href");

        const url =
          this.normalizeUrl(
            raw,
            pageUrl
          );

        if (!url) return;

        if (episodes.has(url)) {
          return;
        }

        fallbackIndex++;

        const text =
          this.cleanText(
            $(element).text()
          );

        const number =
          this.extractEpisodeNumber(
            text,
            fallbackIndex
          );

        episodes.set(url, {
          id: url,
          number,
          season: seasonNumber,
          title:
            text ||
            `الحلقة ${number}`,
          source_url: url
        });
      }
    );

    return [...episodes.values()];
  }

  async search(query) {
    const keyword =
      this.cleanText(query);

    if (!keyword) {
      return [];
    }

    const response =
      await this.http.get(
        `${this.baseUrl}/`,
        {
          params: {
            s: keyword
          }
        }
      );

    const finalUrl =
      response.request?.res
        ?.responseUrl ||
      `${this.baseUrl}/`;

    const $ =
      cheerio.load(
        response.data
      );

    const results =
      new Map();

    $('a[href*="/series/"]').each(
      (_, element) => {
        const a =
          $(element);

        const url =
          this.normalizeUrl(
            a.attr("href"),
            finalUrl
          );

        if (!url) {
          return;
        }

        const identity =
          this.extractSeriesId(url);

        if (!identity) {
          return;
        }

        const img =
          a.find("img").first();

        const title =
          this.cleanText(
            a.attr("title") ||
            img.attr("alt") ||
            a.text()
          );

        if (!title) {
          return;
        }

        const image =
          this.normalizeUrl(
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("data-original") ||
            img.attr("src"),
            finalUrl
          );

        if (
          !results.has(
            identity.id
          )
        ) {
          results.set(
            identity.id,
            {
              provider:
                this.id,

              provider_series_id:
                identity.id,

              title,

              image,

              source_url:
                url,

              type:
                "series"
            }
          );
        }
      }
    );

    return [
      ...results.values()
    ];
  }

  async getSeries(seriesId) {
    const inputUrl =
      this.normalizeUrl(seriesId);

    if (!inputUrl) {
      throw new Error(
        "CimaLeek requires a valid series URL"
      );
    }

    const identity =
      this.extractSeriesId(inputUrl);

    if (!identity) {
      throw new Error(
        "Invalid CimaLeek series URL"
      );
    }

    const {
      html,
      finalUrl
    } =
      await this.fetchPage(
        inputUrl
      );

    const $ =
      cheerio.load(html);

    const seasons =
      this.extractSeasonLinks(
        $,
        finalUrl
      );

    const allEpisodes =
      new Map();

    if (seasons.length > 0) {
      for (const season of seasons) {
        try {
          const seasonPage =
            await this.fetchPage(
              season.url
            );

          const $$ =
            cheerio.load(
              seasonPage.html
            );

          const episodes =
            this.extractEpisodeLinks(
              $$,
              seasonPage.finalUrl,
              season.number
            );

          for (const episode of episodes) {
            allEpisodes.set(
              episode.id,
              episode
            );
          }
        } catch (error) {
          console.warn(
            `CimaLeek season failed: ${season.url}: ${error.message}`
          );
        }
      }
    }

    if (allEpisodes.size === 0) {
      const fallbackEpisodes =
        this.extractEpisodeLinks(
          $,
          finalUrl
        );

      for (
        const episode
        of fallbackEpisodes
      ) {
        allEpisodes.set(
          episode.id,
          episode
        );
      }
    }

    const episodes =
      [...allEpisodes.values()]
        .sort((a, b) => {
          const seasonA =
            a.season ?? 0;

          const seasonB =
            b.season ?? 0;

          if (seasonA !== seasonB) {
            return seasonA - seasonB;
          }

          return a.number - b.number;
        });

    if (!episodes.length) {
      throw new Error(
        "No CimaLeek episodes discovered"
      );
    }

    return {
      provider:
        this.id,

      source_url:
        finalUrl,

      series: {
        id:
          identity.id,

        title:
          this.extractTitle($),

        description:
          this.extractDescription($),

        image:
          this.extractImage(
            $,
            finalUrl
          ),

        language:
          null,

        quality:
          null,

        country:
          null,

        year:
          null
      },

      episodes
    };
  }

  async getEpisode(episodeId) {
    const inputUrl =
      this.normalizeUrl(
        episodeId
      );

    if (!inputUrl) {
      throw new Error(
        "Invalid CimaLeek episode URL"
      );
    }

    const {
      html,
      finalUrl
    } =
      await this.fetchPage(
        inputUrl
      );

    const $ =
      cheerio.load(html);

    return {
      provider:
        this.id,

      source_url:
        finalUrl,

      episode: {
        id:
          inputUrl,

        title:
          this.extractTitle($),

        description:
          this.extractDescription($),

        image:
          this.extractImage(
            $,
            finalUrl
          )
      },

      qualities:
        [],

      watch_options:
        []
    };
  }

  async getWatchInfo(
    watchId,
    episodeId
  ) {
    const url =
      this.normalizeUrl(
        episodeId ||
        watchId
      );

    if (!url) {
      throw new Error(
        "Invalid CimaLeek URL"
      );
    }

    const {
      html,
      finalUrl
    } =
      await this.fetchPage(url);

    const $ =
      cheerio.load(html);

    return {
      provider:
        this.id,

      source_url:
        finalUrl,

      player: {
        iframe_count:
          $("iframe[src]").length,

        video_count:
          $("video").length,

        source_count:
          $("video source").length
      },

      qualities:
        []
    };
  }
}

module.exports =
  new CimaLeekProvider();
