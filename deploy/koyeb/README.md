# Koyeb Free deployment

هذا المجلد يوثق دور Koyeb المجاني فقط. لا يحتوي إعدادًا يطلب خطة مدفوعة.

- Runtime role: `api`
- Container target: `api`
- Required policy: `THEEB_ZERO_COST_ONLY=true`
- Deployment target: `THEEB_DEPLOYMENT_TARGET=koyeb-free`
- Database: shared PostgreSQL free plan through `DATABASE_URL`
- Do not run Chromium, health-worker, or refresh-worker on the 512 MB free instance.

يجب ضبط limits من لوحة Koyeb على Free Instance فقط وعدم الترقية تلقائيًا.
