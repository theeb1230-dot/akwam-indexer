# Roadmap

> بوابات الإصدار الذهبي الحتمية موثقة في [GOLDEN_RELEASE_GATES.md](./GOLDEN_RELEASE_GATES.md). نجاح البوابات غير الحية لا يُعد إثباتًا لتشغيل المصادر الخارجية.

## المرحلة السادسة — PostgreSQL Migration

- مخطط PostgreSQL مبدئي بدون تخزين Direct URLs المؤقتة.
- Migration runner بإصدارات مرتبة.
- TLS مفعل افتراضيًا.
- Job Repository يستخدم `FOR UPDATE SKIP LOCKED`.
- Canonical persistence اجتاز repository parity وأصبح driver-aware.
- Playback health وplayback verification اجتازا repository parity وأصبحا مشتركين بين الـworkers.
- المتبقي قبل إعلان `POSTGRES_RUNTIME_PARITY=verified`: legacy Import/Library/Refresh persistence وepisode health scheduling، ثم اختبار runtime end-to-end على PostgreSQL.
- أداة نقل SQLite → PostgreSQL موجودة، لكن اكتمال النقل التشغيلي يبقى مشروطًا بعدم وجود مسارات Runtime تقرأ SQLite المحلية عند اختيار PostgreSQL.

## المرحلة الخامسة — Background Health & Refresh

- Queue دائمة بدل الذاكرة المحلية.
- ملكية Job عبر Lease وHeartbeat.
- استعادة آمنة بعد انتهاء Lease.
- Refresh Worker مستقل مع Retry وBackoff.
- فصل API enqueue عن Worker execution عبر `THEEB_ROLE`.
- Health Worker وTTL scheduling والتحقق عبر Chromium منفذة.
- اكتشاف الحلقات الجديدة وتعطيل Provider source المختفي دون حذف Canonical Episode.
- Cooperative cancellation وstale-series scheduling منفذان.
- ملاحظة parity: منطق jobs موزع على PostgreSQL، لكن بعض قراءات/كتابات refresh/library القديمة ما زالت مرتبطة بـSQLite حتى اكتمال الشريحة التالية.

## أولوية قريبة

1. نقل Import/Library/Refresh persistence خلف Repository ثنائي driver، ومنع أي تحميل ضمني لـSQLite عندما يكون `DATABASE_DRIVER=postgres`.
2. نقل episode health scheduling إلى PostgreSQL وإضافة اختبار multi-worker parity.
3. تشغيل gate صريح يثبت PostgreSQL runtime end-to-end قبل السماح بالقيمة `POSTGRES_RUNTIME_PARITY=verified`.
4. بعد إغلاق parity: بدء نسخة Web/PWA باسم «ذيب العرب» فوق API الموحد، مع فصل المشاهدة والتحميل.
5. إضافة اختبارات وحدات أوسع للتطبيع والتجميع ودرجات المطابقة.
6. اختبارات تكامل تعتمد على Fixtures محلية بدل المواقع الحية.
7. توحيد أخطاء Providers والمهلات وإلغاء الطلبات.
8. ترتيب خيارات التشغيل حسب الصحة والجودة والمنطقة.
9. Fallback تلقائي وآمن بين المصادر.
10. فصل إنشاء التطبيق عن `listen()` لتسهيل اختبارات HTTP.
11. إضافة التسجيل المنظم ومراقبة الصحة.

## سياسة الاستضافة الصفرية

- الميزانية التشغيلية الحالية: 0 ريال.
- تقسيم الأدوار بين استضافات مجانية لزيادة الاستقرار.
- Koyeb Free للـAPI، Oracle Always Free للـWorkers، PostgreSQL مجانية مشتركة، GitHub Actions للبوابات.
- لا autoscaling مدفوع ولا ترقية تلقائية عند نفاد الحصة.
- Cloud Run ليس الافتراضي في هذه المرحلة.
- لا يُعلن أي نشر خارجي أو دومين أو subdomain ناجحًا من دون دليل فعلي.

## قبل الإنتاج

- مصادقة وحدود معدل للـAPI.
- تحقق صارم من عناوين URL ومنع SSRF وDNS rebinding.
- سياسة CORS واضحة.
- تخزين أسرار خارج المستودع.
- قاعدة بيانات إنتاجية ونسخ احتياطية.
- نشر على بيئة ذات عنوان ثابت عند حاجة المصادر المصرح بها.
- مراجعة قانونية واتفاقات واضحة مع المصادر.
