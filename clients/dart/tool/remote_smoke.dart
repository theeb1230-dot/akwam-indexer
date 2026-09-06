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
    const query = 'الذئب الوحيد';
    final libraryResults = await client.search(query);
    var discoveryCount = 0;
    if (libraryResults.isEmpty) {
      final discovery = await client.discover(query);
      discoveryCount = discovery.length;
      if (discovery.isEmpty) {
        stderr.writeln('LIVE_SEARCH_AND_DISCOVERY_EMPTY');
        exitCode = 1;
        return;
      }
    }
    stdout.writeln(
      '{"status":"passed","base_url":"${uri.origin}","query":"$query",'
      '"library_count":${libraryResults.length},"discovery_count":$discoveryCount}',
    );
  } finally {
    transport.close(force: true);
  }
}
