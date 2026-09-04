import '../lib/theeb_api_contract.dart';

class FakeTransport implements TheebApiTransport {
  String? lastPath;
  Map<String, Object?>? lastBody;

  @override
  Future<Map<String, Object?>> get(String path) async {
    lastPath = path;
    if (path.startsWith('/v1/search')) {
      return {
        'data': {
          'query': 'Lucky',
          'count': 1,
          'items': [
            {
              'id': 7,
              'title': 'Lucky',
              'original_title': null,
              'description': null,
              'image': null,
              'content_type': 'series',
              'language': null,
              'country': null,
              'year': '2026',
              'status': 'ready',
              'episode_count': 7,
            }
          ],
        }
      };
    }
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<Map<String, Object?>> post(
    String path,
    Map<String, Object?> body,
  ) async {
    lastPath = path;
    lastBody = body;
    return {
      'data': {
        'accepted': true,
        'duplicate': false,
      }
    };
  }
}

void expectContract(bool condition, String message) {
  if (!condition) throw StateError(message);
}

Future<void> main() async {
  final transport = FakeTransport();
  final api = TheebApiClient(transport);

  final results = await api.search('Lucky & ذيب');
  expectContract(results.length == 1, 'search result count');
  expectContract(results.single.title == 'Lucky', 'typed series parsing');
  expectContract(
    transport.lastPath == '/v1/search?q=Lucky%20%26%20%D8%B0%D9%8A%D8%A8',
    'query must be encoded',
  );

  final receipt = await api.sendPlaybackFeedback(
    '00000000-0000-4000-8000-000000000001',
    PlaybackFeedbackRequest(
      eventId: 'event-1',
      type: PlaybackEventType.firstFrame,
      occurredAt: DateTime.utc(2026, 9, 1),
      positionSeconds: 2,
    ),
  );
  expectContract(receipt.accepted && !receipt.duplicate, 'typed receipt');
  expectContract(
    transport.lastBody?['type'] == 'first_frame',
    'event enum wire value',
  );
}
