import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:theeb_arab/main.dart';
import 'package:theeb_client/theeb_api_contract.dart';

class FakeTransport implements TheebApiTransport {
  final List<String> gets = <String>[];
  final List<String> posts = <String>[];
  final List<Map<String, Object?>> postBodies = <Map<String, Object?>>[];

  @override
  Future<Map<String, Object?>> get(String path) async {
    gets.add(path);
    if (path.startsWith('/v1/search')) {
      return {
        'data': {
          'items': [
            {
              'id': 1,
              'title': 'Fixture Series',
              'content_type': 'series',
              'status': 'active',
              'episode_count': 1,
            }
          ],
        }
      };
    }
    if (path == '/v1/series/1') {
      return {
        'data': {
          'id': 1,
          'title': 'Fixture Series',
          'description': 'Fixture description',
          'content_type': 'series',
          'status': 'active',
          'episode_count': 1,
        }
      };
    }
    if (path == '/v1/series/1/episodes') {
      return {
        'data': {
          'items': [
            {
              'id': 10,
              'canonical_series_id': 1,
              'season_number': 1,
              'episode_number': 1,
              'title': 'Episode 1',
              'watch_available': true,
              'download_available': true,
            }
          ],
        }
      };
    }
    if (path == '/v1/episodes/10') {
      return {
        'data': {
          'id': 10,
          'canonical_series_id': 1,
          'season_number': 1,
          'episode_number': 1,
          'title': 'Episode 1',
          'watch_available': true,
          'download_available': true,
        }
      };
    }
    if (path == '/v1/episodes/10/download-options') {
      return {
        'data': {
          'canonical_episode_id': 10,
          'items': [
            {
              'id': '44',
              'quality': '720p',
              'status': 'resolvable',
            }
          ],
          'automatic_download': false,
          'action_required': 'user_selection',
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
    posts.add(path);
    postBodies.add(body);
    if (path == '/v1/playback/sessions') {
      return {
        'data': {
          'id': 'session-1',
          'canonical_episode_id': 10,
          'state': 'ready',
          'requested_quality': 'auto',
          'client': {'platform': 'android'},
          'plan_version': 1,
          'playback': {
            'uri': '/v1/playback/sessions/session-1/media',
            'quality': '720p',
          },
          'created_at': '2026-09-05T00:00:00.000Z',
          'updated_at': '2026-09-05T00:00:00.000Z',
          'expires_at': '2026-09-05T00:30:00.000Z',
        }
      };
    }
    throw StateError('Unexpected POST $path');
  }
}

void main() {
  testWidgets('Theeb Arab shell renders Arabic search UI', (tester) async {
    final fake = FakeTransport();
    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: SearchScreen(
            api: TheebApiClient(fake),
            baseUri: Uri.parse('http://127.0.0.1:8080/'),
            opener: (_) async => true,
          ),
        ),
      ),
    );

    expect(find.text('ذيب العرب'), findsOneWidget);
    expect(find.text('بحث'), findsOneWidget);
    expect(find.text('ابحث عن مسلسل أو فيلم…'), findsOneWidget);
  });

  testWidgets('Android TV playback requests identify the TV platform', (tester) async {
    final fake = FakeTransport();
    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: SearchScreen(
            api: TheebApiClient(fake),
            baseUri: Uri.parse('http://127.0.0.1:8080/'),
            opener: (_) async => true,
            platform: TheebPlatform.androidTv,
          ),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Fixture');
    await tester.tap(find.text('بحث'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fixture Series'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Episode 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('مشاهدة'));
    await tester.pumpAndSettle();

    final client = fake.postBodies.single['client'] as Map<String, Object?>;
    expect(client['platform'], 'android_tv');
  });

  testWidgets('watch and download remain explicit user actions', (tester) async {
    final fake = FakeTransport();
    final opened = <Uri>[];

    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: SearchScreen(
            api: TheebApiClient(fake),
            baseUri: Uri.parse('http://127.0.0.1:8080/'),
            opener: (uri) async {
              opened.add(uri);
              return true;
            },
          ),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Fixture');
    await tester.tap(find.text('بحث'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Fixture Series'));
    await tester.pumpAndSettle();
    expect(find.text('Episode 1'), findsOneWidget);

    await tester.tap(find.text('Episode 1'));
    await tester.pumpAndSettle();

    expect(
      find.text('اختر الإجراء بنفسك. لا يبدأ تشغيل أو تحميل تلقائيًا.'),
      findsOneWidget,
    );
    expect(fake.posts, isEmpty);
    expect(
      fake.gets.contains('/v1/episodes/10/download-options'),
      isFalse,
    );
    expect(opened, isEmpty);

    await tester.tap(find.text('مشاهدة'));
    await tester.pumpAndSettle();
    expect(fake.posts, ['/v1/playback/sessions']);
    expect(opened, isEmpty);
    expect(find.text('فتح المشاهدة • 720p'), findsOneWidget);

    await tester.tap(find.text('فتح المشاهدة • 720p'));
    await tester.pumpAndSettle();
    expect(
      opened.single.path,
      '/v1/playback/sessions/session-1/media',
    );

    await tester.tap(find.text('تحميل'));
    await tester.pumpAndSettle();
    expect(
      fake.gets.contains('/v1/episodes/10/download-options'),
      isTrue,
    );
    expect(opened.length, 1);
    expect(find.text('تحميل هذه الجودة'), findsOneWidget);

    await tester.tap(find.text('تحميل هذه الجودة'));
    await tester.pumpAndSettle();
    expect(opened.length, 2);
    expect(
      opened.last.path,
      '/v1/episodes/10/download-options/44/open',
    );
  });
}
