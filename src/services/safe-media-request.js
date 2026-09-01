const dns = require("node:dns").promises;
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const { Transform } = require("node:stream");
const axios = require("axios");

function privateIpv4(address) {
  const parts = String(address).split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)
  ) return true;

  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function privateAddress(address) {
  const normalized = String(address || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];

  if (net.isIP(normalized) === 4) return privateIpv4(normalized);
  if (net.isIP(normalized) !== 6) return true;

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateIpv4(mapped[1]);

  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return privateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }

  // IPv4-compatible IPv6 addresses (for example ::7f00:1) and their
  // fully-expanded equivalents must not bypass the IPv4 policy. The
  // compatible form is obsolete but is still accepted by operating systems.
  if (normalized.startsWith("::") || Number.parseInt(normalized.split(":")[0], 16) === 0) {
    return true;
  }

  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("64:ff9b:1:") ||
    /^100:(?:0*:){1,3}/.test(normalized) ||
    /^2001:0{1,4}:/.test(normalized) ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2002:")
  );
}

function validateResolvedRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("SSRF_DNS_EMPTY");
  }
  for (const record of records) {
    const address = String(record?.address || "").replace(/^\[|\]$/g, "");
    const family = net.isIP(address);
    if (!family || privateAddress(address)) {
      throw new Error("SSRF_PRIVATE_ADDRESS_BLOCKED");
    }
    if (record.family !== undefined && Number(record.family) !== family) {
      throw new Error("SSRF_INVALID_DNS_RECORD");
    }
  }
  return records;
}

async function pinPublicHost(url, options = {}) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("UNSAFE_URL_PROTOCOL");
  }
  if (parsed.username || parsed.password) throw new Error("UNSAFE_URL_CREDENTIALS");

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = net.isIP(hostname);
  const lookup = options.lookup || dns.lookup.bind(dns);
  const records = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  validateResolvedRecords(records);
  return {
    parsed,
    address: records[0].address,
    family: Number(records[0].family)
  };
}

function pinnedLookup(pin) {
  return (_hostname, options, callback) => {
    if (options && typeof options === "object" && options.all) {
      return callback(null, [{ address: pin.address, family: pin.family }]);
    }
    callback(null, pin.address, pin.family);
  };
}

function limitedStream(stream, maximum) {
  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += Buffer.byteLength(chunk);
      if (received > maximum) return callback(new Error("RESPONSE_BODY_TOO_LARGE"));
      callback(null, chunk, encoding);
    }
  });
  stream.once("error", error => limiter.destroy(error));
  return stream.pipe(limiter);
}

function enforceResponseSize(response, maximum) {
  if (!Number.isFinite(maximum)) return response;
  const declared = Number(response.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > maximum) {
    response.data?.destroy?.();
    throw new Error("RESPONSE_BODY_TOO_LARGE");
  }
  if (Buffer.isBuffer(response.data) && response.data.length > maximum) {
    throw new Error("RESPONSE_BODY_TOO_LARGE");
  }
  if (typeof response.data === "string" && Buffer.byteLength(response.data) > maximum) {
    throw new Error("RESPONSE_BODY_TOO_LARGE");
  }
  if (response.data && typeof response.data.pipe === "function") {
    response.data = limitedStream(response.data, maximum);
  }
  return response;
}

async function safeGet(initialUrl, config = {}, options = {}) {
  const maxRedirects = Number(options.maxRedirects ?? 5);
  const maxResponseBytes = options.maxResponseBytes === null
    ? Infinity
    : Number(options.maxResponseBytes ?? 2 * 1024 * 1024);

  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new Error("INVALID_MAX_REDIRECTS");
  }
  if (!(maxResponseBytes > 0)) throw new Error("INVALID_MAX_RESPONSE_BYTES");

  let current = new URL(initialUrl).toString();
  const request = options.request || ((url, requestConfig) => axios.get(url, requestConfig));

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const pin = await pinPublicHost(current, { lookup: options.lookup });
    const agentOptions = { keepAlive: false, lookup: pinnedLookup(pin) };
    const response = await request(current, {
      ...config,
      maxRedirects: 0,
      maxContentLength: maxResponseBytes,
      maxBodyLength: maxResponseBytes,
      httpAgent: new http.Agent(agentOptions),
      httpsAgent: new https.Agent(agentOptions),
      validateStatus: status => status >= 200 && status < 400
    });

    if (response.status < 300 || response.status >= 400) {
      const checked = enforceResponseSize(response, maxResponseBytes);
      checked.finalUrl = current;
      return checked;
    }

    const location = response.headers?.location;
    response.data?.destroy?.();
    if (!location) throw new Error("REDIRECT_WITHOUT_LOCATION");
    if (redirect === maxRedirects) throw new Error("TOO_MANY_REDIRECTS");

    const next = new URL(location, current);
    if (new URL(current).protocol === "https:" && next.protocol !== "https:") {
      throw new Error("INSECURE_REDIRECT_DOWNGRADE");
    }
    current = next.toString();
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

module.exports = {
  enforceResponseSize,
  limitedStream,
  privateAddress,
  pinPublicHost,
  safeGet,
  validateResolvedRecords
};
