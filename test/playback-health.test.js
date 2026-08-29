const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FAILURE,
  classifyFailure,
  retryPolicy
} = require("../src/services/failure-classifier");

const {
  validateCandidate
} = require("../src/services/candidate-validator");

test("classifies geo blocks and retry policy", () => {
  const error = new Error("blocked");
  error.response = {
    status: 403,
    data: "Your country is not allowed"
  };

  assert.equal(
    classifyFailure(error),
    FAILURE.GEO_BLOCKED
  );

  assert.equal(
    retryPolicy(
      FAILURE.GEO_BLOCKED
    ).retries,
    0
  );
});

test("timeout retries once", () => {
  assert.equal(
    retryPolicy(
      FAILURE.TIMEOUT
    ).retries,
    1
  );
});

test("validates direct media with range request", async () => {
  const calls = [];

  const request = {
    async get(url, options) {
      calls.push({ url, options });

      return {
        status: 206,
        headers: {
          "content-type":
            "video/mp4"
        },
        data:
          Buffer.from("media")
      };
    }
  };

  const result =
    await validateCandidate(
      {
        type: "direct_mp4",
        direct_url:
          "https://media.test/a.mp4"
      },
      { request }
    );

  assert.equal(
    result.status,
    "healthy"
  );

  assert.equal(
    result.validation_scope,
    "media_bytes_verified"
  );

  assert.equal(
    calls[0].options.headers.Range,
    "bytes=0-2047"
  );
});

test("embed validation is explicitly reachability only", async () => {
  const request = {
    async get() {
      return {
        status: 200,
        headers: {
          "content-type":
            "text/html"
        },
        data:
          "<html></html>"
      };
    }
  };

  const result =
    await validateCandidate(
      {
        type: "embed",
        embed_url:
          "https://embed.test/e1"
      },
      { request }
    );

  assert.equal(
    result.status,
    "healthy"
  );

  assert.equal(
    result.validation_scope,
    "embed_page_reachable"
  );
});
