const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.join(process.cwd(), "clients/flutter/android/app/src/main/AndroidManifest.xml");

if (!fs.existsSync(manifestPath)) {
  throw new Error("AndroidManifest.xml not found; generate the Android scaffold first.");
}

let manifest = fs.readFileSync(manifestPath, "utf8");

if (!manifest.includes("android.software.leanback")) {
  manifest = manifest.replace(
    "<application",
    '    <uses-feature android:name="android.software.leanback" android:required="true" />\n' +
      '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n\n' +
      "    <application"
  );
}

if (!manifest.includes("android.intent.category.LEANBACK_LAUNCHER")) {
  manifest = manifest.replace(
    '<category android:name="android.intent.category.LAUNCHER"/>',
    '<category android:name="android.intent.category.LAUNCHER"/>\n' +
      '                <category android:name="android.intent.category.LEANBACK_LAUNCHER"/>'
  );
}

fs.writeFileSync(manifestPath, manifest);

for (const token of [
  "android.software.leanback",
  "android.hardware.touchscreen",
  "android.intent.category.LEANBACK_LAUNCHER"
]) {
  if (!manifest.includes(token)) {
    throw new Error(`Android TV manifest configuration missing: ${token}`);
  }
}

console.log("Android TV manifest configured.");
