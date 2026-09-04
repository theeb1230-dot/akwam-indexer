# الاستضافة الصفرية متعددة المنصات — Theeb Engine

## القاعدة الحاكمة

المشروع غير ربحي حاليًا، والميزانية المستهدفة للاستضافة هي **0 ريال**. لذلك لا يعتمد التصميم على خدمات قد تتحول إلى فاتورة تلقائيًا عند تجاوز حصة مجانية.

القيمة من التوزيع هنا هي زيادة الاستقرار ضمن الموارد المجانية، وليس بناء بنية Enterprise مدفوعة.

## التوزيع المقترح

### 1. Koyeb Free — Public API
- يشغل `THEEB_ROLE=api`.
- مناسب للطلبات القصيرة والـstateless.
- لا يشغل Chromium أو jobs طويلة.
- إذا وصلت الحصة المجانية أو تغيرت سياسة المزود، يتم إيقافه بدل الترقية المدفوعة.

### 2. Oracle Cloud Always Free — Workers
- A1 أو الموارد المؤهلة لـAlways Free فقط.
- `health-worker` للـChromium والتحقق.
- `refresh-worker` للتحديث والفهرسة.
- يمكن فصل الأدوار على VMs مجانية مختلفة لتقليل أثر سقوط عقدة واحدة.

### 3. Neon Free — PostgreSQL مشتركة
- قاعدة PostgreSQL خارجية مشتركة بين API والWorkers.
- لا تخزن Direct URLs المؤقتة.
- التطبيق يجب أن يتحمل scale-to-zero أو انقطاع القاعدة المؤقت.
- عند الاقتراب من حدود Free Plan، تقلل البيانات/الاحتفاظ بدل الترقية المدفوعة.

### 4. GitHub Actions — CI وRelease Gates
- Unit / integration / contract / golden gates.
- يمكن استخدامها لفحوص دورية محدودة.
- ليست بديلًا عن worker دائم أو database.

## ممنوع افتراضيًا

- أي autoscaling مدفوع.
- أي instance أو disk غير موسوم Free/Always Free.
- Cloud Run كمسار افتراضي في مرحلة الصفر تكلفة.
- Render Postgres كقاعدة دائمة لأن الخطة المجانية مؤقتة.
- ترقية تلقائية عند نفاد الحصة.
- إضافة بطاقة/خطة مدفوعة فقط لتجاوز limit تشغيلي.

## مبدأ الفشل

عند نفاد حصة مجانية:
1. نقل الحمل إلى عقدة مجانية أخرى إن أمكن.
2. تخفيض معدل refresh/health.
3. السماح للخدمة غير الحرجة بالنوم.
4. عدم فتح مسار مدفوع تلقائيًا.

## متغيرات البيئة

```
THEEB_ZERO_COST_ONLY=true
THEEB_DEPLOYMENT_TARGET=koyeb-free
THEEB_ROLE=api
```

القيم المسموحة تحت Zero Cost validation:
- `oracle-always-free`
- `koyeb-free`
- `neon-free`
- `github-actions`
- `local`

## ترتيب الأولويات

1. إكمال PostgreSQL repository parity.
2. تشغيل API على Koyeb Free.
3. تشغيل health-worker على Oracle Always Free.
4. تشغيل refresh-worker على Oracle Always Free مستقل إن أمكن.
5. ربط الجميع بPostgreSQL مجانية مشتركة.
6. اختبار سقوط كل عقدة واستعادة الـjobs عبر lease/heartbeat.
