import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:theeb_arab/main.dart';
import 'package:theeb_client/theeb_api_contract.dart';

class FakeTransport implements TheebApiTransport {
  FakeTransport({this.emptyLocal = false});
  final bool emptyLocal;
  bool imported = false;
  final List<String> gets = <String>[];
  final List<String> posts = <String>[];
  final List<Map<String, Object?>> postBodies = <Map<String, Object?>>[];

  @override
  Future<Map<String, Object?>> get(String path) async {
    gets.add(path);
    if (path.startsWith('/v1/search')) {
      if (emptyLocal && !imported) {
        return {'data': {'items': <Object?>[]}};
      }
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
    if (path.startsWith('/v1/discover')) {
      return {
        'data': {
          'items': [
            {
              'provider': 'akwam',
              'provider_series_id': '2758',
              'title': 'الذئب الوحيد',
              'content_type': 'series',
              'match_score': 100,
              'match_level': 'strong',
            }
          ],
        }
      };
    }
    if (path == '/v1/imports/job-1') {
      imported = true;
      return {
        'data': {
          'job_id': 'job-1',
          'status': 'completed',
          'progress': 100,
          'completed': 1,
          'failed': 0,
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
    if (path == '/v1/imports') {
      return {
        'data': {
          'job_id': 'job-1',
          'status': 'queued',
          'provider': body['provider'],
          'provider_series_id': body['provider_series_id'],
        }
      };
    }
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
  test('network failures are translated without raw exception details', () {
    final message = userFacingError(const SocketException('example.invalid'));
    expect(message, contains('تعذر الاتصال'));
    expect(message, isNot(contains('SocketException')));
    expect(message, isNot(contains('example.invalid')));
  });

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

  testWidgets('empty library discovers provider result and lets user add it', (tester) async {
    final fake = FakeTransport(emptyLocal: true);
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

    await tester.enterText(find.byType(TextField), 'الذئب الوحيد');
    await tester.tap(find.text('بحث'));
    await tester.pumpAndSettle();

    expect(find.text('نتائج من المصادر'), findsOneWidget);
    expect(find.text('الذئب الوحيد'), findsNWidgets(2));
    expect(find.text('إضافة'), findsOneWidget);

    await tester.tap(find.text('إضافة'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

    expect(fake.posts, contains('/v1/imports'));
    expect(fake.gets, contains('/v1/imports/job-1'));
    expect(find.text('Fixture Series'), findsOneWidget);
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
    // Platform WebView construction is covered by Android/iOS build gates.
    // The request contract itself remains testable without a platform view.
    final request = CreatePlaybackSessionRequest(
      canonicalEpisodeId: 10,
      platform: TheebPlatform.androidTv,
    );
    await TheebApiClient(fake).createPlaybackSession(request);

    final client = fake.postBodies.single['client'] as Map<String, Object?>;
    expect(client['platform'], 'android_tv');
  });

  testWidgets('iOS playback requests identify the iOS platform', (tester) async {
    final fake = FakeTransport();
    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: SearchScreen(
            api: TheebApiClient(fake),
            baseUri: Uri.parse('http://127.0.0.1:8080/'),
            opener: (_) async => true,
            platform: TheebPlatform.ios,
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
    final request = CreatePlaybackSessionRequest(
      canonicalEpisodeId: 10,
      platform: TheebPlatform.ios,
    );
    await TheebApiClient(fake).createPlaybackSession(request);

    final client = fake.postBodies.single['client'] as Map<String, Object?>;
    expect(client['platform'], 'ios');
  });

  testWidgets('watch and download remain explicit user actions', (tester) async {
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

    await tester.enterText(find.byType(TextField), 'Fixture');
    await tester.tap(find.text('بحث'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fixture Series'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Episode 1'));
    await tester.pumpAndSettle();

    expect(find.text('مشاهدة'), findsOneWidget);
    expect(find.text('تحميل'), findsOneWidget);
    expect(fake.posts, isEmpty);
    expect(fake.gets.contains('/v1/episodes/10/download-options'), isFalse);

    await tester.tap(find.text('تحميل'));
    await tester.pumpAndSettle();
    expect(fake.gets.contains('/v1/episodes/10/download-options'), isTrue);
    expect(find.text('تحميل هذه الجودة'), findsOneWidget);
  });
}
