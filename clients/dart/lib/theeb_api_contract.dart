// Pure Dart contract models for Flutter/mobile/TV clients.
// This file intentionally contains only stable, content-centric API models.

enum TheebPlatform { android, androidTv, ios, web, windows }
enum PlaybackQuality { auto, p1080, p720, p480 }
enum PlaybackSessionState { planning, ready, unavailable, cancelled, expired }
enum PlaybackEventType { playerOpened, firstFrame, playing, buffering, stalled, ended, fatalError }

class CreatePlaybackSessionRequest {
  const CreatePlaybackSessionRequest({
    required this.canonicalEpisodeId,
    required this.platform,
    this.quality = PlaybackQuality.auto,
    this.clientVersion,
  });

  final int canonicalEpisodeId;
  final TheebPlatform platform;
  final PlaybackQuality quality;
  final String? clientVersion;

  Map<String, Object?> toJson() => {
    'canonical_episode_id': canonicalEpisodeId,
    'quality': _qualityWire[quality],
    'client': {
      'platform': _platformWire[platform],
      if (clientVersion != null) 'version': clientVersion,
    },
  };
}

class PlaybackFeedbackRequest {
  const PlaybackFeedbackRequest({
    required this.eventId,
    required this.type,
    required this.occurredAt,
    this.positionSeconds,
    this.errorCode,
    this.details,
  });

  final String eventId;
  final PlaybackEventType type;
  final DateTime occurredAt;
  final double? positionSeconds;
  final String? errorCode;
  final Map<String, Object?>? details;

  Map<String, Object?> toJson() => {
    'event_id': eventId,
    'type': _eventWire[type],
    'occurred_at': occurredAt.toUtc().toIso8601String(),
    if (positionSeconds != null) 'position_seconds': positionSeconds,
    if (errorCode != null) 'error_code': errorCode,
    if (details != null) 'details': details,
  };
}

class TheebSeries {
  const TheebSeries({
    required this.id,
    required this.title,
    required this.contentType,
    required this.status,
    required this.episodeCount,
    this.originalTitle,
    this.description,
    this.image,
    this.language,
    this.country,
    this.year,
  });

  factory TheebSeries.fromJson(Map<String, Object?> json) => TheebSeries(
    id: _int(json, 'id'),
    title: _string(json, 'title'),
    originalTitle: json['original_title'] as String?,
    description: json['description'] as String?,
    image: json['image'] as String?,
    contentType: _string(json, 'content_type'),
    language: json['language'] as String?,
    country: json['country'] as String?,
    year: json['year'] as String?,
    status: _string(json, 'status'),
    episodeCount: _int(json, 'episode_count'),
  );

  final int id;
  final String title;
  final String? originalTitle;
  final String? description;
  final String? image;
  final String contentType;
  final String? language;
  final String? country;
  final String? year;
  final String status;
  final int episodeCount;
}

class DiscoveryItem {
  const DiscoveryItem({
    required this.provider,
    required this.providerSeriesId,
    required this.title,
    required this.contentType,
    required this.matchScore,
    required this.matchLevel,
    this.sourceUrl,
    this.displayTitle,
  });

  factory DiscoveryItem.fromJson(Map<String, Object?> json) => DiscoveryItem(
    provider: _string(json, 'provider'),
    providerSeriesId: _string(json, 'provider_series_id'),
    title: _string(json, 'title'),
    sourceUrl: json['source_url'] as String?,
    displayTitle: json['display_title'] as String?,
    contentType: _string(json, 'content_type'),
    matchScore: _int(json, 'match_score'),
    matchLevel: _string(json, 'match_level'),
  );

  final String provider;
  final String providerSeriesId;
  final String title;
  final String? sourceUrl;
  final String? displayTitle;
  final String contentType;
  final int matchScore;
  final String matchLevel;
}

class ImportJob {
  const ImportJob({
    required this.id,
    required this.status,
    required this.progress,
    required this.completed,
    required this.failed,
  });

  factory ImportJob.fromJson(Map<String, Object?> json) => ImportJob(
    id: _string(json, 'job_id'),
    status: _string(json, 'status'),
    progress: _int(json, 'progress'),
    completed: _int(json, 'completed'),
    failed: _int(json, 'failed'),
  );

  final String id;
  final String status;
  final int progress;
  final int completed;
  final int failed;

  bool get finished =>
      status == 'completed' ||
      status == 'completed_with_errors' ||
      status == 'failed' ||
      status == 'cancelled';
}

class TheebEpisode {
  const TheebEpisode({
    required this.id,
    required this.canonicalSeriesId,
    required this.seasonNumber,
    required this.watchAvailable,
    required this.downloadAvailable,
    this.episodeNumber,
    this.title,
    this.description,
    this.image,
  });

