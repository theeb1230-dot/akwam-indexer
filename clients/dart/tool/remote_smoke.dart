import 'dart:io';

import '../lib/http_theeb_transport.dart';
import '../lib/theeb_api_contract.dart';
import '../lib/theeb_client_config.dart';

Future<void> main() async {
  final raw = Platform.environment['THEEB_API_BASE_URL'] ?? '';
  final baseUri = TheebClientConfig.validateBaseUri(raw);
  final transport = HttpTheebTransport(baseUri: baseUri);

  try {
    final client = TheebApiClient(transport);
    final results = await client.search('theeb');
    stdout.writeln(
      '{"status":"passed","base_url":"${baseUri.origin}","search_count":${results.length}}',
    );
  } finally {
    transport.close(force: true);
  }
}
