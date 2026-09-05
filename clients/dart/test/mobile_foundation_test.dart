import 'dart:async';
import 'dart:io';

import '../lib/http_theeb_transport.dart';
import '../lib/theeb_api_contract.dart';
import '../lib/theeb_brand.dart';
import '../lib/theeb_client_config.dart';

void expect(bool condition, String message) {
  if (!condition) throw StateError(message);
}

Future<void> main() async {
  expect(TheebBrand.productNameAr == 'ذيب العرب', 'brand name');
  expect(TheebBrand.accentHex == '#d8c39a', 'brand accent');

  final config = TheebClientConfig(baseUri: Uri.parse('http://127.0.0.1:8080/'));
  expect(config.clientVersion == '0.1.0', 'client version');

  TheebClientConfig.validateInstallableBaseUri(
    Uri.parse('https://api.theeb.sa/'),
  );
  var installableRejected = false;
  try {
    TheebClientConfig.validateInstallableBaseUri(
      Uri.parse('https://example.invalid/'),
    );
  } catch (_) {
    installableRejected = true;
  }
  expect(installableRejected, 'installable placeholder API must be rejected');

  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final base = Uri.parse('http://127.0.0.1:' + server.port.toString() + '/');
  unawaited(() async {
    await for (final request in server) {
      if (request.uri.path == '/v1/search') {
        request.response.headers.contentType = ContentType.json;
        request.response.write('{"data":{"items":[{"id":1,"title":"Fixture","content_type":"series","status":"active","episode_count":1}]}}');
      } else {
        request.response.statusCode = 404;
        request.response.headers.contentType = ContentType.json;
        request.response.write('{"error":"NOT_FOUND"}');
      }
      await request.response.close();
    }
  }());

  final transport = HttpTheebTransport(baseUri: base);
  final client = TheebApiClient(transport);
  final results = await client.search('Fixture');
  expect(results.length == 1, 'search count');
  expect(results.first.title == 'Fixture', 'search title');

  var rejected = false;
  try {
    HttpTheebTransport(baseUri: Uri.parse('http://example.com/'));
  } catch (_) {
    rejected = true;
  }
  expect(rejected, 'non-HTTPS remote URL must be rejected');

  transport.close(force: true);
  await server.close(force: true);
}
