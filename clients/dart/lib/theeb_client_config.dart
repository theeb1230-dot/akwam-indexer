class TheebClientConfig {
  const TheebClientConfig({
    required this.baseUri,
    this.clientVersion = '0.1.0',
  });

  factory TheebClientConfig.fromEnvironment() {
    const raw = String.fromEnvironment('THEEB_API_BASE_URL');
    const installable = bool.fromEnvironment(
      'THEEB_INSTALLABLE_BUILD',
      defaultValue: false,
    );
    if (raw.trim().isEmpty) {
      throw ArgumentError.value(
        raw,
        'THEEB_API_BASE_URL',
        installable
            ? 'Installable builds require a verified API URL'
            : 'API URL must be configured explicitly',
      );
    }
    final uri = Uri.parse(raw);
    if (installable) {
      validateInstallableBaseUri(uri);
    }
    return TheebClientConfig(baseUri: uri);
  }

  static void validateInstallableBaseUri(Uri uri) {
    if (uri.scheme != 'https' || !uri.hasAuthority) {
      throw ArgumentError.value(
        uri,
        'THEEB_API_BASE_URL',
        'Installable builds require an absolute HTTPS API URL',
      );
    }
    if (uri.userInfo.isNotEmpty || uri.hasQuery || uri.hasFragment) {
      throw ArgumentError.value(
        uri,
        'THEEB_API_BASE_URL',
        'Credentials, query strings and fragments are forbidden',
      );
    }

    final host = uri.host.toLowerCase();
    const exact = <String>{
      'localhost',
      '0.0.0.0',
      '127.0.0.1',
      '::1',
      'example.com',
      'example.org',
      'example.net',
      'example.invalid',
    };
    const suffixes = <String>['.invalid', '.example', '.test', '.localhost'];
    const labels = <String>{
      'dev',
      'development',
      'test',
      'testing',
      'staging',
      'stage',
      'example',
    };

    final placeholder = exact.contains(host) ||
        suffixes.any(host.endsWith) ||
        host.split('.').any(labels.contains);
    if (placeholder) {
      throw ArgumentError.value(
        uri,
        'THEEB_API_BASE_URL',
        'Placeholder or non-production API host is forbidden',
      );
    }
  }

  final Uri baseUri;
  final String clientVersion;
}
