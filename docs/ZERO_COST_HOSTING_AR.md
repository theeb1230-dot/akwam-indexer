# الاستضافة الصفرية متعددة المنصات — Theeb Engine

## القاعدة الحاكمة

المشروع غير ربحي حاليًا، والميزانية المستهدفة للاستضافة هي **0 ريال**. القرار المعماري هو توزيع الأدوار على أكثر من مزود مجاني لتقليل أثر نوم خدمة أو سقوط عقدة أو بلوغ حصة مجانية. لا توجد ترقية مدفوعة تلقائية، ولا autoscaling مدفوع، ولا مورد يفترض أن المالك سيدفع لاحقًا.

## التوزيع المعتمد

### Cloudflare Workers Free — المدخل الخفيف والـfailover
- يستخدم فقط كـAPI router خفيف، وليس لتشغيل Node/Chromium أو تمرير الفيديو.
- الخطة المجانية الحالية تسمح حتى 100,000 طلب يوميًا و10ms CPU لكل invocation.
- يوجه الطلبات العادية إلى Koyeb، وعند فشل الشبكة/5xx يمكنه تجربة Oracle API الاحتياطية.
- مسارات الوسائط مثل `/play` لا تمر عبره.

### Koyeb Free — Public API الأساسي
- يشغل صورة `api` فقط مع `THEEB_ROLE=api`.
- Free Instance الحالية: 512MB RAM و0.1 vCPU و2GB SSD، ومسموح instance مجاني واحد لكل organization.
- تنام بعد ساعة بلا traffic، لذلك لا نعتمد عليها وحدها.
- لا Chromium، لا health worker، لا تخزين دائم.

### Oracle Cloud Always Free — API احتياطي + Workers
- نستخدم موارد Always Free فقط.
- الحد الحالي الموثق لـAmpere A1 في Free tenancy هو إجمالي 2 OCPU و12GB RAM، ويمكن تقسيمه على VM واحدة أو اثنتين ضمن حدود التخزين.
- على Oracle نشغّل API احتياطيًا خفيفًا إضافة إلى `health-worker` و`refresh-worker`.
- Chromium يبقى هنا لأن Koyeb Free صغير جدًا لهذا الحمل.
- إذا لم تتوفر سعة A1 في المنطقة، لا نتحول تلقائيًا إلى shape مدفوع.

### Neon Free — PostgreSQL المشتركة
- قاعدة مشتركة بين Koyeb وOracle.
- Free plan الحالية توفر 0.5GB storage لكل project و50 CU-hours شهريًا لكل project مع scale-to-zero.
- لا نخزن Direct URLs المؤقتة.
- عند الاقتراب من الحد نقلل retention/telemetry ووتيرة jobs بدل شراء سعة.
- قاعدة البيانات تبقى نقطة اعتماد مشتركة؛ لذلك النسخ الاحتياطي مهم.

### GitHub Actions — CI وGolden Gates والنسخ المنطقي
- المستودع عام، واستخدام standard GitHub-hosted runners للمستودعات العامة مجاني.
- يستخدم للاختبارات والـrelease gates والـpg_dump المجدول عند إعداد secret قاعدة البيانات.
- لا يستخدم كـserver دائم.

## لماذا هذا التوزيع؟

```text
Client
  |
Cloudflare Worker Free
  |-----------------------|
  v                       v
Koyeb Free API       Oracle Always Free API (standby)
  |                       |
  +-----------+-----------+
              |
          Neon Free
          PostgreSQL
              |
      +-------+-------+
      |               |
Oracle Health     Oracle Refresh
Worker            Worker
```

سقوط Koyeb لا يعني سقوط API بالكامل. سقوط Oracle لا يمنع Koyeb من خدمة الطلبات الخفيفة. نوم Neon أو بلوغ حصتها سيؤثر على العقدتين، لذلك نحتفظ بنسخ منطقية ونفشل بوضوح بدل إنشاء فاتورة.

## ممنوع افتراضيًا

- أي autoscaling مدفوع.
- أي instance أو disk غير موسوم Free/Always Free.
- Cloud Run كمسار افتراضي في مرحلة الصفر تكلفة.
- Render Postgres كقاعدة دائمة مؤقتة.
- ترقية تلقائية عند نفاد الحصة.
- Proxy للفيديو عبر Cloudflare Worker.
- افتراض أن Free Tier ثابت للأبد؛ الحدود تُراجع قبل أي نشر جديد.

## متغيرات البيئة

```
THEEB_ZERO_COST_ONLY=true
THEEB_DEPLOYMENT_TARGET=koyeb-free
THEEB_ROLE=api
```

القيم المقبولة في validator:
- `cloudflare-workers-free`
- `oracle-always-free`
- `koyeb-free`
- `neon-free`
- `github-actions`
- `local`

## سياسة نفاد الحصة

1. تخفيض health/refresh frequency.
2. إيقاف telemetry غير الضرورية.
3. السماح للـAPI المجاني بالنوم.
4. توجيه control-plane API إلى العقدة المجانية الأخرى.
5. عدم إنشاء مورد مدفوع تلقائيًا.
6. إذا لم توجد سعة مجانية: نقبل التوقف المؤقت بدل فاتورة.

## شرط الإنتاج الحقيقي

التوزيع بين عدة استضافات لا يصبح صحيحًا إلا بعد اكتمال PostgreSQL repository parity. SQLite محلية على عقد متعددة تعني قواعد حقيقة مختلفة، لذلك validator يبقى fail-closed حتى `POSTGRES_RUNTIME_PARITY=verified`.
