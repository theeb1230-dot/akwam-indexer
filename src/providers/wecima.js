const axios = require("axios");
const cheerio = require("cheerio");

class WeCimaProvider {
  constructor() {
    this.name = "wecima";
    this.baseUrl = "https://mywecima.beauty";
  }

  clean(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  absoluteUrl(url) {
    if (!url) return null;

    try {
      return new URL(
        url,
        this.baseUrl
      ).href;
    } catch {
      return null;
    }
  }

  extractVid(url) {
    if (!url) return null;

    return String(url)
      .match(/[?&]vid=([^&#]+)/i)?.[1] || null;
  }

  async requestPage(url) {
    const response =
      await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",

          "Accept-Language":
            "ar,en;q=0.8"
        },

        validateStatus(status) {
          return (
            status >= 200 &&
            status < 400
          );
        }
      });

    return response.data;
  }

  buildWatchUrl(id) {
    return (
      `${this.baseUrl}/watch.php?vid=` +
      encodeURIComponent(String(id))
    );
  }

  async getDownloadOptions(episodeId) {
    const id =
      this.extractVid(episodeId) ||
      String(episodeId || "").trim();

    if (!id) {
      throw new Error("EPISODE_ID_REQUIRED");
    }

    return [{
      download_id: id,
      type: "external_download_page",
      quality: null,
      format: "unknown",
      availability: "unknown",
      page_url:
        `${this.baseUrl}/downloads.php?vid=` +
        encodeURIComponent(id)
    }];
  }

  async getSeries(idOrUrl) {
    const url =
      String(idOrUrl).startsWith("http")
        ? String(idOrUrl)
        : this.buildWatchUrl(idOrUrl);

    const html =
      await this.requestPage(url);

    const $ =
      cheerio.load(html);

    const title =
      this.clean(
        $("h1").first().text()
      ) ||
      this.clean(
        $("title").first().text()
      );

    const description =
      this.clean(
        $('meta[name="description"]')
          .attr("content")
      );

    const image =
      $('meta[property="og:image"]')
        .attr("content") ||
      $('meta[name="twitter:image"]')
        .attr("content") ||
      null;

    const episodes = [];

    $("a[href*='watch.php?vid=']")
      .each((_, el) => {
        const href =
          $(el).attr("href");

        const text =
          this.clean(
            $(el).text()
          );

        if (!href || !text) {
          return;
        }

        const match =
          text.match(
            /الحلقة\s*(\d+)/i
          );

        if (!match) {
          return;
        }

        const absolute =
          this.absoluteUrl(href);

        if (!absolute) {
          return;
        }

        const id =
          this.extractVid(
            absolute
          );

        if (!id) {
          return;
        }

        episodes.push({
          id,

          number:
            Number(match[1]),

          title:
            text,

          page_url:
            absolute
        });
      });

    const uniqueEpisodes =
      Array.from(
        new Map(
          episodes.map(
            episode => [
              episode.number,
              episode
            ]
          )
        ).values()
      ).sort(
        (a, b) =>
          a.number -
          b.number
      );

    return {
      provider:
        this.name,

      source_url:
        url,

      series: {
        title,
        description,
        image,

        language:
          null,

        quality:
          null,

        country:
          null,

        year:
          null
      },

      episodes:
        uniqueEpisodes
    };
  }

  async getEpisode(idOrUrl) {
    const url =
      String(idOrUrl).startsWith("http")
        ? String(idOrUrl)
        : this.buildWatchUrl(idOrUrl);

    const html =
      await this.requestPage(url);

    const $ =
      cheerio.load(html);

    const title =
      this.clean(
        $("h1").first().text()
      ) ||
      this.clean(
        $("title").first().text()
      );

    const description =
      this.clean(
        $('meta[name="description"]')
          .attr("content")
      );

    const image =
      $('meta[property="og:image"]')
        .attr("content") ||
      $('meta[name="twitter:image"]')
        .attr("content") ||
      null;

    const id =
      this.extractVid(url) ||
      String(idOrUrl);

    return {
      provider:
        this.name,

      source_url:
        url,

      episode: {
        id,
        title,
        description,
        image
      },

      qualities: [],

      watch_options: [
        {
          watch_id:
            id,

          page_url:
            `https://mywecima.beauty/play.php?vid=${encodeURIComponent(id)}`,

          type:
            "embed"
        }
      ]
    };
  }

  async search(query) {
    const q =
      this.clean(query);

    if (!q) {
      return [];
    }

    const searchUrl =
      `https://mywecima.beauty/search.php?keywords=${encodeURIComponent(q)}`;

    const html =
      await this.requestPage(searchUrl);

    const $ =
      cheerio.load(html);

    const results =
      new Map();

    $('a[href*="watch.php?vid="]').each(
      (_, element) => {
        const node =
          $(element);

        const href =
          this.absoluteUrl(
            node.attr("href")
          );

        if (!href) {
          return;
        }

        const id =
          this.extractVid(href);

        if (!id) {
          return;
        }

        const img =
          node.find("img").first();

        const title =
          this.clean(
            node.attr("title") ||
            img.attr("title") ||
            img.attr("alt") ||
            node.text()
          );

        if (!title) {
          return;
        }

        /*
         * لا نعرض الحلقات المنفردة كنتائج أعمال.
         */
        if (
          /الحلقة\s*\d+/i.test(title)
        ) {
          return;
        }

        const image =
          this.absoluteUrl(
            img.attr("data-src") ||
            img.attr("src")
          );

        /*
         * Dedupe:
         * نفس vid قد يظهر بأكثر من <a>.
         */
        if (
          !results.has(id)
        ) {
          results.set(
            id,
            {
              provider:
                this.name,

              provider_series_id:
                id,

              title,

              image:
                image || null,

              source_url:
                href,

              type:
                /(?:^|\s)(فيلم|movie)(?:\s|$)/i.test(title)
                  ? "movie"
                  : "series"
            }
          );
        }
      }
    );

    return Array.from(
      results.values()
    );
  }

  async getWatchInfo(watchId, episodeId) {
    const id =
      String(episodeId || watchId || "")
        .trim();

    if (!id) {
      throw new Error(
        "WeCima getWatchInfo: missing episode id"
      );
    }

    const playUrl =
      `https://mywecima.beauty/play.php?vid=${encodeURIComponent(id)}`;

    const html =
      await this.requestPage(playUrl);

    const $ =
      cheerio.load(html);

    /*
     * ترتيب السيرفرات المعتمد في ذيب.
     * السيرفرات الأخرى لا تدخل ضمن خيارات التشغيل.
     */
    const priority = [
      "mp4",
      "mp4plus",
      "anafast",
      "vidspeed",
      "mixdrop",
      "vidara",
      "vibuxer",
      "dhtpre",
      "bysesukior",
      "uqload",
      "dsvplay"
    ];

    const servers = [];
    const observedServers = [];

    const rawServerCount =
      $("li[data-embed]").length;

    $("li[data-embed]").each(
      (_, element) => {
        const node =
          $(element);

        const rawEmbed =
          node.attr("data-embed") || "";

        if (!rawEmbed) {
          return;
        }

        const decoded =
          cheerio.load(
            `<div>${rawEmbed}</div>`
          );

        let embedUrl =
          decoded("iframe")
            .first()
            .attr("src");

        if (!embedUrl) {
          const match =
            rawEmbed.match(
              /(?:src\s*=\s*["'])([^"']+)/i
            );

          embedUrl =
            match ? match[1] : null;
        }

        if (!embedUrl) {
          return;
        }

        embedUrl =
          this.absoluteUrl(embedUrl) ||
          embedUrl;

        let name =
          this.clean(
            node.find("strong")
              .first()
              .text()
          );

        if (!name) {
          name =
            String(
              node.attr("id") || ""
            ).replace(
              /^server_/i,
              ""
            );
        }

        if (!name) {
          return;
        }

        const key =
          name
            .toLowerCase()
            .replace(
              /[^a-z0-9]/g,
              ""
            );

        const serverKey =
          key === "mxdrop"
            ? "mixdrop"
            : key;

        const rank =
          priority.indexOf(
            serverKey
          );

        observedServers.push({
          name,
          normalized_key: key,
          accepted: rank !== -1,
          embed_hostname: (() => {
            try {
              return new URL(
                embedUrl
              ).hostname;
            } catch {
              return null;
            }
          })()
        });

        /*
         * نستبعد السيرفرات التي ثبت أنها غير مناسبة.
         */
        if (rank === -1) {
          return;
        }

        servers.push({
          id:
            `${id}:${key}`,

          name,

          server:
            serverKey,

          type:
            "embed",

          embed_url:
            embedUrl,

          url:
            embedUrl,

          priority:
            rank + 1
        });
      }
    );

    servers.sort(
      (a, b) =>
        a.priority - b.priority
    );

    return {
      provider:
        this.name,

      source_url:
        playUrl,

      watch: {
        id:
          String(watchId || id),

        episode_id:
          id
      },

      player:
        servers.length
          ? "embed"
          : "unknown",

      source_count:
        servers.length,

      available_qualities:
        [],

      media_types:
        servers.length
          ? ["embed"]
          : [],

      resolution_trace: [
        {
          stage: "provider_episode_mapping",
          status: "ok",
          episode_id: id
        },
        {
          stage: "play_page",
          status: "ok",
          url: playUrl
        },
        {
          stage: "watch_options",
          status:
            rawServerCount > 0
              ? "found"
              : "empty",
          raw_count:
            rawServerCount,
          accepted_count:
            servers.length
        },
        {
          stage: "candidate_normalization",
          status:
            servers.length > 0
              ? "ok"
              : "empty",
          accepted_servers:
            servers.map(
              item => item.server
            ),
          observed_servers:
            observedServers
        }
      ],

      watch_options:
        servers,

      sources:
        servers
    };
  }
}

module.exports =
  new WeCimaProvider();
