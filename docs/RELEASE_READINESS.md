# Release Readiness Matrix

هذا الملف يشرح سياسة التصنيف التي يفرضها الملف الآلي `docs/release-readiness.json`. المصفوفة JSON هي مصدر الحقيقة القابل للقراءة آليًا، وكل شرط فيها يجب أن يكون واحدًا من:

- `PASS`: الشرط مثبت، ويجب أن يحتوي `evidence` غير فارغ مرتبطًا بالـcommit/tag المرشح.
- `FAIL`: الشرط فشل.
- `NOT_VERIFIED`: لا يوجد دليل كافٍ بعد.

التصنيف تراكمي: Beta يتطلب كل Experimental، وGolden يتطلب كل Beta، وComplete يتطلب كل Golden. `scripts/validate-release-readiness.js` يفشل fail-closed إذا كان أي شرط مطلوب ليس `PASS` أو إذا وُجد `PASS` بلا دليل.

## الحالة الحالية

أصبح لدينا API HTTPS خارجي حقيقي على Render مرتبط بقاعدة PostgreSQL في Neon، ونجحت `/livez` و`/readyz` و`/v1/search` وDart client smoke. تبقى مصفوفة المصدر الثابت متحفظة، بينما يولّد Workflow الإصدار مصفوفة أدلة runtime مرتبطة بنفس `GITHUB_SHA` و`GITHUB_RUN_ID` بعد نجاح الاختبارات وفحص الحزم الثلاث. لا يُنشر GitHub Release إلا بعد نجاح هذه الأدلة.

## الحزم المطلوبة لكل GitHub Release

لا يسمح Workflow الإصدار بنشر Release بلا الحزم الثلاث من نفس تشغيل/commit:

1. `theeb-arab-android.apk`
2. `theeb-arab-android-tv.apk`
3. `theeb-arab-ios-unsigned.ipa` في Experimental فقط ما دامت unsigned

تولد البوابة `SHA256SUMS.txt` و`release-manifest.json` وتربطهما بـ`GITHUB_SHA`. الحزمة iOS الحالية unsigned، لذلك Workflow الحالي يرفض Beta/Golden/Complete صراحة ولا يدعي قابلية تثبيتها مباشرة.

## تحديث الأدلة

لا تغيّر حالة إلى PASS إلا عند وجود دليل حقيقي يمكن مراجعته، مثل workflow run ناجح، تقرير E2E، device/runtime smoke، checksum manifest، أو تقرير أمني/أداء مرتبط بالـcommit المرشح. إذا أصبح دليل قديمًا أو لم يعد يخص commit المرشح، أعد الحالة إلى `NOT_VERIFIED`.


## Artifact identity evidence

The client release workflow now records platform metadata before a release candidate can pass readiness. The evidence must show:

- Android Mobile applicationId, version name/code, and a verified APK signature.
- Android TV applicationId, version name/code, a verified APK signature, and manifest evidence for Leanback/TV requirements.
- iOS bundle identifier, version/build, exactly one `Payload/*.app`, and the explicit `UNSIGNED` state for Experimental.
- the same commit SHA and the same version/build across all three client artifacts.

The metadata validator rejects commit drift, version drift, unexpected product identifiers, missing Android signature evidence, missing TV manifest evidence, and malformed iOS payload structure. These checks do not replace device runtime smoke; they only prove artifact identity/integrity before runtime evidence is considered.


## أول إصدار يعتمد الـAPI الحقيقي

الإصدار التجريبي الأول يستخدم:
- API: `https://theeb-arab-api.onrender.com`
- Flutter client version: `0.1.1+2`
- GitHub Release tag: `v0.1.1-experimental.1`
- Android Mobile APK + Android TV APK + iOS unsigned IPA من نفس commit.
- iOS remains unsigned في هذا التصنيف ولا يُدّعى أنه App Store-signed.


## v0.2.0-experimental.1
- البحث يبدأ من مكتبة PostgreSQL المشتركة.
- إذا لم توجد نتيجة، يبحث العميل في Providers الحالية عبر `/v1/discover`.
- المستخدم يختار النتيجة بنفسه ثم يضغط «إضافة»؛ لا يوجد استيراد تلقائي بلا اختيار.
- يتابع العميل import job حتى الاكتمال ثم يعيد البحث داخل المكتبة تلقائيًا.
- المشاهدة والتحميل يظلان إجراءين منفصلين وصريحين.
- Android Mobile وAndroid TV يبنيان بوضع Release بدل Debug.
- بوابة الإصدار ترفض النشر إذا كان كل من بحث المكتبة وprovider discovery فارغًا لاستعلام smoke الحقيقي «الذئب الوحيد».
