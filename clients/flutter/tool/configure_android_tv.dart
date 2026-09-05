import 'dart:io';

void main() {
  final manifest = File('android/app/src/main/AndroidManifest.xml');
  if (!manifest.existsSync()) {
    stderr.writeln('AndroidManifest.xml not found. Run flutter create first.');
    exitCode = 2;
    return;
  }

  var xml = manifest.readAsStringSync();

  if (!xml.contains('android.software.leanback')) {
    xml = xml.replaceFirst(
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n'
      '    <uses-feature android:name="android.software.leanback" android:required="true" />\n'
      '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
    );
  }

  if (!xml.contains('android.intent.category.LEANBACK_LAUNCHER')) {
    xml = xml.replaceFirst(
      '<category android:name="android.intent.category.LAUNCHER"/>',
      '<category android:name="android.intent.category.LAUNCHER"/>\n'
      '                <category android:name="android.intent.category.LEANBACK_LAUNCHER"/>',
    );
  }

  if (!xml.contains('android:screenOrientation="landscape"')) {
    xml = xml.replaceFirst(
      'android:name=".MainActivity"',
      'android:name=".MainActivity"\n'
      '            android:screenOrientation="landscape"',
    );
  }

  final drawableDir = Directory('android/app/src/main/res/drawable');
  drawableDir.createSync(recursive: true);
  final banner = File('${drawableDir.path}/theeb_tv_banner.xml');
  banner.writeAsStringSync('''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#0B0B0B" />
            <size android:width="320dp" android:height="180dp" />
        </shape>
    </item>
</layer-list>
''');

  if (!xml.contains('android:banner="@drawable/theeb_tv_banner"')) {
    xml = xml.replaceFirst(
      '<application',
      '<application\n        android:banner="@drawable/theeb_tv_banner"',
    );
  }

  manifest.writeAsStringSync(xml);
  stdout.writeln('Configured Android TV manifest for Theeb Arab.');
}
