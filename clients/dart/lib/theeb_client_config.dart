class TheebClientConfig {
  const TheebClientConfig({
    required this.baseUri,
    this.clientVersion = '0.1.0',
  });

  factory TheebClientConfig.fromEnvironment() {
    const raw = String.fromEnvironment(
      'THEEB_API_BASE_URL',
      defaultValue: 'http://127.0.0.1:8080/',
    );
    return TheebClientConfig(baseUri: Uri.parse(raw));
  }

  final Uri baseUri;
  final String clientVersion;
}
