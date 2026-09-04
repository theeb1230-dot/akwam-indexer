const dns = require("node:dns").promises;
const tls = require("node:tls");

function certificateSummary(
  certificate = {}
) {
  return {
    subject:
      certificate.subject || null,
    issuer:
      certificate.issuer || null,
    valid_from:
      certificate.valid_from || null,
    valid_to:
      certificate.valid_to || null,
    fingerprint256:
      certificate.fingerprint256 ||
      null,
    serial_number:
      certificate.serialNumber ||
      null
  };
}

async function diagnoseTls(
  targetUrl,
  options = {}
) {
  const parsed =
    new URL(targetUrl);

  if (
    parsed.protocol !== "https:"
  ) {
    return {
      hostname:
        parsed.hostname,
      protocol:
        parsed.protocol,
      tls_applicable: false
    };
  }

  const addresses =
    await dns.lookup(
      parsed.hostname,
      {
        all: true,
        verbatim: true
      }
    );

  const port =
    Number(
      parsed.port || 443
    );

  return new Promise(
    (resolve, reject) => {
      const socket =
        tls.connect({
          host:
            parsed.hostname,
          port,
          servername:
            parsed.hostname,
          rejectUnauthorized: false,
          timeout:
            Number(
              options.timeoutMs ||
              8000
            )
        });

      socket.once(
        "secureConnect",
        () => {
          const peer =
            socket.getPeerCertificate(
              true
            );

          const result = {
            hostname:
              parsed.hostname,
            port,
            resolved_ips:
              addresses.map(
                item =>
                  item.address
              ),
            remote_address:
              socket.remoteAddress ||
              null,
            authorized:
              socket.authorized,
            authorization_error:
              socket.authorizationError ||
              null,
            tls_protocol:
              socket.getProtocol() ||
              null,
            cipher:
              socket.getCipher() ||
              null,
            certificate:
              certificateSummary(
                peer
              )
          };

          socket.end();
          resolve(result);
        }
      );

      socket.once(
        "timeout",
        () => {
          socket.destroy();
          reject(
            new Error(
              "TLS_DIAGNOSTIC_TIMEOUT"
            )
          );
        }
      );

      socket.once(
        "error",
        reject
      );
    }
  );
}

module.exports = {
  certificateSummary,
  diagnoseTls
};
