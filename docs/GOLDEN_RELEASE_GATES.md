# Theeb Golden Release Gates

هذه البوابات هي الحد الأدنى الآلي قبل ترشيح إصدار ذيب كنسخة ذهبية. نجاحها لا يعني وحده أن الإصدار Production-ready، ولا يثبت أن مواقع الطرف الثالث أو تشغيل الفيديو الحي يعملان الآن.

## البوابات الحتمية داخل CI

| البوابة | ما تثبته | ما لا تثبته |
|---|---|---|
| Regression | ثبات ربط الحلقات، منع false merge، وتصنيف الفشل | صحة بيانات المواقع الحالية |
| Security | مصفوفة SSRF، منع البروتوكولات والاعتمادات الخطرة، وعدم تعطيل TLS | اختبار اختراق خارجي كامل |
| Provider contract | سلامة Registry وصدق capabilities، مع Fixtures حتمية لمسار WeCima الأساسي | نجاح scraping حي لكل Provider |
| Live contract | أن HTTP 200 للـEmbed لا يساوي تشغيلًا، وأن E1–E7 تحتاج أدلة دلالية كاملة | نجاح المواقع الحية؛ هذه البوابة تختبر العقد فقط |
| Migration | القيود المطلوبة، parameterized transfer، ثم تطبيق PostgreSQL فعلي على DB جديدة وإعادة التطبيق على DB موجودة مع حفظ البيانات | نقل Production الفعلي |
| Backup/restore | نسخة SQLite، SHA-256، restore، integrity وفحص الصفوف وعدم وجود direct URL دائم | Disaster Recovery للبنية المستضافة |
| Load | حمل اصطناعي bounded على بناء Playback Plans | سعة الشبكة أو قاعدة Production |
| Soak | تكرار طويل bounded للـscoring وسياسات الفشل مع حد للذاكرة | تشغيل Production لساعات أو أيام |

تشغيل المجموعة كاملة:

```bash
npm run gate:golden
```

تُكتب النتائج في `artifacts/golden-gates/report.json` و`report.md`، إضافة إلى stdout/stderr منفصلين لكل بوابة، ويرفعها CI كـartifact لمدة 14 يومًا. كل subprocess له مهلة افتراضية 60 ثانية، والـCI job كله محدود بثماني دقائق. تمر بوابة Migration على PostgreSQL 16 محلي ومعزول داخل CI، وترفض أداة الـdrill أي عنوان قاعدة بيانات غير loopback كي لا تمس staging أو production عرضًا.

## الفصل عن الاختبارات الحية

CI الأساسي لا يتصل بالمصادر الخارجية ولا يدّعي `PLAYBACK_VERIFIED`. التقرير يضع claims صريحة لا يمكن فهمها كموافقة إصدار:

```json
{
  "claims": {
    "live_provider_matrix_passed": false,
    "production_configuration_reviewed": false,
    "production_backup_restore_passed": false,
    "golden_release_approved": false
  }
}
```

اختبارات التشغيل الحية تبقى Workflow منفصلة يدوية في بيئة مصرح بها. تُنتج `artifacts/live-playback/report.json` ثم تمر على `npm run gate:live-matrix`. لا ينجح العقد إلا بوجود Lucky E1–E7 كاملة، mapping صحيح، attempts مصنفة، selected fallback، وواحد من:

- Direct source يطابق محاولة ناجحة وتم إثبات `sampled_bytes > 0` له.
- Embed وصل فعلًا إلى `playing` و`currentTime >= 2`.

صفحة Embed متاحة أو HTTP 200 وحدهما يفشلان البوابة عمدًا.

## Gate قبل الإصدار الذهبي

لا يُنشأ Golden tag إلا بعد:

1. نجاح `npm test` وكل Golden gates.
2. نجاح build للصور الثلاث: API وWorker وMigration.
3. تنفيذ Live Playback Matrix المنفصلة، نجاح validator الدلالي، وتوثيق commit والوقت والمنطقة والبيئة والنتيجة.
4. تنفيذ backup/restore drill على نسخة staging وببيانات غير حساسة.
5. مراجعة أمنية وProduction configuration وعدم وجود أسرار داخل Git.
6. مراجعة التقرير البشري وعدم الاعتماد على شارة CI وحدها.

## ما يبقى يدويًا ولا تختصره CI

- ربط تقرير E1–E7 بنفس commit المرشح للإصدار وعدم إعادة استخدام artifact قديم.
- Staging restore باستخدام آلية النسخ الفعلية للمضيف، لا ملف SQLite المحلي فقط.
- Load/soak في staging بميزانية وتزامن يمثلان الحمل المتوقع؛ الـharness المحلي bounded يكشف regressions فقط.
- مراجعة إعدادات الأسرار، النطاق، TLS، rate limits والتنبيهات قبل إنشاء tag.
- توقيع موافقة بشرية نهائية. نجاح `gate:golden` لا يغيّر `golden_release_approved` إلى true تلقائيًا.
