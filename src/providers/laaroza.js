const axios = require("axios");
const cheerio = require("cheerio");

class LaarozaProvider {
  constructor() {
    this.name = "Laaroza";
    this.baseUrl = "https://laaroza.shop";

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

  absoluteUrl(value, base = this.baseUrl) {
    if (!value) return null;

    try {
      return new URL(value, base).href;
    } catch {
      return null;
    }
  }

  getMeta($, selector, attribute = "content") {
    return this.cleanText(
      $(selector).first().attr(attribute)
    );
  }

  extractEpisodeNumber(text, url = "") {
    const clean = this.cleanText(text);

    const patterns = [
      /الحلقة\s*0*(\d+)/i,
      /0*(\d+)\s*الحلقة/i,
      /حلقة\s*0*(\d+)/i,
      /0*(\d+)\s*حلقة/i,
      /episode\s*0*(\d+)/i,
      /0*(\d+)\s*episode/i,
      /\bep(?:isode)?[-\s]*0*(\d+)\b/i
    ];

    for (const pattern of patterns) {
      const match = clean.match(pattern);

      if (match) {
        return Number(match[1]);
      }
    }

    try {
      const parsed = new URL(url);

      const possible =
        parsed.searchParams.get("episode") ||
        parsed.searchParams.get("ep");

      if (possible && /^\d+$/.test(possible)) {
        return Number(possible);
      }
    } catch {}

    return null;
  }

  extractVid(url) {
    try {
      const parsed = new URL(url, this.baseUrl);

      return (
        parsed.searchParams.get("vid") ||
        parsed.href
      );
    } catch {
      return String(url);
    }
  }

  isEpisodeUrl(url) {
    try {
      const parsed =
        new URL(
          url,
          this.baseUrl
        );

      const hostname =
        parsed.hostname
          .toLowerCase();

      const allowedHost =
        hostname === "laaroza.shop" ||
        hostname.endsWith(".laaroza.shop") ||
        hostname === "laaroza.pics" ||
        hostname.endsWith(".laaroza.pics");

      return (
        allowedHost &&
        /\/video\.php$/i.test(
          parsed.pathname
        ) &&
        Boolean(
          parsed.searchParams.get(
            "vid"
          )
        )
      );
    } catch {
      return false;
    }
  }

  async fetchPage(url) {
    const response = await this.http.get(url);

    if (response.status !== 200) {
      throw new Error(
        `Laaroza returned HTTP ${response.status}`
      );
    }

    const finalUrl =
      response.request?.res?.responseUrl ||
      url;

    return {
      html: response.data,
      finalUrl
    };
  }

  extractPageMetadata($) {
    const ogTitle =
      this.getMeta(
        $,
        'meta[property="og:title"]'
      );

    const title =
      ogTitle ||
      this.cleanText($("title").first().text());

    const description =
      this.getMeta(
        $,
        'meta[name="description"]'
      ) ||
      this.getMeta(
        $,
        'meta[property="og:description"]'
      );

    const image =
      this.getMeta(
        $,
        'meta[property="og:image"]'
      );

    return {
      title,
      description,
      image
    };
  }

  extractEpisodeLinks($, pageUrl) {
    const episodes = new Map();

    $("a[href]").each((_, element) => {
      const href =
        $(element).attr("href");

      const absolute =
        this.absoluteUrl(
          href,
          pageUrl
        );

      if (
        !absolute ||
        !this.isEpisodeUrl(absolute)
      ) {
        return;
      }

      const text =
        this.cleanText(
          $(element).text()
        );

      const number =
        this.extractEpisodeNumber(
          text,
          absolute
        );

      if (!number) {
        return;
      }

      const vid =
        this.extractVid(absolute);

      if (!episodes.has(vid)) {
        episodes.set(vid, {
          id: absolute,
          number,
          title:
            text ||
            `الحلقة ${number}`,
          source_url:
            absolute
        });
      }
    });

    return [...episodes.values()]
      .sort(
        (a, b) =>
          a.number - b.number
      );
  }

  async search(query) {
    const q =
      this.cleanText(query);

    if (!q) {
      return [];
    }

    const searchUrl =
      `https://laaroza.pics/search.php?keywords=${encodeURIComponent(q)}`;

    const response =
      await this.http.get(
        searchUrl
      );

    const finalUrl =
      response.request?.res
        ?.responseUrl ||
      searchUrl;

    const $ =
      cheerio.load(
        response.data
      );

    /*
     * Laaroza يعيد الحلقات كنتائج بحث،
     * وليس صفحة Series مستقلة.
     *
     * نجمع حلقات العمل الواحد ثم نعيد
     * ممثلاً واحداً فقط للمحرك.
     */
    const groups =
      new Map();

    $("a[href]").each(
      (_, element) => {
        const a =
          $(element);

        const href =
          this.absoluteUrl(
            a.attr("href"),
            finalUrl
          );

        if (
          !href ||
          !this.isEpisodeUrl(href)
        ) {
          return;
        }

        const img =
          a.find("img").first();

        const rawTitle =
          this.cleanText(
            a.attr("title") ||
            img.attr("title") ||
            img.attr("alt") ||
            a.text()
          );

        if (!rawTitle) {
          return;
        }

        const episodeNumber =
          this.extractEpisodeNumber(
            rawTitle,
            href
          );

        /*
         * نحذف وصف الحلقة من هوية المسلسل.
         */
        let seriesTitle =
          rawTitle

            .replace(
              /الحلقة\s*0*\d+.*$/i,
              ""
            )

            .replace(
              /0*\d+\s*الحلقة.*$/i,
              ""
            )

            .replace(
              /حلقة\s*0*\d+.*$/i,
              ""
            )

            .replace(
              /0*\d+\s*حلقة.*$/i,
              ""
            )

            .replace(
              /\bepisode\s*0*\d+.*$/i,
              ""
            )

            .replace(
              /\bep(?:isode)?[-\s]*0*\d+.*$/i,
              ""
            );

        seriesTitle =
          this.cleanText(
            seriesTitle
          );

        if (!seriesTitle) {
          return;
        }

        /*
         * مفتاح بسيط وآمن داخل Provider.
         * الـCanonical matcher المركزي
         * سيتولى المطابقة الأعمق لاحقاً.
         */
        const key =
          seriesTitle
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

        /*
         * Laaroza أحياناً يضع صورة Base64.
         * لا نسمح بإرجاعها للـAPI أو DB.
         */
        const rawImage =
          img.attr("data-src") ||
          img.attr("src") ||
          null;

        const image =
          rawImage &&
          !String(rawImage)
            .startsWith("data:")
            ? this.absoluteUrl(
                rawImage,
                finalUrl
              )
            : null;

        const current =
          groups.get(key);

        /*
         * نفضل أقل رقم حلقة كممثل للعمل،
         * لأن getSeries() يستطيع الانطلاق
         * من أي حلقة واستخراج باقي الحلقات.
         */
        if (
          !current ||
          (
            Number.isInteger(
              episodeNumber
            ) &&
            (
              !Number.isInteger(
                current.episode_number
              ) ||
              episodeNumber <
                current.episode_number
            )
          )
        ) {
          groups.set(
            key,
            {
              title:
                seriesTitle,

              episode_number:
                episodeNumber,

              episode_url:
                href,

              image
            }
          );
        }
      }
    );

    /*
     * حماية من نتيجة بحث شديدة الاتساع.
     */
    const candidates =
      Array.from(
        groups.values()
      ).slice(0, 12);

    const results = [];

    for (
      const candidate
      of candidates
    ) {
      const vid =
        this.extractVid(
          candidate.episode_url
        );

      results.push({
        provider:
          "laaroza",

        /*
         * ليس لدى Laaroza Series ID حقيقي،
         * فنستخدم هوية مستقرة مشتقة من
         * الحلقة الممثلة.
         */
        provider_series_id:
          `search:${vid}`,

        title:
          candidate.title,

        image:
          candidate.image ||
          null,

        source_url:
          candidate.episode_url,

        type:
          "series"
      });
    }

    return results;
  }

  async getSeries(seriesId) {
    const inputUrl =
      this.absoluteUrl(seriesId);

    if (!inputUrl) {
      throw new Error(
        "Invalid Laaroza URL"
      );
    }

    const {
      html,
      finalUrl
    } = await this.fetchPage(inputUrl);

    const $ =
      cheerio.load(html);

    const metadata =
      this.extractPageMetadata($);

    let episodes =
      this.extractEpisodeLinks(
        $,
        finalUrl
      );

    /*
     * بعض صفحات Laaroza تعرض الحلقة الحالية
     * بالإضافة إلى روابط الحلقات المرتبطة.
     */
    if (
      this.isEpisodeUrl(finalUrl)
    ) {
      const currentNumber =
        this.extractEpisodeNumber(
          metadata.title,
          finalUrl
        );

      if (currentNumber) {
        const currentVid =
          this.extractVid(finalUrl);

        const exists =
          episodes.some(
            item =>
              this.extractVid(
                item.id
              ) === currentVid
          );

        if (!exists) {
          episodes.push({
            id: finalUrl,
            number:
              currentNumber,
            title:
              metadata.title ||
              `الحلقة ${currentNumber}`,
            source_url:
              finalUrl
          });

          episodes.sort(
            (a, b) =>
              a.number - b.number
          );
        }
      }
    }

    if (episodes.length === 0) {
      throw new Error(
        "No Laaroza episodes found"
      );
    }

    /*
     * نحذف رقم الحلقة من عنوان صفحة الحلقة
     * للحصول على اسم أنظف للمسلسل.
     */
    const seriesTitle =
      this.cleanText(
        metadata.title
          .replace(
            /الحلقة\s*\d+/gi,
            ""
          )
          .replace(
            /حلقة\s*\d+/gi,
            ""
          )
          .replace(
            /\s*[-–|]\s*لاروزا.*$/i,
            ""
          )
      ) ||
      metadata.title ||
      "Laaroza Series";

    return {
      provider:
        "laaroza",

      source_url:
        finalUrl,

      series: {
        id:
          String(seriesId),

        title:
          seriesTitle,

        description:
          metadata.description || "",

        image:
          metadata.image || null,

        language:
          null,

        quality:
          null,

        country:
          null,

        year:
          null
      },

      episodes,

      episode_count:
        episodes.length
    };
  }

  async getEpisode(episodeId) {
    const url =
      this.absoluteUrl(episodeId);

    if (
      !url ||
      !this.isEpisodeUrl(url)
    ) {
      throw new Error(
        "Invalid Laaroza episode URL"
      );
    }

    const {
      html,
      finalUrl
    } = await this.fetchPage(url);

    const $ =
      cheerio.load(html);

    const metadata =
      this.extractPageMetadata($);

    const episodeNumber =
      this.extractEpisodeNumber(
        metadata.title,
        finalUrl
      );

    return {
      provider:
        "laaroza",

      source_url:
        finalUrl,

      episode: {
        id:
          finalUrl,

        number:
          episodeNumber,

        title:
          metadata.title ||
          (
            episodeNumber
              ? `الحلقة ${episodeNumber}`
              : "Laaroza Episode"
          ),

        description:
          metadata.description || "",

        image:
          metadata.image || null
      },

      qualities: [],

      watch_options: []
    };
  }

  async getWatchInfo(episodeId) {
    const url =
      this.absoluteUrl(episodeId);

    if (
      !url ||
      !this.isEpisodeUrl(url)
    ) {
      throw new Error(
        "Invalid Laaroza episode URL"
      );
    }

    const {
      html,
      finalUrl
    } = await this.fetchPage(url);

    const $ =
      cheerio.load(html);

    return {
      provider:
        "laaroza",

      source_url:
        finalUrl,

      player: {
        iframe_count:
          $("iframe").length,

        video_count:
          $("video").length,

        source_count:
          $("video source").length
      }
    };
  }
}

module.exports =
  new LaarozaProvider();
