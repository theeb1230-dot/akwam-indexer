# Roadmap

> بوابات الإصدار الذهبي الحتمية موثقة في [GOLDEN_RELEASE_GATES.md](./GOLDEN_RELEASE_GATES.md). نجاح البوابات غير الحية لا يُعد إثباتًا لتشغيل المصادر الخارجية.

## المرحلة السادسة — PostgreSQL Migration

- مخطط PostgreSQL مبدئي بدون تخزين Direct URLs المؤقتة.
- Migration runner بإصدارات مرتبة.
- TLS مفعل افتراضيًا.
- Job Repository يستخدم `FOR UPDATE SKIP LOCKED`.
- مكتمل: Canonical persistence/read، Importer، Health scheduling/persistence، Refresh scheduling/workers/API، Library/V1 reads، Playback sessions/health، وDownload resolver persistence تعمل عبر Repository contracts ثنائية SQLite/PostgreSQL.
- مكتمل: أداة نقل SQLite→PostgreSQL ومخططات migrations المرتبة، مع منع تخزين Direct URLs المؤقتة.
- مكتمل بالدليل: بوابة CI تمنع SQLite leakage خارج Repository boundaries، واختبار PostgreSQL runtime E2E يعمل على قاعدة مشتركة داخل Golden Gates ويغطي jobs + importer + refresh + download + v1 reads.
- الحالة: `POSTGRES_RUNTIME_PARITY=verified` أصبحت مبررة داخل قوالب النشر، بدون ادعاء نجاح أي نشر خارجي.

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

- Web/PWA «ذيب العرب»: مكتمل أساس البحث، تفاصيل السلاسل والحلقات، الفصل الصريح بين المشاهدة والتحميل، installability على الويب/iOS، والـoffline shell.
- هوية Web/PWA أصبحت موحدة عبر brand contract باسم «ذيب العرب» وثيم ثابت، واختبار المتصفح الفعلي مغطى داخل CI عبر Chromium.
- المتبقي قبل إعلان Web/PWA مكتملة: تنفيذ نشر مجاني خارجي فعلي وإثباته عبر smoke HTTPS. حزمة الاستعداد والعقد التوثيقي موجودان، لكن الحساب/الاعتمادات الخارجية غير متاحة من داخل المستودع.
- Android: بناء APK debug ورفعه كـartifact مثبت فعليًا في CI. التطبيق يغطي الآن البحث → تفاصيل المسلسل → الحلقات → اختيار مشاهدة أو تحميل صريح، بدون autoplay أو automatic download.
- Android TV: بوابة CI المخصصة نجحت فعليًا وتنتج APK debug مستقلًا بتهيئة Leanback وعدم اشتراط اللمس، مع تمرير `android_tv` في playback contract.
- iOS: أضيف مسار CI على macOS لبناء تطبيق Flutter بدون توقيع وتغليفه كـIPA unsigned، مع تمرير `ios` في playback contract. لا يُدّعى أنه قابل للتثبيت على جهاز فعلي قبل التوقيع.
- تحديث/توسيع اختبارات Fixtures المحلية بحيث تغطي دورة API→Job→Worker→Repository بدون الاعتماد على المواقع الحية.
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
