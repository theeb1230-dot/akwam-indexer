#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="${1:-/tmp/theeb-ui.xml}"
EXPECTED_CLASS="${2:-android.widget.EditText}"
MAX_ATTEMPTS="${THEEB_UI_MAX_ATTEMPTS:-12}"
SLEEP_SECONDS="${THEEB_UI_SLEEP_SECONDS:-2}"
REMOTE_PATH="/sdcard/theeb-ui-readiness.xml"

case "$MAX_ATTEMPTS" in
  ''|*[!0-9]*) echo "INVALID_UI_MAX_ATTEMPTS" >&2; exit 2 ;;
esac
if [ "$MAX_ATTEMPTS" -lt 1 ] || [ "$MAX_ATTEMPTS" -gt 30 ]; then
  echo "UI_MAX_ATTEMPTS_OUT_OF_RANGE" >&2
  exit 2
fi

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  rm -f "$OUTPUT_PATH"
  adb shell rm -f "$REMOTE_PATH" >/dev/null 2>&1 || true
  if adb shell uiautomator dump "$REMOTE_PATH" >/tmp/theeb-uiautomator-dump.log 2>&1 \
      && adb pull "$REMOTE_PATH" "$OUTPUT_PATH" >/tmp/theeb-uiautomator-pull.log 2>&1 \
      && [ -s "$OUTPUT_PATH" ] \
      && grep -Fq "class=\"$EXPECTED_CLASS\"" "$OUTPUT_PATH"; then
    echo "ANDROID_UI_READY attempt=$attempt"
    exit 0
  fi
  echo "ANDROID_UI_NOT_READY attempt=$attempt/$MAX_ATTEMPTS" >&2
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep "$SLEEP_SECONDS"
  fi
done

echo "ANDROID_UI_READINESS_TIMEOUT" >&2
cat /tmp/theeb-uiautomator-dump.log >&2 2>/dev/null || true
cat /tmp/theeb-uiautomator-pull.log >&2 2>/dev/null || true
adb shell dumpsys window windows >&2 2>/dev/null || true
exit 1
