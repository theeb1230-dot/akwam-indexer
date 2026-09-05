class TheebClientConfig {
  const TheebClientConfig({
    required this.baseUri,
    this.clientVersion = '0.1.0',
  });

  factory TheebClientConfig.fromEnvironment() {
    const raw = String.fromEnvironment('THEEB_API_BASE_URL');
    const allowLocal = bool.fromEnvironment(
      'THEEB_ALLOW_LOCAL_API',
      defaultValue: false,
    );
    return TheebClientConfig(
      baseUri: validateBaseUri(raw, allowLocal: allowLocal),
    );
  }

  final Uri baseUri;
  final String clientVersion;

  static Uri validateBaseUri(
    String raw, {
    bool allowLocal = false,
  }) {
    final value = raw.trim();
    if (value.isEmpty) {
      throw StateError('THEEB_API_BASE_URL_REQUIRED');
    }

    final uri = Uri.tryParse(value);
    if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
      throw StateError('THEEB_API_BASE_URL_INVALID');
    }
    if (uri.userInfo.isNotEmpty || uri.query.isNotEmpty || uri.fragment.isNotEmpty) {
      throw StateError('THEEB_API_BASE_URL_INVALID');
    }

    final host = uri.host.toLowerCase();
    final loopback = host == 'localhost' || host == '127.0.0.1' || host == '::1';
    final forbidden = host == '0.0.0.0' ||
        host == 'example.com' ||
        host == 'www.example.com' ||
        host.endsWith('.invalid') ||
        host.endsWith('.test') ||
        host.endsWith('.example');

    if (forbidden) {
      throw StateError('THEEB_API_BASE_URL_PLACEHOLDER');
    }

    if (loopback) {
      if (!allowLocal || uri.scheme != 'http') {
        throw StateError('THEEB_API_BASE_URL_LOCAL_FORBIDDEN');
      }
    } else if (uri.scheme != 'https') {
      throw StateError('THEEB_API_BASE_URL_HTTPS_REQUIRED');
    }

    final normalizedPath = uri.path.endsWith('/') ? uri.path : '${uri.path}/';
    return uri.replace(path: normalizedPath);
  }
}
