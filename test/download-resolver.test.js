const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const {
  createDownloadResolver,
  normalizeDownloadOption,
  metadataWithoutUrls,
  providerErrorCode
} = require("../src/services/download-resolver");

function testDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE canonical_series (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL
    );
    CREATE TABLE canonical_episodes (
      id INTEGER PRIMARY KEY,
      canonical_series_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      title TEXT
    );
    CREATE TABLE provider_episodes (
      id INTEGER PRIMARY KEY,
      canonical_episode_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      provider_episode_id TEXT NOT NULL,
      source_url TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE download_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_episode_id INTEGER NOT NULL,
      provider_episode_id INTEGER NOT NULL,
      candidate_key TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      download_id TEXT,
      quality TEXT,
      format TEXT,
      status TEXT NOT NULL,
      locator_json TEXT NOT NULL,
      metadata_json TEXT,
      updated_at TEXT
    );
    INSERT INTO canonical_series VALUES (1, 'Lucky');
    INSERT INTO canonical_episodes VALUES (15, 1, 1, 5, 'E5');
    INSERT INTO provider_episodes (
      id, canonical_episode_id, provider,
      provider_episode_id, source_url
    ) VALUES (
      20, 15, 'fixture', 'provider-e5', 'https://fixture/episode'
    );
  `);
  return db;
}

test("download option is separate, live, and requires user selection", () => {
  const option = normalizeDownloadOption({
    download_id: "d1",
    quality: "720",
    format: "mp4",
    direct_url: "https://media.example/file.mp4"
  }, {
    provider: "fixture",
    providerEpisodeId: "e1"
  });

  assert.equal(option.quality, "720p");
  assert.equal(option.live_url, "https://media.example/file.mp4");
  assert.equal(option.requires_user_selection, true);
  assert.equal(option.is_direct_file, true);
  assert.equal(option.requires_external_navigation, false);
  assert.equal("watch_id" in option, false);
});

test("external pages are never represented as direct download files", () => {
  const option = normalizeDownloadOption({
    download_id: "page-1",
    type: "external_download_page",
    page_url: "https://provider.example/downloads?id=1"
  }, {
    provider: "fixture",
    providerEpisodeId: "e1"
  });

  assert.equal(option.type, "external_download_page");
  assert.equal(option.is_direct_file, false);
  assert.equal(option.requires_external_navigation, true);
  assert.equal(option.availability, "unknown");
});

test("persisted metadata recursively removes temporary URL fields", () => {
  const clean = metadataWithoutUrls({
    download_id: "d1",
    direct_url: "https://temporary.example/a.mp4",
    nested: {
      resolved_url: "https://temporary.example/b.mp4",
      mediaUrl: "https://temporary.example/c.mp4",
      token: "opaque"
    }
  });

  assert.deepEqual(clean, {
    download_id: "d1",
    nested: { token: "opaque" }
  });
});

test("resolver discovers live options but persists only stable locators", async () => {
  const db = testDatabase();
  const provider = {
    async getDownloadOptions() {
      return [{
        download_id: "download-e5",
        quality: "1080p",
        format: "mp4",
        direct_url: "https://temporary.example/e5.mp4",
        filename: "e5.mp4"
      }];
    }
  };
  const providers = {
    has: name => name === "fixture",
    get: () => provider
  };

  const resolver = createDownloadResolver({ db, providers });
  const result = await resolver.resolveDownloadOptions(15);

  assert.equal(result.download_option_count, 1);
  assert.equal(result.automatic_download, false);
  assert.equal(result.action_required, "user_selection");
  assert.equal(
    result.download_options[0].live_url,
    "https://temporary.example/e5.mp4"
  );

  const persisted = db.prepare(`
    SELECT locator_json, metadata_json FROM download_candidates
  `).get();
  assert.equal(persisted.locator_json.includes("temporary.example"), false);
  assert.equal(persisted.metadata_json.includes("temporary.example"), false);
  db.close();
});

test("resolver reports unsupported providers without inventing options", async () => {
  const db = testDatabase();
  let episodeCalls = 0;
  const providers = {
    has: () => true,
    get: () => ({
      async getEpisode() {
        episodeCalls += 1;
        return { watch_options: [{ watch_id: "watch-only" }] };
      }
    })
  };

  const resolver = createDownloadResolver({ db, providers });
  const result = await resolver.resolveDownloadOptions(15);

  assert.deepEqual(result.download_options, []);
  assert.equal(result.automatic_download, false);
  assert.equal(result.source_errors[0].error, "DOWNLOAD_NOT_SUPPORTED");
  assert.equal(episodeCalls, 0);
  db.close();
});

test("resolver ignores provider sources marked inactive", async () => {
  const db = testDatabase();
  db.prepare(`
    UPDATE provider_episodes
    SET active = 0
    WHERE id = 20
  `).run();
  let calls = 0;
  const providers = {
    has: () => true,
    get: () => ({
      async getDownloadOptions() {
        calls += 1;
        return [{
          download_id: "must-not-be-used",
          direct_url: "https://temporary.example/inactive.mp4"
        }];
      }
    })
  };

  const resolver = createDownloadResolver({ db, providers });
  const result = await resolver.resolveDownloadOptions(15);

  assert.equal(calls, 0);
  assert.equal(result.download_option_count, 0);
  assert.deepEqual(result.download_options, []);
  db.close();
});

test("provider failures expose stable codes instead of raw messages", async () => {
  const db = testDatabase();
  const providers = {
    has: () => true,
    get: () => ({
      async getDownloadOptions() {
        throw new Error("request failed for https://secret.example/token");
      }
    })
  };

  const resolver = createDownloadResolver({ db, providers });
  const result = await resolver.resolveDownloadOptions(15);

  assert.equal(
    result.source_errors[0].error,
    "PROVIDER_DOWNLOAD_ERROR"
  );
  assert.equal(JSON.stringify(result).includes("secret.example"), false);
  assert.equal(
    providerErrorCode({ code: "SOURCE_EXPIRED" }),
    "SOURCE_EXPIRED"
  );
  db.close();
});

test("refreshing options marks disappeared candidates inactive", async () => {
  const db = testDatabase();
  let options = [{
    download_id: "old",
    type: "download_file",
    direct_url: "https://temporary.example/old.mp4"
  }];
  const providers = {
    has: () => true,
    get: () => ({
      async getDownloadOptions() {
        return options;
      }
    })
  };
  const resolver = createDownloadResolver({ db, providers });

  await resolver.resolveDownloadOptions(15);
  options = [{
    download_id: "new",
    type: "download_file",
    direct_url: "https://temporary.example/new.mp4"
  }];
  await resolver.resolveDownloadOptions(15);

  const rows = db.prepare(`
    SELECT download_id, status
    FROM download_candidates
    ORDER BY download_id
  `).all();
  assert.deepEqual(rows, [
    { download_id: "new", status: "active" },
    { download_id: "old", status: "inactive" }
  ]);
  db.close();
});
