const dns = require("node:dns").promises;
const tls = require("node:tls");

const TLS_VERIFICATION_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "CERT_SIGNATURE_FAILURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);

function tlsVerificationError(error) {
  return TLS_VERIFICATION_ERROR_CODES.has(
    String(error?.code || "")
  );
}

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
          // Diagnostics observe the same verified handshake as production.
          // Invalid chains fail and are classified by the caller; we never
          // establish an insecure connection merely to inspect a certificate.
          rejectUnauthorized: true,
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
        error => {
          if (!tlsVerificationError(error)) {
            reject(error);
            return;
          }

          // A verified handshake rejecting a bad chain is the diagnostic
          // result, not a failure of the diagnostic itself. Keep the socket
          // unauthorized and report the stable Node classification.
          resolve({
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
            authorized: false,
            authorization_error:
              error.code,
            tls_protocol: null,
            cipher: null,
            certificate: null,
            diagnostic_status:
              "tls_verification_rejected"
          });
        }
      );
    }
  );
}

module.exports = {
  certificateSummary,
  diagnoseTls,
  tlsVerificationError
};
