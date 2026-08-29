const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const BASE = "https://akwam.ss";
const MAX_REDIRECTS = 5;

function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function absoluteUrl(url) {
  if (!url) return null;

  try {
    return new URL(url, BASE).href;
  } catch {
    return null;
  }
}

function repairUtf8(text = "") {
  if (!text) return text;

  if (/[ØÙÃ]/.test(text)) {
    try {
      return Buffer.from(text, "latin1").toString("utf8");
    } catch {
      return text;
    }
  }

  return text;
}

function normalizeRedirect(location, currentUrl) {
  if (!location) return null;

  const fixed = repairUtf8(location);

  try {
    return new URL(fixed, currentUrl).href;
  } catch {
    return null;
  }
}

function extractNumber(text) {
  const value = clean(text);

  const patterns = [
    /(?:الحلقة|حلقة)\s*[-:]?\s*(\d+)/i,
    /episode\s*[-:]?\s*(\d+)/i,
    /\bE(?:P)?\s*0*(\d+)\b/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function findValue(bodyText, label) {
  const text = clean(bodyText);

  const escaped = label.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const regex = new RegExp(
    `${escaped}\\s*[:：]?\\s*([^|•]+?)` +
      `(?=\\s+(?:اللغة|الجودة|السنة|انتاج|الإنتاج|مدة|التصنيف|$))`,
    "i"
  );

  const match = text.match(regex);

  return match ? clean(match[1]) : null;
}

async function requestPage(url, redirectCount = 0) {
  console.log(`🌐 GET [${redirectCount}]`);
  console.log(url);

  const response = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 0,

    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
        "Version/18.0 Mobile/15E148 Safari/604.1",

      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9," +
        "image/avif,image/webp,*/*;q=0.8",

      "Accept-Language":
        "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",

      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    },

    validateStatus(status) {
      return status >= 200 && status < 400;
    }
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error(
        `تجاوزنا الحد الأقصى للتحويلات (${MAX_REDIRECTS})`
      );
    }

    const rawLocation = response.headers.location;

    if (!rawLocation) {
      throw new Error(
        `HTTP ${response.status} بدون Location`
      );
    }

    const nextUrl = normalizeRedirect(
      rawLocation,
      url
    );

    console.log("");
    console.log(`↪ REDIRECT ${response.status}`);
    console.log("RAW:", rawLocation);
    console.log("FIXED:", nextUrl);
    console.log("");

    if (!nextUrl) {
      throw new Error(
        "تعذر إصلاح رابط التحويل"
      );
    }

    if (nextUrl === url) {
      throw new Error(
        "تم اكتشاف Redirect Loop إلى نفس الرابط"
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

function parseSeries(html, finalUrl) {
  const $ = cheerio.load(html);

  const title =
    clean($("h1").first().text()) ||
    clean(
      $('meta[property="og:title"]')
        .attr("content")
    ) ||
    clean($("title").text()) ||
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
        $("img").first().attr("src")
    );

  const bodyText = $("body").text();

  const language =
    findValue(bodyText, "اللغة");

  const quality =
    findValue(bodyText, "الجودة");

  const country =
    findValue(bodyText, "انتاج") ||
    findValue(bodyText, "الإنتاج");

  const year =
    findValue(bodyText, "السنة");

  const duration =
    findValue(bodyText, "مدة المسلسل") ||
    findValue(bodyText, "مدة الحلقة") ||
    findValue(bodyText, "المدة");

  const episodesMap = new Map();

  $("a[href]").each((index, element) => {
    const elementNode = $(element);

    const href =
      elementNode.attr("href");

    if (!href) return;

    const fullUrl =
      absoluteUrl(href);

    if (!fullUrl) return;

    const isEpisode =
      fullUrl.includes("/episode/") ||
      fullUrl.includes("/watch/");

    if (!isEpisode) return;

    const text =
      clean(elementNode.text());

    const ariaLabel =
      clean(
        elementNode.attr("aria-label") || ""
      );

    const titleAttr =
      clean(
        elementNode.attr("title") || ""
      );

    const combined =
      `${text} ${ariaLabel} ${titleAttr}`;

    const number =
      extractNumber(combined) ||
      extractNumber(fullUrl);

    if (!number) return;

    const old =
      episodesMap.get(number);

    const item = {
      number,
      title:
        text ||
        titleAttr ||
        `الحلقة ${number}`,

      page_url: fullUrl
    };

    if (
      !old ||
      (
        fullUrl.includes("/episode/") &&
        old.page_url.includes("/watch/")
      )
    ) {
      episodesMap.set(number, item);
    }
  });

  const episodes =
    [...episodesMap.values()].sort(
      (a, b) => a.number - b.number
    );

  return {
    source: "akwam",

    source_url: finalUrl,

    scraped_at:
      new Date().toISOString(),

    series: {
      title,
      description,
      image,
      language,
      quality,
      country,
      year,
      duration
    },

    episode_count:
      episodes.length,

    episodes
  };
}

function safeFilename(text = "series") {
  return text
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function saveJson(data) {
  const outputDir = path.join(
    process.cwd(),
    "data"
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {
      recursive: true
    });
  }

  const filename =
    safeFilename(
      data.series?.title || "series"
    ) + ".json";

  const fullPath =
    path.join(
      outputDir,
      filename
    );

  fs.writeFileSync(
    fullPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  return fullPath;
}

async function scrapeSeries(url) {
  console.log("");
  console.log("🔍 AKWAM INDEXER");
  console.log("");

  const {
    response,
    finalUrl
  } = await requestPage(url);

  console.log("");
  console.log("✅ PAGE RECEIVED");
  console.log("HTTP:", response.status);
  console.log("FINAL URL:", finalUrl);
  console.log("");

  return parseSeries(
    response.data,
    finalUrl
  );
}

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.log("");
    console.log(
      "❌ ضع رابط المسلسل بعد الأمر."
    );
    console.log("");

    console.log(
      "مثال:"
    );

    console.log(
      "node src/scraper/series.js https://akwam.ss/series/2758"
    );

    console.log("");

    process.exit(1);
  }

  try {
    const data =
      await scrapeSeries(url);

    const savedPath =
      saveJson(data);

    console.log("");
    console.log(
      "✅ SCRAPE COMPLETE"
    );

    console.log(
      "📺 Episodes:",
      data.episode_count
    );

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
      "❌ SCRAPE FAILED"
    );

    if (error.response) {
      console.log(
        "HTTP:",
        error.response.status
      );

      console.log(
        "LOCATION:",
        error.response.headers
          ?.location || null
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