  factory TheebEpisode.fromJson(Map<String, Object?> json) => TheebEpisode(
    id: _int(json, 'id'),
    canonicalSeriesId: _int(json, 'canonical_series_id'),
    seasonNumber: _int(json, 'season_number'),
    episodeNumber: json['episode_number'] as int?,
    title: json['title'] as String?,
    description: json['description'] as String?,
    image: json['image'] as String?,
    watchAvailable: _bool(json, 'watch_available'),
    downloadAvailable: _bool(json, 'download_available'),
  );

  final int id;
  final int canonicalSeriesId;
  final int seasonNumber;
  final int? episodeNumber;
  final String? title;
  final String? description;
  final String? image;
  final bool watchAvailable;
  final bool downloadAvailable;
}

class PlaybackHandle {
  const PlaybackHandle({required this.uri, required this.quality});

  factory PlaybackHandle.fromJson(Map<String, Object?> json) => PlaybackHandle(
    uri: _string(json, 'uri'),
    quality: _string(json, 'quality'),
  );

  final String uri;
  final String quality;
}

class PlaybackSession {
  const PlaybackSession({
    required this.id,
    required this.canonicalEpisodeId,
    required this.state,
    required this.requestedQuality,
    required this.platform,
    required this.planVersion,
    required this.createdAt,
    required this.updatedAt,
    required this.expiresAt,
    this.clientVersion,
    this.playback,
  });

  factory PlaybackSession.fromJson(Map<String, Object?> json) {
    final client = _map(json, 'client');
    final playbackJson = json['playback'];
    return PlaybackSession(
      id: _string(json, 'id'),
      canonicalEpisodeId: _int(json, 'canonical_episode_id'),
      state: _sessionStateByWire(_string(json, 'state')),
      requestedQuality: _qualityByWire(_string(json, 'requested_quality')),
      platform: _platformByWire(_string(client, 'platform')),
      clientVersion: client['version'] as String?,
      planVersion: _int(json, 'plan_version'),
      playback: playbackJson == null
          ? null
          : PlaybackHandle.fromJson(_objectMap(playbackJson, 'playback')),
      createdAt: DateTime.parse(_string(json, 'created_at')),
      updatedAt: DateTime.parse(_string(json, 'updated_at')),
      expiresAt: DateTime.parse(_string(json, 'expires_at')),
    );
  }

  final String id;
  final int canonicalEpisodeId;
  final PlaybackSessionState state;
  final PlaybackQuality requestedQuality;
  final TheebPlatform platform;
  final String? clientVersion;
  final int planVersion;
  final PlaybackHandle? playback;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime expiresAt;
}

class DownloadOption {
  const DownloadOption({
    required this.id,
    required this.status,
    this.quality,
    this.format,
    this.type,
  });

  factory DownloadOption.fromJson(Map<String, Object?> json) => DownloadOption(
    id: _string(json, 'id'),
    quality: json['quality'] as String?,
    format: json['format'] as String?,
    type: json['type'] as String?,
    status: _string(json, 'status'),
  );

  final String id;
  final String? quality;
  final String? format;
  final String? type;
  final String status;
}

class DownloadOptions {
  const DownloadOptions({
    required this.canonicalEpisodeId,
    required this.items,
    required this.automaticDownload,
    required this.actionRequired,
  });

  factory DownloadOptions.fromJson(Map<String, Object?> json) => DownloadOptions(
    canonicalEpisodeId: _int(json, 'canonical_episode_id'),
    items: _list(json, 'items').map((item) =>
      DownloadOption.fromJson(_objectMap(item, 'download option'))).toList(growable: false),
    automaticDownload: _bool(json, 'automatic_download'),
    actionRequired: _string(json, 'action_required'),
  );

  final int canonicalEpisodeId;
  final List<DownloadOption> items;
  final bool automaticDownload;
  final String actionRequired;
}

class FeedbackReceipt {
  const FeedbackReceipt({required this.accepted, required this.duplicate});

  factory FeedbackReceipt.fromJson(Map<String, Object?> json) => FeedbackReceipt(
    accepted: _bool(json, 'accepted'),
    duplicate: _bool(json, 'duplicate'),
  );

  final bool accepted;
  final bool duplicate;
}

abstract interface class TheebApiTransport {
  Future<Map<String, Object?>> get(String path);
  Future<Map<String, Object?>> post(String path, Map<String, Object?> body);
}

class TheebApiClient {
  const TheebApiClient(this.transport);
  final TheebApiTransport transport;

  Future<List<TheebSeries>> search(String query) async {
    final encodedQuery = Uri.encodeComponent(query);
    final data = _data(await transport.get('/v1/search?q=$encodedQuery'));
    return _list(data, 'items').map((item) =>
      TheebSeries.fromJson(_objectMap(item, 'series'))).toList(growable: false);
  }

