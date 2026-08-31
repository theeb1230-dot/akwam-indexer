# Roadmap

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

- إضافة اختبارات وحدات أوسع للتطبيع والتجميع ودرجات المطابقة.
- اختبارات تكامل تعتمد على Fixtures محلية بدل المواقع الحية.
- إكمال قاعدة البيانات Canonical وربطها الكامل بالـResolvers.
- توحيد أخطاء Providers والمهلات وإلغاء الطلبات.
- ترتيب خيارات التشغيل حسب الصحة والجودة والمنطقة.
- Fallback تلقائي وآمن بين المصادر.
- فصل إنشاء التطبيق عن `listen()` لتسهيل اختبارات HTTP.
- إضافة التسجيل المنظم ومراقبة الصحة.

## قبل الإنتاج

- مصادقة وحدود معدل للـAPI.
- تحقق صارم من عناوين URL ومنع SSRF وDNS rebinding.
- سياسة CORS واضحة.
- تخزين أسرار خارج المستودع.
- قاعدة بيانات إنتاجية ونسخ احتياطية.
- نشر على بيئة ذات عنوان ثابت عند حاجة المصادر المصرح بها.
- مراجعة قانونية واتفاقات واضحة مع المصادر.
