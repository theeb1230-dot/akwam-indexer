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

## التوزيع المستهدف

- Cloud Run يشغّل Public API.
- Oracle A1 أو VM مصرح وثابت العنوان يشغّل Chromium والمهام الثقيلة.
- PostgreSQL يكون مصدر الحقيقة المشترك.
- PostgreSQL Queue/Locks أولًا؛ Redis يضاف فقط عند حاجة مقاسة.

راجع [ADR-001](ADR-001-DISTRIBUTED-RUNTIME.md).

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
