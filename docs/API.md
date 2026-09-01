# API

## Client API v1 (Flutter / TV / Web)

العقد الثابت للتطبيق موثّق في `contracts/openapi-v1.json`، ويوجد عميل Dart خفيف في
`clients/dart/lib/theeb_api_contract.dart`. العميل يعرف المحتوى الموحّد فقط؛ لا يعرف
Provider أو `watch_id` أو iframe أو رابط CDN.

- `GET /v1/search?q=...`
- `GET /v1/series/:id`
- `GET /v1/series/:id/episodes`
- `GET /v1/episodes/:id`
- `POST /v1/playback/sessions`
- `GET /v1/playback/sessions/:id`
- `POST /v1/playback/sessions/:id/feedback`
- `GET /v1/episodes/:id/download-options`

جلسة التشغيل تبدأ بـ`planning`، ولا تصبح `ready` لمجرد وجود مرشح أو استجابة HTTP 200.
التغذية الراجعة تقبل أحداثًا محددة وقابلة لإعادة الإرسال بأمان عبر `event_id`.
تفاصيلها ذات حقول محصورة وحجم ومعدل محدودين، وتُعامل ساعة العميل كمدخل غير موثوق؛
أي وقت يبتعد أكثر من خمس دقائق يُطبّع إلى وقت الاستلام في الخادم.
خيارات التحميل منفصلة تمامًا عن جلسة المشاهدة، ولا يبدأ التحميل بمجرد عرض الخيارات.

مسارات `/api/*` الحالية باقية خلال فترة الانتقال لضمان التوافق الخلفي، لكنها ليست عقد
التطبيق طويل الأجل.

## Background jobs

- `GET /api/import/jobs` — list durable jobs.
- `GET /api/import/jobs/:jobId` — inspect progress, lease and result.
- `POST /api/import/jobs/:jobId/cancel` — request cooperative cancellation.

Queued jobs cancel immediately. Running import/refresh/health jobs observe the cancellation flag at safe boundaries and retain a terminal `cancelled` record.

جميع الاستجابات بصيغة JSON ما عدا مسار التشغيل الذي يعيد أو يمرر الوسائط.

## الحالة والمصادر

- `GET /`: معلومات الإصدار والحالة وروابط المسارات.
- `GET /api/providers`: أسماء المصادر المسجلة.
- `GET /api/providers/details`: القدرات المعلنة لكل مصدر.
- `GET /api/providers/:provider/series/:id`: بيانات مسلسل من مصدر محدد.
- `GET /api/providers/:provider/episode/:id`: بيانات حلقة من مصدر محدد.
- `GET /api/providers/:provider/watch/:watchId/:episodeId`: معلومات المشاهدة عند دعمها.

## البحث والحل

- `GET /api/search?q=QUERY`: بحث موحّد في المصادر القابلة للبحث.
- `GET /api/resolve?q=QUERY&group_key=KEY`: حل مجموعة مسلسل عبر مصادرها.
- `GET /api/resolve/episode?q=QUERY&season=1&episode=1`: حل خيارات حلقة محددة.

## الاستيراد والمهام

- `POST /api/import/:provider/:seriesId`
- `POST /api/import/:provider` مع `series_id` في JSON أو query.
- `GET /api/import/jobs`
- `GET /api/import/jobs/:jobId`

طلب الاستيراد المقبول يعيد `202 Accepted`. تكرار استيراد جارٍ لنفس المصدر والمسلسل يعيد `409 Conflict`.

## المكتبة

- `GET /api/library/series`
- `GET /api/library/search?q=QUERY`
- `GET /api/library/stats`
- `POST /api/library/series/:id/refresh`
- `POST /api/library/refresh-all`

## التشغيل

`GET /play/:provider/:watchId/:episodeId?quality=720p`

يحل المصدر عند الطلب ويدعم طلبات Range عندما يسمح المصدر بذلك. لا تعتمد على بقاء الرابط الخارجي المباشر صالحًا.

## أخطاء شائعة

| الرمز | المعنى |
|---|---|
| `400` | مدخل مطلوب مفقود أو مصدر غير معروف |
| `404` | مسار أو مهمة أو مصدر غير موجود |
| `409` | توجد مهمة استيراد مماثلة قيد التنفيذ |
| `500` | فشل المصدر أو المعالجة الداخلية |
| `501` | المصدر لا يدعم قدرة المشاهدة |


## Canonical API

- `GET /api/canonical/series`
- `GET /api/canonical/series/:id/episodes`
- `GET /api/canonical/episodes/:id/playback`

يقوم Series Resolver بمزامنة الأعمال والحلقات مع قاعدة Canonical، ويقوم Episode Resolver بحفظ معرفات مرشحي التشغيل وترتيب Fallback دون تخزين روابط Direct المؤقتة.


## Live Playback Execution

`GET /api/playback/execute?q=Lucky&group_key=series:lucky&season=1&episode=1`

ينفذ الخطة فعلًا بالترتيب الديناميكي، ويتجاوز Circuit Open، ويطبق Retry Policy ويسجل كل محاولة. التحقق من Direct يعني قراءة Media bytes عبر Range. التحقق من Embed يعني وصول صفحة التضمين فقط؛ نجاح تشغيل الفيديو داخل WebView يحتاج لاحقًا Telemetry من تطبيق ذيب.
