# Release Readiness Matrix

هذا الملف يشرح سياسة التصنيف التي يفرضها الملف الآلي `docs/release-readiness.json`. المصفوفة JSON هي مصدر الحقيقة القابل للقراءة آليًا، وكل شرط فيها يجب أن يكون واحدًا من:

- `PASS`: الشرط مثبت، ويجب أن يحتوي `evidence` غير فارغ مرتبطًا بالـcommit/tag المرشح.
- `FAIL`: الشرط فشل.
- `NOT_VERIFIED`: لا يوجد دليل كافٍ بعد.

التصنيف تراكمي: Beta يتطلب كل Experimental، وGolden يتطلب كل Beta، وComplete يتطلب كل Golden. `scripts/validate-release-readiness.js` يفشل fail-closed إذا كان أي شرط مطلوب ليس `PASS` أو إذا وُجد `PASS` بلا دليل.

## الحالة الحالية

الحالة الحالية **غير مؤهلة حتى Experimental** لأن API HTTPS خارجي حقيقي وruntime smoke للحزم القابلة للتثبيت لم يُثبتا بعد. لذلك المصفوفة تبدأ متحفظة بـ`NOT_VERIFIED` بدل اختراع أدلة من نجاح build داخلي.

## الحزم المطلوبة لكل GitHub Release

لا يسمح Workflow الإصدار بنشر Release بلا الحزم الثلاث من نفس تشغيل/commit:

1. `theeb-arab-android.apk`
2. `theeb-arab-android-tv.apk`
3. `theeb-arab-ios-unsigned.ipa` في Experimental فقط ما دامت unsigned

تولد البوابة `SHA256SUMS.txt` و`release-manifest.json` وتربطهما بـ`GITHUB_SHA`. الحزمة iOS الحالية unsigned، لذلك Workflow الحالي يرفض Beta/Golden/Complete صراحة ولا يدعي قابلية تثبيتها مباشرة.

## تحديث الأدلة

لا تغيّر حالة إلى PASS إلا عند وجود دليل حقيقي يمكن مراجعته، مثل workflow run ناجح، تقرير E2E، device/runtime smoke، checksum manifest، أو تقرير أمني/أداء مرتبط بالـcommit المرشح. إذا أصبح دليل قديمًا أو لم يعد يخص commit المرشح، أعد الحالة إلى `NOT_VERIFIED`.
