# Theeb Golden Release Gates

هذه البوابات هي الحد الأدنى الآلي قبل ترشيح إصدار ذيب كنسخة ذهبية. نجاحها لا يعني وحده أن الإصدار Production-ready، ولا يثبت أن مواقع الطرف الثالث أو تشغيل الفيديو الحي يعملان الآن.

## البوابات الحتمية داخل CI

| البوابة | ما تثبته | ما لا تثبته |
|---|---|---|
| Regression | ثبات ربط الحلقات، منع false merge، وتصنيف الفشل | صحة بيانات المواقع الحالية |
| Security | مصفوفة SSRF، منع البروتوكولات والاعتمادات الخطرة، وعدم تعطيل TLS | اختبار اختراق خارجي كامل |
| Provider contract | سلامة Registry وصدق capabilities القابلة للاستدعاء | نجاح scraping حي لكل Provider |
| Migration | وجود القيود المطلوبة، عدم تخزين direct URL، وتحويل آمن parameterized | نقل Production فعلي إلى PostgreSQL |
| Backup/restore | إنشاء نسخة SQLite واستعادتها وفحص integrity والصفوف | خطة Disaster Recovery للبنية المستضافة |
| Load | حمل اصطناعي bounded على بناء Playback Plans | سعة الشبكة أو قاعدة Production |
| Soak | تكرار طويل bounded للـscoring وسياسات الفشل مع حد للذاكرة | تشغيل Production لساعات أو أيام |

تشغيل المجموعة كاملة:

```bash
npm run gate:golden
```

تُكتب النتائج في `artifacts/golden-gates/report.json` و`report.md`، ويرفعها CI كـartifact لمدة 14 يومًا. كل subprocess له مهلة افتراضية 60 ثانية، والـCI job كله محدود بثماني دقائق.

## الفصل عن الاختبارات الحية

CI الأساسي لا يتصل بالمصادر الخارجية ولا يدّعي `PLAYBACK_VERIFIED`. التقرير يضع صراحة:

```json
{
  "offline_only": true,
  "live_playback_verified": false
}
```

اختبارات التشغيل الحية تبقى بوابة منفصلة يدوية/مجدولة في بيئة مصرح بها. لا تُحوّل نتيجة HTTP 200 أو صفحة Embed متاحة إلى إثبات تشغيل فيديو.

## Gate قبل الإصدار الذهبي

لا يُنشأ Golden tag إلا بعد:

1. نجاح `npm test` وكل Golden gates.
2. نجاح build للصور الثلاث: API وWorker وMigration.
3. تنفيذ Live Playback Matrix منفصلة وتوثيق تاريخها وبيئتها ونتيجتها، عند طلب إصدار يدعي التشغيل الحي.
4. تنفيذ backup/restore drill على نسخة staging وببيانات غير حساسة.
5. مراجعة أمنية وProduction configuration وعدم وجود أسرار داخل Git.
6. مراجعة التقرير البشري وعدم الاعتماد على شارة CI وحدها.
