# Theeb deployment — Zero Cost Multi-Host

## السياسة

الهدف الحالي هو تشغيل المشروع بتكلفة **0**. لا تستخدم هذه الخطة موردًا مدفوعًا ولا تعتمد على تجاوز تلقائي لحصة مجانية.

## التوزيع الافتراضي

- **Koyeb Free**: `THEEB_ROLE=api`.
- **Oracle Cloud Always Free**: `health-worker` و`refresh-worker` والمهام الثقيلة.
- **Neon Free PostgreSQL**: قاعدة مشتركة بين العقد، عندما تكون حصتها كافية.
- **GitHub Actions**: CI والـGolden Gates والفحوص المجدولة.

راجع `ZERO_COST_HOSTING_AR.md` للتفاصيل والحدود.

## Cloud Run

ملفات `deploy/cloud-run/` محفوظة كمرجع تاريخي واختباري فقط وليست المسار الافتراضي. Cloud Run يملك Free Tier، لكن المشروع لا يعتمد عليه الآن لأن تجاوز الحصة قد ينتج تكلفة. تحت `THEEB_ZERO_COST_ONLY=true` يجب ألا يكون `THEEB_DEPLOYMENT_TARGET` مساويًا لأي هدف غير موجود في allow-list المجانية.

## Preflight

1. أكمل PostgreSQL repository parity.
2. استخدم Free Plan فقط في كل مزود.
3. اضبط `THEEB_ZERO_COST_ONLY=true`.
4. اضبط `THEEB_DEPLOYMENT_TARGET` على هدف مجاني معتمد.
5. لا تحفظ الأسرار في Git.
6. شغّل `npm test` و`npm run gate:golden`.
7. شغّل `npm run deploy:validate` داخل كل بيئة.

## ترتيب التشغيل

1. قاعدة PostgreSQL المجانية المشتركة.
2. API المجاني.
3. Health Worker على Oracle Always Free.
4. Refresh Worker على عقدة مجانية منفصلة إن أمكن.
5. اختبر `/livez` و`/readyz`.
6. اختبر استرجاع job بعد سقوط worker وانتهاء lease.

## الفشل والحصص

إذا اقتربت أي خدمة من حدها المجاني:
- خفّض health/refresh frequency.
- اسمح للخدمة غير الحرجة بالنوم.
- انقل الدور لعقدة مجانية أخرى.
- لا تقم بالترقية المدفوعة تلقائيًا.

## النسخ الاحتياطي

النسخ الاحتياطية تُحفظ خارج قرص الخدمة المؤقت وتتحقق بالـchecksum. لا تعتبر أي خطة مجانية بلا backup ضمانًا للبيانات؛ لذلك يجب الاحتفاظ بنسخة تصدير دورية ضمن مورد مجاني مستقل عند الإمكان.
