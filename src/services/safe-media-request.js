const dns = require("node:dns").promises;
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const axios = require("axios");

function privateIpv4(address) {
  const parts =
    address.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      value =>
        !Number.isInteger(value) ||
        value < 0 ||
        value > 255
    )
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (
      a === 100 &&
      b >= 64 &&
      b <= 127
    ) ||
    (
      a === 169 &&
      b === 254
    ) ||
    (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) ||
    (
      a === 192 &&
      b === 168
    ) ||
    (
      a === 198 &&
      (
        b === 18 ||
        b === 19
      )
    )
  );
}

function privateAddress(address) {
  const normalized =
    String(address || "")
      .toLowerCase()
      .split("%")[0];

  if (net.isIP(normalized) === 4) {
    return privateIpv4(normalized);
  }

  if (net.isIP(normalized) !== 6) {
    return true;
  }

  if (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  ) {
    return true;
  }

  const mapped =
    normalized.match(
      /^::ffff:(\d+\.\d+\.\d+\.\d+)$/
    );

  return mapped
    ? privateIpv4(mapped[1])
    : false;
}

async function pinPublicHost(url) {
  const parsed = new URL(url);

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error(
      "UNSAFE_URL_PROTOCOL"
    );
  }

  if (
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "UNSAFE_URL_CREDENTIALS"
    );
  }

  const records =
    net.isIP(parsed.hostname)
      ? [{
          address:
            parsed.hostname,
          family:
            net.isIP(
              parsed.hostname
            )
        }]
      : await dns.lookup(
          parsed.hostname,
          {
            all: true,
            verbatim: true
          }
        );

  if (
    records.length === 0 ||
    records.some(
      record =>
        privateAddress(
          record.address
        )
    )
  ) {
    throw new Error(
      "SSRF_PRIVATE_ADDRESS_BLOCKED"
    );
  }

  return {
    parsed,
    address:
      records[0].address,
    family:
      records[0].family
  };
}

function pinnedLookup(pin) {
  return (
    _hostname,
    options,
    callback
  ) => {
    if (
      options &&
      typeof options === "object" &&
      options.all
    ) {
      callback(null, [{
        address:
          pin.address,
        family:
          pin.family
      }]);

      return;
    }

    callback(
      null,
      pin.address,
      pin.family
    );
  };
}

async function safeGet(
  initialUrl,
  config = {},
  options = {}
) {
  const maxRedirects =
    Number(
      options.maxRedirects ?? 5
    );

  let current =
    new URL(initialUrl).toString();

  for (
    let redirect = 0;
    redirect <= maxRedirects;
    redirect++
  ) {
    const pin =
      await pinPublicHost(current);

    const agentOptions = {
      keepAlive: false,
      lookup:
        pinnedLookup(pin)
    };

    const response =
      await axios.get(current, {
        ...config,
        maxRedirects: 0,
        httpAgent:
          new http.Agent(
            agentOptions
          ),
        httpsAgent:
          new https.Agent(
            agentOptions
          ),
        validateStatus(status) {
          return (
            status >= 200 &&
            status < 400
          );
        }
      });

    if (
      response.status < 300 ||
      response.status >= 400
    ) {
      return response;
    }

    const location =
      response.headers?.location;

    response.data?.destroy?.();

    if (!location) {
      throw new Error(
        "REDIRECT_WITHOUT_LOCATION"
      );
    }

    if (redirect === maxRedirects) {
      throw new Error(
        "TOO_MANY_REDIRECTS"
      );
    }

    current =
      new URL(
        location,
        current
      ).toString();
  }

  throw new Error(
    "TOO_MANY_REDIRECTS"
  );
}

module.exports = {
  privateAddress,
  pinPublicHost,
  safeGet
};
