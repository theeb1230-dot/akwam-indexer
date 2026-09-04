import 'dart:convert';
import 'dart:io';

import 'theeb_api_contract.dart';

class HttpTheebTransport implements TheebApiTransport {
  HttpTheebTransport({
    required Uri baseUri,
    HttpClient? client,
    this.timeout = const Duration(seconds: 12),
  })  : baseUri = _normalizeBase(baseUri),
        _client = client ?? HttpClient();

  final Uri baseUri;
  final HttpClient _client;
  final Duration timeout;

  static Uri _normalizeBase(Uri input) {
    if (!input.hasScheme || !input.hasAuthority) {
      throw ArgumentError.value(input, 'baseUri', 'Absolute URL required');
    }
    if (input.userInfo.isNotEmpty) {
      throw ArgumentError.value(input, 'baseUri', 'Credentials are forbidden');
    }
    final isLoopback = input.host == '127.0.0.1' ||
        input.host == 'localhost' ||
        input.host == '::1';
    if (input.scheme != 'https' && !(input.scheme == 'http' && isLoopback)) {
      throw ArgumentError.value(input, 'baseUri', 'HTTPS required outside loopback');
    }
    final normalizedPath = input.path.endsWith('/') ? input.path : input.path + '/';
    return input.replace(path: normalizedPath);
  }

  Uri _resolve(String path) {
    final relative = path.startsWith('/') ? path.substring(1) : path;
    return baseUri.resolve(relative);
  }

  @override
  Future<Map<String, Object?>> get(String path) async {
    final request = await _client.getUrl(_resolve(path)).timeout(timeout);
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    final response = await request.close().timeout(timeout);
    return _decode(response);
  }

  @override
  Future<Map<String, Object?>> post(String path, Map<String, Object?> body) async {
    final request = await _client.postUrl(_resolve(path)).timeout(timeout);
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    request.headers.contentType = ContentType.json;
    request.write(jsonEncode(body));
    final response = await request.close().timeout(timeout);
    return _decode(response);
  }

  Future<Map<String, Object?>> _decode(HttpClientResponse response) async {
    final raw = await utf8.decoder.bind(response).join().timeout(timeout);
    Object? parsed;
    try {
      parsed = raw.isEmpty ? <String, Object?>{} : jsonDecode(raw);
    } on FormatException {
      throw const HttpException('INVALID_JSON_RESPONSE');
    }

    if (parsed is! Map) {
      throw const HttpException('INVALID_RESPONSE_SHAPE');
    }

    final body = parsed.map<String, Object?>(
      (key, item) => MapEntry(key.toString(), item),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = body['error'];
      throw HttpException(error is String ? error : 'HTTP_' + response.statusCode.toString());
    }

    return body;
  }

  void close({bool force = false}) => _client.close(force: force);
}
