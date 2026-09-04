const $ = selector => document.querySelector(selector);
const results = $("#results");
const emptyState = $("#emptyState");
const resultCount = $("#resultCount");
const apiStatus = $("#apiStatus");
const form = $("#searchForm");
const input = $("#searchInput");
const template = $("#cardTemplate");
const episodeTemplate = $("#episodeTemplate");
const installButton = $("#installButton");
const homeView = $("#homeView");
const detailView = $("#detailView");
const seriesDetail = $("#seriesDetail");
const episodeDetail = $("#episodeDetail");
const backButton = $("#backButton");
let deferredPrompt = null;
let activeSeriesId = null;

function text(value) {
  return value == null ? "" : String(value);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.message || body?.error || "REQUEST_FAILED");
    error.status = response.status;
    throw error;
  }
  return body;
}

async function checkApi() {
  try {
    await request("/livez");
    apiStatus.textContent = "الخدمة متصلة";
    apiStatus.classList.add("ok");
  } catch {
    apiStatus.textContent = "الخدمة غير متاحة";
    apiStatus.classList.add("bad");
  }
}

function showHome() {
  detailView.hidden = true;
  homeView.hidden = false;
  seriesDetail.replaceChildren();
  episodeDetail.replaceChildren();
  episodeDetail.hidden = true;
  activeSeriesId = null;
  history.replaceState({}, "", "/");
}

function showDetail() {
  homeView.hidden = true;
  detailView.hidden = false;
}

function render(items) {
  results.replaceChildren();
  emptyState.hidden = items.length > 0;
  resultCount.textContent = items.length ? `${items.length} نتيجة` : "لا توجد نتائج";

  for (const item of items) {
    const card = template.content.firstElementChild.cloneNode(true);
    const image = card.querySelector("img");
    const title = card.querySelector("h3");
    const meta = card.querySelector(".meta");
    const description = card.querySelector(".description");
    const action = card.querySelector(".primary-action");

    title.textContent = text(item.title) || "بدون عنوان";
    description.textContent = text(item.description) || "لا يوجد وصف متاح.";
    meta.textContent = [
      item.year,
      item.content_type === "movie" ? "فيلم" : "مسلسل",
      item.episode_count != null ? `${item.episode_count} حلقة` : null
    ].filter(Boolean).join(" • ");

    if (item.image) {
      image.src = item.image;
      image.alt = text(item.title);
    } else {
      image.remove();
    }

    action.href = `/?series=${encodeURIComponent(item.id)}`;
    action.addEventListener("click", event => {
      event.preventDefault();
      openSeries(item.id);
    });
    results.appendChild(card);
  }
}

async function openSeries(id) {
  showDetail();
  activeSeriesId = Number(id);
  seriesDetail.innerHTML = '<div class="empty-state"><p>جاري تحميل التفاصيل…</p></div>';
  episodeDetail.hidden = true;
  history.pushState({ series: id }, "", `/?series=${encodeURIComponent(id)}`);

  try {
    const [seriesBody, episodesBody] = await Promise.all([
      request(`/v1/series/${encodeURIComponent(id)}`),
      request(`/v1/series/${encodeURIComponent(id)}/episodes`)
    ]);
    renderSeries(seriesBody?.data || {}, episodesBody?.data?.items || []);
  } catch (error) {
    seriesDetail.innerHTML = `<div class="empty-state"><h3>تعذر تحميل المحتوى</h3><p>${text(error.message)}</p></div>`;
  }
}

function renderSeries(series, episodes) {
  const poster = series.image
    ? `<div class="series-poster"><img src="${series.image}" alt="${text(series.title)}"></div>`
    : '<div class="series-poster"></div>';

  seriesDetail.innerHTML = `
    <section class="series-hero">
      ${poster}
      <div class="series-copy">
        <p class="eyebrow">${series.content_type === "movie" ? "فيلم" : "مسلسل"}</p>
        <h2>${text(series.title) || "بدون عنوان"}</h2>
        <div class="meta">${[series.year, series.country, series.language].filter(Boolean).join(" • ")}</div>
        <p>${text(series.description) || "لا يوجد وصف متاح."}</p>
        <p class="muted">${episodes.length} حلقة</p>
      </div>
    </section>
    <section class="episodes" id="episodesList" aria-label="الحلقات"></section>
  `;

  const list = $("#episodesList");
  for (const episode of episodes) {
    const row = episodeTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".episode-number").textContent = episode.episode_number ?? "•";
    row.querySelector(".episode-title").textContent = text(episode.title) || `الحلقة ${episode.episode_number}`;
    row.querySelector(".episode-flags").textContent = [
      episode.watch_available ? "مشاهدة" : null,
      episode.download_available ? "تحميل" : null
    ].filter(Boolean).join(" • ") || "لا توجد خيارات متاحة";
    row.addEventListener("click", () => openEpisode(episode.id));
    list.appendChild(row);
  }
}

