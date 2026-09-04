const CONTROL_PATHS = [
  "/v1/",
  "/api/search",
  "/api/resolve",
  "/api/canonical",
  "/api/library",
  "/api/providers",
  "/api/import",
  "/api/playback",
  "/livez",
  "/readyz"
];

function allowedPath(pathname) {
  if (pathname === "/" || pathname === "/livez" || pathname === "/readyz") return true;
  return CONTROL_PATHS.some(prefix => pathname.startsWith(prefix));
}

async function proxy(request, base) {
  const source = new URL(request.url);
  const target = new URL(source.pathname + source.search, base);
  const headers = new Headers(request.headers);
  headers.delete("host");
  return fetch(new Request(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!allowedPath(url.pathname) || url.pathname.startsWith("/play/")) {
      return new Response("Not routed by zero-cost edge", { status: 404 });
    }

    const primary = env.PRIMARY_API_ORIGIN;
    const standby = env.STANDBY_API_ORIGIN;
    if (!primary || !standby) {
      return new Response("Router is not configured", { status: 503 });
    }

    try {
      const response = await proxy(request, primary);
      if (response.status < 500) return response;
    } catch {}

    try {
      return await proxy(request, standby);
    } catch {
      return new Response("Both free API origins are unavailable", {
        status: 503,
        headers: { "cache-control": "no-store" }
      });
    }
  }
};
