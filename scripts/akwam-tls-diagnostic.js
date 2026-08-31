const {
  spawn
} = require("node:child_process");

const {
  resolveEpisode
} = require(
  "../src/services/episode-resolver"
);

const {
  diagnoseTls
} = require(
  "../src/services/tls-diagnostics"
);

function run(command, args, input) {
  return new Promise(resolve => {
    const child =
      spawn(command, args, {
        stdio: [
          input ? "pipe" : "ignore",
          "pipe",
          "pipe"
        ]
      });

    let stdout = "";
    let stderr = "";

    child.stdout.on(
      "data",
      chunk => {
        stdout += chunk;
      }
    );

    child.stderr.on(
      "data",
      chunk => {
        stderr += chunk;
      }
    );

    if (input) {
      child.stdin.end(input);
    }

    child.on("close", code => {
      resolve({
        command,
        exit_code: code,
        stdout:
          stdout.slice(0, 4000),
        stderr:
          stderr
            .replace(
              /https?:\/\/\S+/gi,
              "[url]"
            )
            .slice(0, 1000)
      });
    });
  });
}

async function main() {
  const resolved =
    await resolveEpisode({
      query: "Lucky",
      groupKey:
        "series:lucky",
      season: 1,
      episode: 1
    });

  const candidate =
    resolved.playback_plan.find(
      item =>
        item.provider ===
          "akwam" &&
        item.direct_url
    );

  if (!candidate) {
    throw new Error(
      "AKWAM_DIRECT_CANDIDATE_NOT_FOUND"
    );
  }

  const parsed =
    new URL(
      candidate.direct_url
    );

  const node =
    await diagnoseTls(
      candidate.direct_url
    );

  const curl =
    await run(
      "curl",
      [
        "--head",
        "--silent",
        "--show-error",
        "--max-time",
        "10",
        "--output",
        "/dev/null",
        "--write-out",
        "http=%{http_code} remote_ip=%{remote_ip} ssl_verify=%{ssl_verify_result}",
        candidate.direct_url
      ]
    );

  const openssl =
    await run(
      "openssl",
      [
        "s_client",
        "-connect",
        `${parsed.hostname}:${
          parsed.port || 443
        }`,
        "-servername",
        parsed.hostname,
        "-verify_return_error",
        "-brief"
      ],
      ""
    );

  console.log(
    JSON.stringify(
      {
        runtime:
          process.version,
        candidate: {
          provider:
            candidate.provider,
          type:
            candidate.type,
          hostname:
            parsed.hostname
        },
        node_tls:
          node,
        curl: {
          exit_code:
            curl.exit_code,
          result:
            curl.stdout,
          error:
            curl.stderr
        },
        openssl: {
          exit_code:
            openssl.exit_code,
          output:
            (
              openssl.stdout +
              openssl.stderr
            ).slice(0, 4000)
        }
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(
    JSON.stringify({
      runtime:
        process.version,
      error:
        error.message,
      code:
        error.code || null
    })
  );

  process.exitCode = 1;
});
