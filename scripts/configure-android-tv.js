const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.join(
  process.cwd(),
  "clients/flutter/android/app/src/main/AndroidManifest.xml"
);

let xml = fs.readFileSync(manifestPath, "utf8");

xml = xml.replace(
  '<uses-permission android:name="android.permission.INTERNET"/>',
  '<uses-permission android:name="android.permission.INTERNET"/>\n    <uses-feature android:name="android.software.leanback" android:required="true"/>\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false"/>'
);

xml = xml.replace(
  '<category android:name="android.intent.category.LAUNCHER"/>',
  '<category android:name="android.intent.category.LEANBACK_LAUNCHER"/>'
);

xml = xml.replace(
  'android:label="theeb_arab"',
  'android:label="ذيب العرب"'
);

fs.writeFileSync(manifestPath, xml);
console.log("Android TV manifest configured");