  Future<List<DiscoveryItem>> discover(String query) async {
    final encodedQuery = Uri.encodeComponent(query);
    final data = _data(await transport.get('/v1/discover?q=$encodedQuery'));
    return _list(data, 'items').map((item) =>
      DiscoveryItem.fromJson(_objectMap(item, 'discovery item'))).toList(growable: false);
  }

  Future<ImportJob> importDiscovery(DiscoveryItem item) async {
    final data = _data(await transport.post('/v1/imports', {
      'provider': item.provider,
      'provider_series_id': item.providerSeriesId,
    }));
    return ImportJob(
      id: _string(data, 'job_id'),
      status: _string(data, 'status'),
      progress: 0,
      completed: 0,
      failed: 0,
    );
  }

  Future<ImportJob> getImportJob(String id) async =>
    ImportJob.fromJson(_data(await transport.get('/v1/imports/${Uri.encodeComponent(id)}')));

  Future<ImportJob> cancelImportJob(String id) async =>
    ImportJob.fromJson(_data(await transport.post('/v1/imports/${Uri.encodeComponent(id)}/cancel', const {})));

  Future<TheebSeries> getSeries(int id) async =>
    TheebSeries.fromJson(_data(await transport.get('/v1/series/$id')));

  Future<List<TheebEpisode>> listEpisodes(int seriesId) async {
    final data = _data(await transport.get('/v1/series/$seriesId/episodes'));
    return _list(data, 'items').map((item) =>
      TheebEpisode.fromJson(_objectMap(item, 'episode'))).toList(growable: false);
  }

  Future<TheebEpisode> getEpisode(int id) async =>
    TheebEpisode.fromJson(_data(await transport.get('/v1/episodes/$id')));

  Future<PlaybackSession> createPlaybackSession(CreatePlaybackSessionRequest request) async =>
    PlaybackSession.fromJson(_data(await transport.post('/v1/playback/sessions', request.toJson())));

  Future<PlaybackSession> getPlaybackSession(String id) async =>
    PlaybackSession.fromJson(_data(await transport.get('/v1/playback/sessions/$id')));

  Future<FeedbackReceipt> sendPlaybackFeedback(String id, PlaybackFeedbackRequest request) async =>
    FeedbackReceipt.fromJson(_data(await transport.post('/v1/playback/sessions/$id/feedback', request.toJson())));

  Future<DownloadOptions> listDownloadOptions(int episodeId) async =>
    DownloadOptions.fromJson(_data(await transport.get('/v1/episodes/$episodeId/download-options')));
}

Map<String, Object?> _data(Map<String, Object?> envelope) => _map(envelope, 'data');

Map<String, Object?> _map(Map<String, Object?> json, String key) =>
  _objectMap(json[key], key);

Map<String, Object?> _objectMap(Object? value, String name) {
  if (value is! Map) throw FormatException('$name must be an object');
  return value.map((key, item) => MapEntry(key.toString(), item));
}

List<Object?> _list(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! List) throw FormatException('$key must be a list');
  return value.cast<Object?>();
}

String _string(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! String) throw FormatException('$key must be a string');
  return value;
}

int _int(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! int) throw FormatException('$key must be an integer');
  return value;
}

bool _bool(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! bool) throw FormatException('$key must be a boolean');
  return value;
}

PlaybackSessionState _sessionStateByWire(String value) => switch (value) {
  'planning' => PlaybackSessionState.planning,
  'ready' => PlaybackSessionState.ready,
  'unavailable' => PlaybackSessionState.unavailable,
  'cancelled' => PlaybackSessionState.cancelled,
  'expired' => PlaybackSessionState.expired,
  _ => throw FormatException('Unknown playback session state: $value'),
};

PlaybackQuality _qualityByWire(String value) =>
  _qualityWire.entries.firstWhere(
    (entry) => entry.value == value,
    orElse: () => throw FormatException('Unknown quality: $value'),
  ).key;

TheebPlatform _platformByWire(String value) =>
  _platformWire.entries.firstWhere(
    (entry) => entry.value == value,
    orElse: () => throw FormatException('Unknown platform: $value'),
  ).key;

const _platformWire = {
  TheebPlatform.android: 'android', TheebPlatform.androidTv: 'android_tv',
  TheebPlatform.ios: 'ios', TheebPlatform.web: 'web', TheebPlatform.windows: 'windows',
};
const _qualityWire = {
  PlaybackQuality.auto: 'auto', PlaybackQuality.p1080: '1080p',
  PlaybackQuality.p720: '720p', PlaybackQuality.p480: '480p',
};
const _eventWire = {
  PlaybackEventType.playerOpened: 'player_opened', PlaybackEventType.firstFrame: 'first_frame',
  PlaybackEventType.playing: 'playing', PlaybackEventType.buffering: 'buffering',
  PlaybackEventType.stalled: 'stalled', PlaybackEventType.ended: 'ended',
  PlaybackEventType.fatalError: 'fatal_error',
};
