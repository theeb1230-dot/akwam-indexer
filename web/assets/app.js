const $ = selector => document.querySelector(selector);
const results = $("#results");
const emptyState = $("#emptyState");
const resultCount = $("#resultCount");
const apiStatus = $("#apiStatus");
const form = $("#searchForm");
const input = $("#searchInput");
const template = $("#cardTemplate");
const installButton = $("#installButton");
let deferredPrompt = null;

function text(value) {
  return value == null ? "" : String(value);
}

async function request(path) {
  const response = await fetch(path, {
    headers: { Accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.error || "REQUEST_FAILED");
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
    results.appendChild(card);
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
