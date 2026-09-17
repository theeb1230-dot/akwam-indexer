# RELEASE-3 Android runtime smoke failure

## Exact evidence

- Main SHA: `7ab80ed6fd2e1fa11a43239cb513ec363c9ce49d`
- Workflow: `Client Release Artifacts` run #35, attempt 3
- Failed job: `android-runtime-smoke`
- Android APK installation succeeded and the launcher command was accepted.
- Emulator boot completed.
- The first `uiautomator dump` failed with `ERROR: null root node returned by UiTestAutomationBridge`; consequently `/sdcard/theeb-before.xml` did not exist.
- API validation, Dart search smoke, Android TV build and iOS unsigned build passed on the same SHA.

## Classification

`INFRA_FAILURE` / Android UI automation readiness race. The evidence does not show an application search defect: the failure occurs before the search field can be located or exercised.

## Failed strategy

A fixed four-second sleep after launcher start was used before a single `uiautomator dump`. This is not a reliable readiness signal for a freshly booted emulator and cold Flutter application.

## Next bounded strategy

Replace the fixed sleep/single dump with a bounded UI-readiness probe that retries only the `uiautomator dump` until a non-empty hierarchy containing the expected editable control is available, with a strict deadline and diagnostic capture on exhaustion. Do not rerun the same workflow unchanged again.

## Release state

Fail closed. Do not publish the triplet until the runtime smoke passes on one exact SHA and release-readiness verifies checksums, provenance, identity/version parity, and unsigned iOS state.
