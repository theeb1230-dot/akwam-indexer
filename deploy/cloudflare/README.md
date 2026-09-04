# Cloudflare Workers Free failover router

هذا الـWorker مدخل خفيف فقط لعقد الـAPI. لا يشغّل Theeb Engine ولا Chromium ولا يمرر `/play/*`.

المتغيرات المطلوبة:
- `PRIMARY_API_ORIGIN`: عنوان Koyeb Free.
- `STANDBY_API_ORIGIN`: عنوان Oracle Always Free API.

السلوك:
1. يرسل الطلب إلى Koyeb.
2. إذا حدث network failure أو أعاد الأصل 5xx، يجرب Oracle.
3. لا يعمل كـmedia proxy.
4. يجب إبقاؤه على Workers Free plan فقط.

راجع `docs/ZERO_COST_HOSTING_AR.md` قبل النشر.
