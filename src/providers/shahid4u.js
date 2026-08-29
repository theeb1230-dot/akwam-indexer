const axios = require("axios");
const cheerio = require("cheerio");

class Shahid4uProvider {
  constructor() {
    this.name = "shahid4u";
    this.baseUrl = "https://shahid4u.run";

    this.stopWords = new Set([
      "مسلسل",
      "مشاهدة",
      "شاهد",
      "فور",
      "يو",
      "مترجم",
      "مترجمة",
      "مدبلج",
      "مدبلجة",
      "الموسم",
      "موسم",
      "الاول",
      "الأول",
      "الثاني",
      "الثالث",
      "الرابع",
      "الخامس",
      "السادس",
      "السابع",
      "الثامن",
      "التاسع",
      "العاشر",
      "حلقة",
      "الحلقة"
    ]);
  }

  clean(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  absoluteUrl(value) {
    if (!value) return null;

    try {
      return new URL(
        value,
        this.baseUrl
      ).href;
    } catch {
      return null;
    }
  }

  decodePath(url) {
    try {
      return decodeURIComponent(
        new URL(url).pathname
      );
    } catch {
      return String(url || "");
    }
  }

  normalizePath(url) {
    return this.decodePath(url)
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  buildUrl(idOrUrl) {
    const value =
      String(idOrUrl || "").trim();

    if (!value) {
      throw new Error(
        "Shahid4u URL or ID is required"
      );
    }

    if (
      value.startsWith("http://") ||
      value.startsWith("https://")
    ) {
      return value;
    }

    if (value.startsWith("/")) {
      return `${this.baseUrl}${value}`;
    }

    return `${this.baseUrl}/${value}`;
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

    return {
      html: response.data,

      status:
        response.status,

      finalUrl:
        response.request?.res
          ?.responseUrl ||
        url
    };
  }

  tokenize(value) {
    const text =
      this.clean(
        String(value || "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
      );

    return text
      .split(" ")
      .map(x => x.trim())
      .filter(Boolean)
      .filter(
        word =>
          !this.stopWords.has(word)
      )
      .filter(
        word =>
          !/^\d+$/.test(word)
      );
  }

  getSeriesIdentity(
    seriesUrl,
    title
  ) {
    const path =
      this.decodePath(
        seriesUrl
      );

    let slugPart = path;

    const marker =
      "/series/";

    const index =
      slugPart.indexOf(marker);

    if (index !== -1) {
      slugPart =
        slugPart.slice(
          index +
          marker.length
        );
    }

    const slugTokens =
      this.tokenize(
        slugPart
      );

    const titleTokens =
      this.tokenize(
        title
      );

    const combined =
      Array.from(
        new Set([
          ...slugTokens,
          ...titleTokens
        ])
      );

    /*
     * نفضل الكلمات الأكثر تمييزاً:
     * - الكلمات الإنجليزية مثل lucky
     * - الكلمات العربية الطويلة
     */

    return combined
      .filter(
        token =>
          token.length >= 3
      )
      .sort(
        (a, b) =>
          b.length -
          a.length
      );
  }

  belongsToSeries(
    episodeUrl,
    episodeText,
    identityTokens
  ) {
    if (
      !identityTokens ||
      identityTokens.length === 0
    ) {
      return false;
    }

    const candidate =
      this.clean(
        `${this.decodePath(
          episodeUrl
        )} ${episodeText}`
      ).toLowerCase();

    const matched =
      identityTokens.filter(
        token =>
          candidate.includes(
            token.toLowerCase()
          )
      );

    /*
     * إذا كان عندنا اسم مميز واحد فقط مثل Lucky،
     * يكفي وجوده.
     *
     * إذا كان الاسم عدة كلمات، نطلب على الأقل
     * كلمتين أو نصف الكلمات المميزة.
     */

    if (
      identityTokens.length === 1
    ) {
      return matched.length === 1;
    }

    const required =
      Math.min(
        2,
        Math.ceil(
          identityTokens.length / 2
        )
      );

    return (
      matched.length >= required
    );
  }

  extractEpisodeNumber(
    text,
    url
  ) {
    const values = [
      this.clean(text),
      this.decodePath(url)
    ];

    const patterns = [
      /الحلقة\s*(\d+)/i,
      /حلقة\s*(\d+)/i
    ];

    for (const value of values) {
      for (const pattern of patterns) {
        const match =
          value.match(pattern);

        if (match) {
          return Number(
            match[1]
          );
        }
      }
    }

    return null;
  }

  extractYear(value) {
    const match =
      String(value || "")
        .match(
          /\b(?:19|20)\d{2}\b/
        );

    return match
      ? Number(match[0])
      : null;
  }

  async getSeries(idOrUrl) {
    const url =
      this.buildUrl(
        idOrUrl
      );

    const page =
      await this.requestPage(
        url
      );

    const $ =
      cheerio.load(
        page.html
      );

    const title =
      this.clean(
        $("h1")
          .first()
          .text()
      ) ||
      this.clean(
        $('meta[property="og:title"]')
          .attr("content")
      ) ||
      this.clean(
        $("title")
          .text()
      );

    const description =
      this.clean(
        $('meta[name="description"]')
          .attr("content")
      );

    let image =
      $('meta[property="og:image"]')
        .attr("content") ||
      $('meta[name="twitter:image"]')
        .attr("content") ||
      null;

    if (image) {
      image =
        this.absoluteUrl(
          image
        );
    }

    const identityTokens =
      this.getSeriesIdentity(
        page.finalUrl,
        title
      );

    const episodes = [];

    $("a[href]").each(
      (_, element) => {
        const href =
          $(element)
            .attr("href");

        if (!href) {
          return;
        }

        const absolute =
          this.absoluteUrl(
            href
          );

        if (!absolute) {
          return;
        }

        let parsed;

        try {
          parsed =
            new URL(
              absolute
            );
        } catch {
          return;
        }

        if (
          !parsed.hostname
            .includes(
              "shahid4u"
            )
        ) {
          return;
        }

        if (
          parsed.pathname
            .includes(
              "/series/"
            ) ||
          parsed.pathname
            .includes(
              "/season/"
            )
        ) {
          return;
        }

        const text =
          this.clean(
            $(element)
              .text()
          );

        const number =
          this.extractEpisodeNumber(
            text,
            absolute
          );

        if (
          !Number.isInteger(
            number
          ) ||
          number <= 0
        ) {
          return;
        }

        /*
         * أهم فلتر:
         * لا نقبل الحلقة إلا إذا كانت
         * من نفس المسلسل.
         */

        if (
          !this.belongsToSeries(
            absolute,
            text,
            identityTokens
          )
        ) {
          return;
        }

        episodes.push({
          id:
            this.normalizePath(
              absolute
            ),

          number,

          title:
            text ||
            `الحلقة ${number}`,

          page_url:
            absolute
        });
      }
    );

    /*
     * قد يظهر نفس رقم الحلقة أكثر من مرة
     * داخل الصفحة، لذلك نحتفظ بنسخة واحدة.
     */

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
        page.finalUrl,

      series: {
        title,
        description,
        image,

        language:
          "العربية",

        quality:
          null,

        country:
          null,

        year:
          this.extractYear(
            `${title} ${description}`
          )
      },

      episodes:
        uniqueEpisodes
    };
  }

  async getEpisode(idOrUrl) {
    const url =
      this.buildUrl(
        idOrUrl
      );

    const page =
      await this.requestPage(
        url
      );

    const $ =
      cheerio.load(
        page.html
      );

    const title =
      this.clean(
        $("h1")
          .first()
          .text()
      ) ||
      this.clean(
        $('meta[property="og:title"]')
          .attr("content")
      ) ||
      this.clean(
        $("title")
          .text()
      );

    const description =
      this.clean(
        $('meta[name="description"]')
          .attr("content")
      );

    let image =
      $('meta[property="og:image"]')
        .attr("content") ||
      $('meta[name="twitter:image"]')
        .attr("content") ||
      null;

    if (image) {
      image =
        this.absoluteUrl(
          image
        );
    }

    let seriesUrl = null;

    $("a[href]").each(
      (_, element) => {
        if (seriesUrl) {
          return;
        }

        const href =
          $(element)
            .attr("href");

        if (!href) {
          return;
        }

        const absolute =
          this.absoluteUrl(
            href
          );

        if (!absolute) {
          return;
        }

        try {
          if (
            new URL(
              absolute
            )
              .pathname
              .includes(
                "/series/"
              )
          ) {
            seriesUrl =
              absolute;
          }
        } catch {}
      }
    );

    return {
      provider:
        this.name,

      source_url:
        page.finalUrl,

      episode: {
        id:
          this.normalizePath(
            page.finalUrl
          ),

        title,
        description,
        image,

        series_url:
          seriesUrl
      },

      qualities: [],

      watch_options: []
    };
  }

  async search(query) {
    const q =
      this.clean(query);

    if (!q) {
      return [];
    }

    const searchUrl =
      `${this.baseUrl}/filtering?keywords=${encodeURIComponent(q)}`;

    const page =
      await this.requestPage(
        searchUrl
      );

    const $ =
      cheerio.load(
        page.html
      );

    /*
     * Shahid4u لا يعرض رابط /series/ مباشرة
     * في نتائج البحث.
     *
     * لذلك نلتقط الحلقات أولاً، لكن نحتفظ
     * بحلقة ممثلة واحدة فقط لكل عنوان أساسي.
     */
    const candidates =
      new Map();

    $("a[href]").each(
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

        const img =
          node.find("img").first();

        const rawTitle =
          this.clean(
            node.attr("title") ||
            img.attr("title") ||
            img.attr("alt") ||
            node.text()
          );

        if (!rawTitle) {
          return;
        }

        /*
         * نريد نتائج حلقات المسلسلات هنا.
         * الأفلام المشابهة مثل Lucky Strike
         * لا تدخل على أنها مسلسل Lucky.
         */
        if (
          !/الحلقة\s*\d+/i.test(
            rawTitle
          )
        ) {
          return;
        }

        let baseTitle =
          rawTitle

            /*
             * نحذف كل شيء ابتداءً من "الحلقة".
             */
            .replace(
              /الحلقة\s*\d+.*$/i,
              ""
            )

            /*
             * تنظيف كلمات العرض الشائعة.
             */
            .replace(
              /\bمشاهدة\b/gi,
              " "
            )

            .replace(
              /\bمسلسل\b/gi,
              " "
            )

            .replace(
              /\bمترجم(?:ة)?\b/gi,
              " "
            )

            .replace(
              /\bمدبلج(?:ة)?\b/gi,
              " "
            )

            .replace(
              /\(\s*(?:19|20)\d{2}\s*\)/g,
              " "
            );

        baseTitle =
          this.clean(
            baseTitle
          );

        if (!baseTitle) {
          return;
        }

        const key =
          baseTitle.toLowerCase();

        if (
          candidates.has(key)
        ) {
          return;
        }

        candidates.set(
          key,
          {
            title:
              baseTitle,

            episode_url:
              href,

            image:
              this.absoluteUrl(
                img.attr("data-src") ||
                img.attr("src")
              )
          }
        );
      }
    );

    /*
     * حد حماية:
     * حتى لو الموقع أعاد نتائج ضخمة،
     * لا نسمح لبحث مستخدم واحد بفتح
     * عدد غير محدود من الصفحات.
     */
    const representatives =
      Array.from(
        candidates.values()
      ).slice(0, 8);

    const results =
      new Map();

    /*
     * نحل كل مرشح بالتتابع.
     * هذا أبطأ قليلاً من Promise.all،
     * لكنه ألطف على المصدر وعلى سيرفرنا.
     */
    for (
      const candidate
      of representatives
    ) {
      try {
        const episode =
          await this.getEpisode(
            candidate.episode_url
          );

        const seriesUrl =
          episode?.episode
            ?.series_url;

        if (!seriesUrl) {
          continue;
        }

        const providerSeriesId =
          this.normalizePath(
            seriesUrl
          );

        if (!providerSeriesId) {
          continue;
        }

        if (
          results.has(
            providerSeriesId
          )
        ) {
          continue;
        }

        results.set(
          providerSeriesId,
          {
            provider:
              this.name,

            provider_series_id:
              providerSeriesId,

            title:
              candidate.title,

            image:
              candidate.image ||
              episode?.episode
                ?.image ||
              null,

            source_url:
              seriesUrl,

            type:
              "series"
          }
        );
      } catch (error) {
        /*
         * فشل نتيجة واحدة لا يفشل
         * بحث Shahid4u كله.
         */
        console.warn(
          "[Shahid4u search] candidate failed:",
          error.message
        );
      }
    }

    return Array.from(
      results.values()
    );
  }

  async getWatchInfo(
    watchId,
    episodeId
  ) {
    return {
      provider:
        this.name,

      watch: {
        id:
          String(
            watchId
          ),

        episode_id:
          String(
            episodeId
          )
      },

      player:
        "unknown",

      source_count:
        0,

      available_qualities:
        [],

      media_types:
        []
    };
  }
}

module.exports =
  new Shahid4uProvider();
