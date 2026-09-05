enum TheebClientTarget { mobile, tv }

class TheebClientConfig {
  const TheebClientConfig({
    required this.baseUri,
    this.clientVersion = '0.1.0',
    this.target = TheebClientTarget.mobile,
  });

  factory TheebClientConfig.fromEnvironment() {
    const raw = String.fromEnvironment(
      'THEEB_API_BASE_URL',
      defaultValue: 'http://127.0.0.1:8080/',
    );
    const targetRaw = String.fromEnvironment(
      'THEEB_TARGET',
      defaultValue: 'mobile',
    );
    return TheebClientConfig(
      baseUri: Uri.parse(raw),
      target: targetRaw == 'tv'
          ? TheebClientTarget.tv
          : TheebClientTarget.mobile,
    );
  }

  final Uri baseUri;
  final String clientVersion;
  final TheebClientTarget target;

  bool get isTv => target == TheebClientTarget.tv;
}
