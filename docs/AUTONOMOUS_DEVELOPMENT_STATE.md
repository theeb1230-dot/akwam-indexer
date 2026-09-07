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

## Current cycle update — 2026-09-07T22:50+03:00

- GitHub reality at cycle start: no open PRs; main head `02d6e993f0c793849628376a4269055cb7029c36` (PR #104 merged).
- Main CI #319 / `34100335103` = PASS.
- Render External Smoke #73 / `34100335098` = PASS.
- Client Release Artifacts #32 / `34100335102` built and validated Android Mobile, Android TV, and iOS successfully, and API + real Dart Search smoke passed.
- Release run #32 was cancelled only in `android-runtime-smoke`: `Start Android emulator` stalled after AVD creation and `adb wait-for-device` remained unbounded until the job timeout at ~24 minutes. This confirms the previous persistent PATH fix worked; the current root cause is emulator startup control.
- Opened PR #105 `Release: bound Android emulator runtime smoke` on branch `release/harden-android-emulator-smoke`.
- PR #105 replaces unbounded device wait with explicit 90-second adb-device and 180-second boot-complete budgets, one controlled retry, KVM/process/adb/emulator-log diagnostics, and an 8-minute step timeout. The installed-app Search UI gate itself is unchanged.
- PR #105 CI started: CI #320 / `34156983131`, Phase 3 Provider Recovery #225 / `34156983127`, Render External Smoke #74 / `34156983150`.
- Latest published release remains `v0.2.4-experimental.1`; `v0.2.5-experimental.1` is not published and must not be claimed until installed-APK runtime smoke passes.

## أهداف التشغيل التالي

1. Finish PR #105 only: inspect CI #320, Provider Recovery #225, and Render External Smoke #74; fix any real failures on the same branch and merge only when all required checks are green.
2. After #105 merges, bump `release/trigger.json` on a single new PR to trigger a fresh `v0.2.5-experimental.1` triplet from the new main commit.
3. Inspect the new `android-runtime-smoke` evidence. If emulator boot still fails, use the newly captured emulator/KVM/adb diagnostics to fix the root cause without weakening the installed-app Search UI gate.
4. Publish Android Mobile APK + Android TV APK + iOS UNSIGNED IPA together only if API validation, artifact identity/parity, placeholder scan, installed-app runtime smoke, readiness matrix, and SHA-256 gates all pass.
5. Once v0.2.5 Experimental is resolved, validate real embedded playback, then add Android TV D-pad/focus runtime smoke and persistent E2E evidence for Search → details → episodes/movie → explicit Watch and explicit Download with PostgreSQL verification.

## Cycle update — 2026-09-07 bounded emulator release retry

- Actual main at cycle inspection: `02d6e993f0c793849628376a4269055cb7029c36`.
- Single active PR: #105 `release/harden-android-emulator-smoke`.
- Main CI run #319 / `34100335103`: PASS.
- Render External Smoke run #73 / `34100335098`: PASS.
- Client Release Artifacts run #32 / `34100335102`: CANCELLED.
- Run #32 passed API validation, Android APK build/identity/placeholder checks, Android TV APK build/identity/Leanback checks, and iOS unsigned IPA build/identity/placeholder checks.
- The release was not published because `android-runtime-smoke` remained in `Start Android emulator` until the 25-minute job timeout cancelled the workflow.
- Root cause in the workflow: `adb wait-for-device` could block until the outer job timeout if the emulator never registered with ADB.
- PR #105 bounds emulator startup with an 8-minute step timeout, a 90-second ADB wait, a 180-second boot wait, one controlled retry, and diagnostics for process/ADB/KVM/emulator logs.
- `release/trigger.json.retry` is now 4 so merge to main automatically launches a fresh v0.2.5 triplet from the merge commit.
- Latest published release remains `v0.2.4-experimental.1`; do not claim `v0.2.5-experimental.1` until runtime smoke + readiness + publication succeed.

## أهداف التشغيل التالي

1. Keep PR #105 as the only open PR; fix any CI/Phase 3/Render failure on the same branch and merge only when all required checks are green.
2. Inspect the automatic Client Release Artifacts retry=4 from the #105 merge commit.
3. If emulator startup fails, use the emitted emulator/ADB/KVM diagnostics to repair the root cause without weakening installed-app Search UI smoke.
4. If Android runtime Search UI passes, require release-readiness and publish-release to succeed.
5. Verify `v0.2.5-experimental.1` contains Android Mobile APK + Android TV APK + unsigned iOS IPA + SHA256SUMS.txt + release manifest/evidence from one commit/version, and record SHA-256 values here.
6. After v0.2.5 is resolved, continue embedded-player playback E2E, Android TV D-pad/focus runtime smoke, and explicit Watch/Download E2E with PostgreSQL verification.

## Cycle update — v0.2.5 retry 5 AVD path root cause

- PR #105 merged as commit `1b98c5b44ea9e67ed81dd49fc1de1560f301f339`.
- Client Release Artifacts run #33 / `34157291488` built and validated all three artifacts from that commit:
  - Android Mobile APK: PASS.
  - Android TV APK: PASS.
  - iOS unsigned IPA: PASS.
  - API readiness + real Dart Search smoke: PASS.
- Publication remained fail-closed because `android-runtime-smoke` failed during emulator startup.
- New diagnostic evidence from run #33:
  - KVM available.
  - ADB available.
  - Emulator process failed with `Unknown AVD name [theeb-runtime-smoke]`.
  - Emulator searched `ANDROID_AVD_HOME`, `ANDROID_SDK_HOME/avd`, and `HOME/.android/avd`, but no matching `.ini` existed there.
- Root cause: AVD creation path was implicit and did not match the emulator lookup path on the GitHub runner.
- This cycle pins `ANDROID_AVD_HOME=$RUNNER_TEMP/android-avd`, persists it through `GITHUB_ENV`, and requires both `theeb-runtime-smoke.ini` and `theeb-runtime-smoke.avd` to exist before emulator startup.
- `release/trigger.json.retry` advances to 5.
- Latest published release is still `v0.2.4-experimental.1`; `v0.2.5-experimental.1` remains unpublished.

## أهداف التشغيل التالي

1. Keep the AVD-path repair PR as the only open PR and merge only after CI/Phase 3/Render smoke pass.
2. Inspect Client Release Artifacts retry=5 from the merge commit.
3. Require Android runtime Search UI smoke to pass without weakening its real-result check.
4. If it fails, use the bounded emulator diagnostics or UI dump to repair the exact root cause.
5. If release-readiness and publish-release pass, verify the visible `v0.2.5-experimental.1` Release and all assets/checksums/manifest parity.
6. Record exact release URL, asset sizes and SHA-256 digests in this handoff.
7. Continue real embedded-player playback E2E and Android TV D-pad/focus runtime verification after v0.2.5 is resolved.
