import 'package:flutter/material.dart';
import 'package:theeb_client/http_theeb_transport.dart';
import 'package:theeb_client/theeb_api_contract.dart';
import 'package:theeb_client/theeb_brand.dart';
import 'package:theeb_client/theeb_client_config.dart';
import 'package:url_launcher/url_launcher.dart';

typedef UriOpener = Future<bool> Function(Uri uri);

Future<bool> defaultOpenUri(Uri uri) =>
    launchUrl(uri, mode: LaunchMode.externalApplication);

void main() {
  runApp(const TheebArabApp());
}

class TheebArabApp extends StatelessWidget {
  const TheebArabApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: TheebBrand.productNameAr,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0B0B),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFD8C39A),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const Directionality(
        textDirection: TextDirection.rtl,
        child: SearchScreen(),
      ),
    );
  }
}

class SearchScreen extends StatefulWidget {
  const SearchScreen({
    super.key,
    this.api,
    this.baseUri,
    this.opener = defaultOpenUri,
  });

  final TheebApiClient? api;
  final Uri? baseUri;
  final UriOpener opener;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  HttpTheebTransport? _ownedTransport;
  late final TheebApiClient _api;
  late final Uri _baseUri;
  List<TheebSeries> _items = const [];
  String? _error;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.api != null && widget.baseUri != null) {
      _api = widget.api!;
      _baseUri = widget.baseUri!;
      return;
    }

    final config = TheebClientConfig.fromEnvironment();
    _ownedTransport = HttpTheebTransport(baseUri: config.baseUri);
    _api = TheebApiClient(_ownedTransport!);
    _baseUri = config.baseUri;
  }

  @override
  void dispose() {
    _controller.dispose();
    _ownedTransport?.close(force: true);
    super.dispose();
  }

  Future<void> _search() async {
    final query = _controller.text.trim();
    if (query.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _api.search(query);
      if (!mounted) return;
      setState(() => _items = items);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openSeries(TheebSeries item) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Directionality(
          textDirection: TextDirection.rtl,
          child: SeriesScreen(
            api: _api,
            baseUri: _baseUri,
            seriesId: item.id,
            opener: widget.opener,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(TheebBrand.productNameAr)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                TheebBrand.taglineAr,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _search(),
                      decoration: const InputDecoration(
                        hintText: 'ابحث عن مسلسل أو فيلم…',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _loading ? null : _search,
                    child: const Text('بحث'),
                  ),
                ],
              ),
              if (_loading) const LinearProgressIndicator(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                ),
              const SizedBox(height: 12),
              Expanded(
                child: ListView.builder(
                  itemCount: _items.length,
                  itemBuilder: (context, index) {
                    final item = _items[index];
                    return Card(
                      child: ListTile(
                        onTap: () => _openSeries(item),
                        title: Text(item.title),
                        subtitle: Text(item.description ?? item.contentType),
                        trailing: Text(item.episodeCount.toString()),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SeriesScreen extends StatefulWidget {
  const SeriesScreen({
    super.key,
    required this.api,
    required this.baseUri,
    required this.seriesId,
    required this.opener,
  });

  final TheebApiClient api;
  final Uri baseUri;
  final int seriesId;
  final UriOpener opener;

  @override
  State<SeriesScreen> createState() => _SeriesScreenState();
}

class _SeriesScreenState extends State<SeriesScreen> {
  TheebSeries? _series;
  List<TheebEpisode> _episodes = const [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final series = await widget.api.getSeries(widget.seriesId);
      final episodes = await widget.api.listEpisodes(widget.seriesId);
      if (!mounted) return;
      setState(() {
        _series = series;
        _episodes = episodes;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openEpisode(TheebEpisode episode) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Directionality(
          textDirection: TextDirection.rtl,
          child: EpisodeScreen(
            api: widget.api,
            baseUri: widget.baseUri,
            episodeId: episode.id,
            opener: widget.opener,
          ),
        ),
      ),
    );
  }

  String _episodeLabel(TheebEpisode episode) {
    if (episode.title != null) return episode.title!;
    return 'الحلقة ${episode.episodeNumber ?? episode.id}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_series?.title ?? 'تفاصيل المحتوى')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(
                        _series!.title,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      if (_series!.description != null) ...[
                        const SizedBox(height: 8),
                        Text(_series!.description!),
                      ],
                      const SizedBox(height: 18),
                      Text(
                        'الحلقات',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      for (final episode in _episodes)
                        Card(
                          child: ListTile(
                            onTap: () => _openEpisode(episode),
                            title: Text(_episodeLabel(episode)),
                            subtitle: Text(
                              'الموسم ${episode.seasonNumber} • '
                              '${episode.watchAvailable ? 'مشاهدة' : 'لا مشاهدة'} • '
                              '${episode.downloadAvailable ? 'تحميل' : 'لا تحميل'}',
                            ),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}

class EpisodeScreen extends StatefulWidget {
  const EpisodeScreen({
    super.key,
    required this.api,
    required this.baseUri,
    required this.episodeId,
    required this.opener,
  });

  final TheebApiClient api;
  final Uri baseUri;
  final int episodeId;
  final UriOpener opener;

  @override
  State<EpisodeScreen> createState() => _EpisodeScreenState();
}

class _EpisodeScreenState extends State<EpisodeScreen> {
  TheebEpisode? _episode;
  PlaybackSession? _session;
  DownloadOptions? _downloads;
  String? _error;
  bool _loading = true;
  bool _watchLoading = false;
  bool _downloadLoading = false;

  @override
  void initState() {
    super.initState();
    _loadEpisode();
  }

  Future<void> _loadEpisode() async {
    try {
      final episode = await widget.api.getEpisode(widget.episodeId);
      if (!mounted) return;
      setState(() => _episode = episode);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _prepareWatch() async {
    setState(() {
      _watchLoading = true;
      _error = null;
      _session = null;
    });
    try {
      final session = await widget.api.createPlaybackSession(
        CreatePlaybackSessionRequest(
          canonicalEpisodeId: widget.episodeId,
          platform: TheebPlatform.android,
        ),
      );
      if (!mounted) return;
      setState(() => _session = session);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _watchLoading = false);
    }
  }

  Future<void> _openWatch() async {
    final playback = _session?.playback;
    if (playback == null) return;
    final opened = await widget.opener(widget.baseUri.resolve(playback.uri));
    if (!opened && mounted) {
      setState(() => _error = 'تعذر فتح مسار المشاهدة.');
    }
  }

  Future<void> _loadDownloads() async {
    setState(() {
      _downloadLoading = true;
      _error = null;
      _downloads = null;
    });
    try {
      final options = await widget.api.listDownloadOptions(widget.episodeId);
      if (!mounted) return;
      setState(() => _downloads = options);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _downloadLoading = false);
    }
  }

  Future<void> _openDownload(DownloadOption option) async {
    final path = '/v1/episodes/${widget.episodeId}/download-options/'
        '${Uri.encodeComponent(option.id)}/open';
    final opened = await widget.opener(widget.baseUri.resolve(path));
    if (!opened && mounted) {
      setState(() => _error = 'تعذر فتح خيار التحميل.');
    }
  }

  String _episodeLabel(TheebEpisode episode) {
    if (episode.title != null) return episode.title!;
    return 'الحلقة ' + (episode.episodeNumber ?? episode.id).toString();
  }

  @override
  Widget build(BuildContext context) {
    final episode = _episode;
    return Scaffold(
      appBar: AppBar(title: const Text('الحلقة')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : episode == null
                ? Center(child: Text(_error ?? 'تعذر تحميل الحلقة'))
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(
                        _episodeLabel(episode),
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      Text('الموسم ${episode.seasonNumber}'),
                      const SizedBox(height: 20),
                      const Text(
                        'اختر الإجراء بنفسك. لا يبدأ تشغيل أو تحميل تلقائيًا.',
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          FilledButton.icon(
                            onPressed: episode.watchAvailable && !_watchLoading
                                ? _prepareWatch
                                : null,
                            icon: const Icon(Icons.play_arrow),
                            label: Text(
                              _watchLoading ? 'جارٍ التحضير…' : 'مشاهدة',
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed:
                                episode.downloadAvailable && !_downloadLoading
                                    ? _loadDownloads
                                    : null,
                            icon: const Icon(Icons.download),
                            label: Text(
                              _downloadLoading
                                  ? 'جارٍ جلب الخيارات…'
                                  : 'تحميل',
                            ),
                          ),
                        ],
                      ),
                      if (_session != null) ...[
                        const SizedBox(height: 18),
                        if (_session!.state == PlaybackSessionState.ready &&
                            _session!.playback != null)
                          FilledButton(
                            onPressed: _openWatch,
                            child: Text(
                              'فتح المشاهدة • ${_session!.playback!.quality}',
                            ),
                          )
                        else
                          Text(
                            'حالة جلسة المشاهدة: ${_session!.state.name}',
                          ),
                      ],
                      if (_downloads != null) ...[
                        const SizedBox(height: 18),
                        Text(
                          'خيارات التحميل',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        if (_downloads!.items.isEmpty)
                          const Text('لا توجد خيارات تحميل جاهزة حاليًا.')
                        else
                          for (final option in _downloads!.items)
                            Card(
                              child: ListTile(
                                title: Text(option.quality ?? 'جودة متاحة'),
                                subtitle: Text(
                                  [option.format, option.status]
                                      .whereType<String>()
                                      .join(' • '),
                                ),
                                trailing: FilledButton(
                                  onPressed: () => _openDownload(option),
                                  child: const Text('تحميل هذه الجودة'),
                                ),
                              ),
                            ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 14),
                        Text(
                          _error!,
                          style: const TextStyle(color: Colors.redAccent),
                        ),
                      ],
                    ],
                  ),
      ),
    );
  }
}