async function openEpisode(id) {
  episodeDetail.hidden = false;
  episodeDetail.innerHTML = '<div class="empty-state"><p>جاري تحميل الحلقة…</p></div>';
  episodeDetail.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const body = await request(`/v1/episodes/${encodeURIComponent(id)}`);
    renderEpisode(body?.data || {});
  } catch (error) {
    episodeDetail.innerHTML = `<div class="empty-state"><h3>تعذر تحميل الحلقة</h3><p>${text(error.message)}</p></div>`;
  }
}

function renderEpisode(episode) {
  episodeDetail.innerHTML = `
    <section class="episode-panel">
      <p class="eyebrow">الحلقة ${episode.episode_number ?? ""}</p>
      <h2>${text(episode.title) || "تفاصيل الحلقة"}</h2>
      <p class="muted">${text(episode.description) || "اختر الإجراء الذي تريده."}</p>
      <div class="choice-actions">
        <button id="watchChoice" class="choice-action watch" type="button" ${episode.watch_available ? "" : "disabled"}>مشاهدة</button>
        <button id="downloadChoice" class="choice-action download" type="button" ${episode.download_available ? "" : "disabled"}>تحميل</button>
      </div>
      <div id="optionPanel" class="options-panel"></div>
      <p class="notice">لا يتم تشغيل الفيديو أو بدء التحميل تلقائيًا. أنت تختار الإجراء والخيار بنفسك.</p>
    </section>
  `;

  const watch = $("#watchChoice");
  const download = $("#downloadChoice");
  if (episode.watch_available) watch.addEventListener("click", () => loadWatchOptions(episode.id));
  if (episode.download_available) download.addEventListener("click", () => loadDownloadOptions(episode.id));
}

async function loadWatchOptions(episodeId) {
  const panel = $("#optionPanel");
  panel.innerHTML = '<div class="option-card">جاري تجهيز خيارات المشاهدة…</div>';

  try {
    const body = await request("/v1/playback/sessions", {
      method: "POST",
      body: JSON.stringify({
        canonical_episode_id: Number(episodeId),
        client: { platform: "web", version: "1.0.0" }
      })
    });
    const session = body?.data || {};
    const options = session.fallback_plan || session.options || session.candidates || [];
    panel.replaceChildren();

    if (!options.length) {
      panel.innerHTML = '<div class="option-card">لا توجد خيارات مشاهدة جاهزة حاليًا.</div>';
      return;
    }

    for (const option of options) {
      const card = document.createElement("div");
      card.className = "option-card";
      card.innerHTML = `<strong>${text(option.quality) || "جودة تلقائية"}</strong><span>${text(option.provider) || "مصدر متاح"}</span>`;
      panel.appendChild(card);
    }
  } catch (error) {
    panel.innerHTML = `<div class="option-card">${text(error.message)}</div>`;
  }
}

async function loadDownloadOptions(episodeId) {
  const panel = $("#optionPanel");
  panel.innerHTML = '<div class="option-card">جاري تجهيز خيارات التحميل…</div>';

  try {
    const body = await request(`/v1/episodes/${encodeURIComponent(episodeId)}/download-options`);
    const payload = body?.data || body;
    const options = payload?.download_options || payload?.options || [];
    panel.replaceChildren();

    if (!options.length) {
      panel.innerHTML = '<div class="option-card">لا توجد خيارات تحميل جاهزة حاليًا.</div>';
      return;
    }

    for (const option of options) {
      const card = document.createElement("div");
      card.className = "option-card";
      card.innerHTML = `<strong>${text(option.quality) || "جودة متاحة"}</strong><span>${[option.format, option.status].filter(Boolean).join(" • ") || "خيار تحميل"}</span>`;
      panel.appendChild(card);
    }
  } catch (error) {
    panel.innerHTML = `<div class="option-card">${text(error.message)}</div>`;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  resultCount.textContent = "جاري البحث…";
  emptyState.hidden = true;
  results.replaceChildren();

  try {
    const body = await request(`/v1/search?q=${encodeURIComponent(query)}`);
    render(body?.data?.items || []);
  } catch (error) {
    emptyState.hidden = false;
    emptyState.querySelector("h3").textContent = "تعذر إكمال البحث";
    emptyState.querySelector("p").textContent = error.message;
    resultCount.textContent = "";
  }
});

backButton.addEventListener("click", () => {
  if (episodeDetail && !episodeDetail.hidden) {
    episodeDetail.hidden = true;
    episodeDetail.replaceChildren();
    return;
  }
  showHome();
});

window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("series");
  if (id) openSeries(id);
  else showHome();
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  deferredPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

checkApi();
const initialSeries = new URLSearchParams(location.search).get("series");
if (initialSeries) openSeries(initialSeries);
