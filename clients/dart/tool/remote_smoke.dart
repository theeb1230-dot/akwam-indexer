import 'dart:io';

import '../lib/http_theeb_transport.dart';
import '../lib/theeb_api_contract.dart';
import '../lib/theeb_client_config.dart';

Future<void> main() async {
  final raw = Platform.environment['THEEB_API_BASE_URL'] ?? '';
  final uri = Uri.parse(raw);
  TheebClientConfig.validateInstallableBaseUri(uri);

  final transport = HttpTheebTransport(baseUri: uri);
  try {
    final client = TheebApiClient(transport);
    final results = await client.search('theeb-release-smoke');
    stdout.writeln(
      '{"status":"passed","base_url":"${uri.origin}","search_count":${results.length}}',
    );
  } finally {
    transport.close(force: true);
  }
}
