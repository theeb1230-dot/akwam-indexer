# Roadmap

> بوابات الإصدار الذهبي الحتمية موثقة في [GOLDEN_RELEASE_GATES.md](./GOLDEN_RELEASE_GATES.md). نجاح البوابات غير الحية لا يُعد إثباتًا لتشغيل المصادر الخارجية.

## المرحلة السادسة — PostgreSQL Migration

- مخطط PostgreSQL مبدئي بدون تخزين Direct URLs المؤقتة.
- Migration runner بإصدارات مرتبة.
- TLS مفعل افتراضيًا.
- Job Repository يستخدم `FOR UPDATE SKIP LOCKED`.
- مكتمل: Canonical persistence/read، Importer، Health scheduling/persistence، Refresh scheduling/workers/API، Library/V1 reads، Playback sessions/health، وDownload resolver persistence تعمل عبر Repository contracts ثنائية SQLite/PostgreSQL.
- مكتمل: أداة نقل SQLite→PostgreSQL ومخططات migrations المرتبة، مع منع تخزين Direct URLs المؤقتة.
- المتبقي قبل إعلان `POSTGRES_RUNTIME_PARITY=verified`: بوابة CI تمنع أي SQLite leakage جديد، ثم اختبار PostgreSQL runtime E2E حقيقي يغطي API + workers + importer + refresh + download على قاعدة مشتركة.

## المرحلة الخامسة — Background Health & Refresh

- Queue دائمة بدل الذاكرة المحلية.
- ملكية Job عبر Lease وHeartbeat.
- استعادة آمنة بعد انتهاء Lease.
- Refresh Worker مستقل مع Retry وBackoff.
- فصل API enqueue عن Worker execution عبر `THEEB_ROLE`.
- Health Worker وTTL scheduling والتحقق عبر Chromium منفذة.
- اكتشاف الحلقات الجديدة وتعطيل Provider source المختفي دون حذف Canonical Episode.
- Cooperative cancellation وstale-series scheduling منفذان.

## أولوية قريبة

- تثبيت PostgreSQL runtime parity عبر leakage guard ثم E2E gate حقيقي قبل تفعيل `POSTGRES_RUNTIME_PARITY=verified`.
- تحديث/توسيع اختبارات Fixtures المحلية بحيث تغطي دورة API→Job→Worker→Repository بدون الاعتماد على المواقع الحية.
- بعد إثبات parity، بدء Web/PWA وهوية «ذيب العرب» على عقد `/api/v1` الموحد.
- توحيد أخطاء Providers والمهلات وإلغاء الطلبات.
- ترتيب خيارات التشغيل حسب الصحة والجودة والمنطقة.
- Fallback تلقائي وآمن بين المصادر.
- فصل إنشاء التطبيق عن `listen()` لتسهيل اختبارات HTTP.
- إضافة التسجيل المنظم ومراقبة الصحة.

## سياسة الاستضافة الصفرية

- الميزانية التشغيلية الحالية: 0 ريال.
- تقسيم الأدوار بين استضافات مجانية لزيادة الاستقرار.
- Koyeb Free للـAPI، Oracle Always Free للـWorkers، PostgreSQL مجانية مشتركة، GitHub Actions للبوابات.
- لا autoscaling مدفوع ولا ترقية تلقائية عند نفاد الحصة.
- Cloud Run ليس الافتراضي في هذه المرحلة.

## قبل الإنتاج

- مصادقة وحدود معدل للـAPI.
- تحقق صارم من عناوين URL ومنع SSRF وDNS rebinding.
- سياسة CORS واضحة.
- تخزين أسرار خارج المستودع.
- قاعدة بيانات إنتاجية ونسخ احتياطية.
- نشر على بيئة ذات عنوان ثابت عند حاجة المصادر المصرح بها.
- مراجعة قانونية واتفاقات واضحة مع المصادر.
