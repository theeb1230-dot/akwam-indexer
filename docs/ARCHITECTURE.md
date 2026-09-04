# Architecture

## التدفق العام

تطبيق العميل يرسل البحث إلى Theeb Engine. يجمع Search Orchestrator نتائج المصادر، يطبّع العناوين ويجمع الأعمال المتطابقة. يحل Series Resolver المواسم والحلقات، ثم يحل Episode Resolver خيارات الحلقة القابلة للتشغيل.

## النهج المعتمد

ذيب يبقى Modular Monolith داخل Repository وصورة Container واحدة. يمكن تشغيل الصورة حسب دور محدد عبر `THEEB_ROLE` بدل نسخ المنطق بين خدمات مستقلة.

الأدوار المستهدفة:

- `api`: واجهة HTTP العامة.
- `health-worker`: فحوص الصحة وChromium.
- `refresh-worker`: تحديث المكتبة واكتشاف الحلقات.
- `playback-worker`: مهام الحل والتحقق الثقيلة.
- `all`: توافق محلي خلال المرحلة الانتقالية.

حاليًا `api` و`all` و`refresh-worker` و`health-worker` منفذة. تعتمد الـWorkers على Queue دائمة وLease وHeartbeat واستعادة بعد الانقطاع. Health Worker يميز الوصول عن التشغيل المثبت ويستخدم Chromium للـEmbed. يبقى `playback-worker` مغلقًا حتى يكتمل عقده؛ لا نعلن خدمة وهمية على أنها جاهزة.

## التوزيع المستهدف — Zero Cost Multi-Host

السياسة الحاكمة حاليًا: لا مورد مدفوع ولا خدمة تسمح بتجاوز مجاني تلقائيًا.

- **Koyeb Free**: مرشح للـPublic API الخفيف.
- **Oracle Cloud Always Free**: Health/Refresh workers والمهام الثقيلة وChromium، مع إمكانية توزيع الأدوار على أكثر من VM مجانية.
- **Neon Free PostgreSQL**: مصدر الحقيقة المشترك بين الاستضافات عندما تلائم حصته حجم المشروع.
- **GitHub Actions**: CI والبوابات والاختبارات المجدولة، وليس قاعدة بيانات أو API دائم.
- Cloud Run ليس المسار الافتراضي لأن تجاوز Free Tier قد ينتج تكلفة، وهو مخالف لسياسة المشروع الحالية.

تبقى الصورة البرمجية واحدة، وتوزع الأدوار عبر `THEEB_ROLE`. فشل استضافة واحدة لا يجب أن يفرض نقل الكود أو تغيير Provider logic.

راجع [ADR-001](ADR-001-DISTRIBUTED-RUNTIME.md) و[ZERO_COST_HOSTING_AR.md](ZERO_COST_HOSTING_AR.md).

ترحيل قاعدة الإنتاج موثق في [ADR-002](ADR-002-POSTGRESQL-MIGRATION.md). وجود `DATABASE_URL` وحده لا يعني اكتمال الترحيل؛ كل Repository يجب أن يجتاز اختبارات التكافؤ قبل تفعيل PostgreSQL في Runtime.

## الطبقات

1. **Routes:** التحقق الأولي من الطلب وتحويله إلى الخدمة المناسبة.
2. **Services:** البحث، التجميع، الحل، الاستيراد وإدارة المهام.
3. **Provider Registry:** تسجيل المصادر والتحقق من واجهتها واكتشاف قدراتها.
4. **Providers:** تفاصيل HTML والروابط الخاصة بكل مصدر.
5. **Database:** تخزين المكتبة والربط بين الكيانات الموحدة ومعرفات المصادر.
6. **Playback:** حل الرابط وقت الطلب وتمريره بطريقة مناسبة للعميل.

## عقد Provider

يجب أن يقدم كل Provider:

- `getSeries(id)`
- `getEpisode(id)`

والقدرات الاختيارية:

- `search(query)`
- `getWatchInfo(watchId, episodeId)`

تعطل Provider واحد يجب ألا يؤدي إلى انهيار البحث في بقية المصادر.

## البيانات التشغيلية

SQLite والملفات المؤقتة داخل `data/` مخصصة للتطوير المحلي. لا يجوز اعتبار قرص Cloud Run تخزينًا دائمًا. الانتقال إلى PostgreSQL يتطلب Repository interfaces وMigrations واختبارات Fresh/Existing DB قبل تفعيل التوزيع الإنتاجي.
