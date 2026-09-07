# Autonomous Development State

> Persistent handoff for the hourly autonomous development loop. GitHub/main/CI/runtime evidence always overrides this document if they disagree.

## Verified state at start of this cycle

- Repository: `theeb1230-dot/akwam-indexer`
- Main head before this PR: `35d613e169e3fd5572ac1935b27e540e69454a00`
- Open PRs at cycle start: none.
- Latest main CI: run #313 / `34008062303` = PASS.
- Latest Render External Smoke: run #67 / `34008062308` = PASS.
- Production API: `https://theeb-arab-api.onrender.com`.
- Render production deploy serving application code: commit `ca4642c7d1f1f1022942fe69ecefe44422fe2191` = LIVE.
- PostgreSQL/Neon production counts observed this cycle: 4 canonical series, 26 canonical episodes, 26 active provider episodes.
- Flutter client version: `0.2.5+8`.
- Intended release tag: `v0.2.5-experimental.1`.
- Latest published release remains `v0.2.4-experimental.1`.

## Current cycle update

- PR #103 merged handoff + retry=2 and triggered Client Release Artifacts run #31 on main.
- A concurrent pre-existing PR #102 was discovered immediately afterward. It contains a unique required fix: persist Android platform-tools/emulator via `GITHUB_PATH` so the *next* runtime-smoke step can invoke `adb`.
- The branch has been reset onto latest main to eliminate duplicated handoff/trigger changes, preserving only the unique cross-step PATH fix, its regression test, this state update, and retry=3.
- Run #31 may still fail after emulator boot because it was triggered before this cross-step PATH fix is merged; do not weaken the runtime gate.

## Current release blocker

Client Release Artifacts run #30 / `34007633859` built and validated all three artifacts successfully:

- Android Mobile APK = PASS
- Android TV APK = PASS
- iOS unsigned IPA = PASS
- API validation + real Dart Search smoke = PASS

Publishing was blocked because `android-runtime-smoke` failed at the **Start Android emulator** step. PR #101 subsequently fixed the emulator job by exporting Android platform-tools/emulator onto `PATH` before using `adb`. The fix is on main and CI is green, but the release workflow is path-triggered by `release/trigger.json`, so a fresh triplet run is still required.

## Product/runtime fixes already on main

- Real HTTPS API instead of placeholders.
- PostgreSQL runtime library + discovery/import flow.
- User-selected provider discovery/import.
- Import cancellation and query/job state isolation.
- Generic season-number repair rather than title-specific hardcoding.
- Playback capability/candidate contract repair and lazy playback resolution.
- Legacy zero-episode movie reconciliation.
- In-app WebView playback flow instead of external-only handoff.
- Discovery noise suppression and stale zero-episode series filtering.
- Android/TV release APK builds instead of debug APKs.

## Release Readiness

### Experimental
- Repo/CI stable: PASS on current main.
- Real HTTPS API readiness/search smoke: PASS in latest release validation and Render smoke.
- Placeholder fail-closed gates: PASS in latest release build.
- PostgreSQL core runtime: PASS.
- Watch/download separation: PASS by client contract/tests.
- Android Mobile build/identity/signature: PASS in run #30.
- Android TV build/identity/signature/Leanback manifest: PASS in run #30.
- iOS IPA structure/bundle/version/UNSIGNED declaration: PASS in run #30.
- Installed Android runtime Search UI smoke: **RETRY REQUIRED after PR #101 fix**.
- GitHub Release v0.2.5: NOT PUBLISHED.

Therefore the candidate is **not yet publishable as Experimental v0.2.5** until the new installed-APK runtime smoke passes.

### Beta / Golden / Complete
Not currently claimable. Among the remaining evidence requirements are full real-device E2E for watch + download, TV D-pad/focus runtime evidence, iOS signed/runtime evidence where required, broader security/performance/stress/soak/backup/restore/failover evidence, and no High/Critical blockers.

## Handoff objectives, ordered

1. Finish PR #102: require CI/Phase 3/Render smoke green, then merge the persistent GITHUB_PATH fix.
2. Re-run the full v0.2.5 triplet from the PR #102 merge commit using retry=3.
3. Inspect installed Android Search UI runtime smoke; fix root cause without weakening the gate if it fails.
4. Publish the three artifacts together only if all identity, placeholder, runtime, parity and readiness gates pass.
5. After release is resolved, validate real playback inside the embedded player, including WebView load failure/fallback behavior.
6. Add Android TV runtime D-pad/focus smoke and eliminate mobile-only interaction assumptions.
7. Add persistent E2E evidence for Search → details → episodes/movie item → explicit Watch and explicit Download, with PostgreSQL state verification.
8. Continue dependency/security/performance/observability review with zero-cost constraints.

## Previous objectives superseded by the current cycle

1. Re-run the full v0.2.5 triplet from latest main after the Android runtime smoke PATH fix.
2. If runtime smoke fails, inspect exact emulator/app/UI logs and fix the root cause on the single open PR branch; do not weaken the runtime gate.
3. Publish the three artifacts together only if build + identity + placeholder scan + installed-app runtime smoke + readiness all pass.
4. After release is resolved, validate **real playback inside the embedded player** from an imported episode, including error/fallback behavior.
5. Add Android TV runtime D-pad/focus smoke and eliminate any mobile-only interaction assumptions.
6. Add persistent E2E evidence for Search → details → episodes/movie item → explicit Watch and explicit Download, with PostgreSQL state verification.
7. Continue dependency/security/performance/observability review with zero-cost constraints.

## Cycle log

- This cycle created the required persistent handoff document.
- This cycle schedules a release retry by bumping `release/trigger.json.retry` to 2.
