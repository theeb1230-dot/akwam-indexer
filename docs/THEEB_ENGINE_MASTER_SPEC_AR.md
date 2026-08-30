# الوثيقة الأم لمشروع Theeb Engine — ذيب

هذه الوثيقة هي المواصفات العليا الحاكمة للمشروع. ذيب Media Engine مستقل ومتعدد المصادر: يفهم العمل والحلقة، يبني Canonical data، يجمع المرشحين، يتحقق منهم، يرتبهم، وينفذ Fallback. تفاصيل المواقع تبقى داخل Provider Adapters ولا تتسرب إلى التطبيق.

## قواعد غير قابلة للتفاوض

1. لا Merge بلا CI أخضر واختبار قابل لإعادة التشغيل.
2. `HTTP 200` للـEmbed يعني `REACHABLE` فقط؛ لا يعني أن الفيديو يعمل.
3. `PLAYBACK_VERIFIED` يتطلب Media element وmetadata وcanplay وplaying وتقدم `currentTime > 2s`.
4. لا تعطيل TLS في مسار التشغيل، ولا فتح SSRF، ولا Open Proxy، ولا أسرار في Git، ولا تجاوز حماية طرف خارجي.
5. كل Redirect يعاد فحصه، مع حظر private IP وIPv4-mapped IPv6 وحماية DNS rebinding.
6. لا تُخزن Direct URLs المؤقتة كحقيقة دائمة؛ تخزن identifiers/locators اللازمة لإعادة الحل.
7. لا Special Case لـLucky. كل إصلاح يعالج نمطًا عامًا ويضيف Regression Test.
8. Flutter لا يحتوي Scrapers أو منطق Providers.
9. `watch_options` و`download_options` منفصلان، والمستخدم يختار المشاهدة أو التحميل.
10. False Canonical Merge أخطر من Duplicate.
11. لا Provider جديد قبل استقرار Core؛ CimaLight غير معتمد حاليًا.
12. كل PR محدود النطاق وله Definition of Done وأدلة Live عند الحاجة.

## الطبقات المستهدفة

- Domain Models للمحتوى والمرشحين والخطط والمحاولات والصحة والجلسات.
- Provider Adapters لكل تفاصيل المواقع.
- Resolution: Search, Series, Episode, Playback, Download.
- Execution: Executor, Retry, Fallback, Circuit Breaker, Health.
- Persistence عبر Data Access واضحة.
- HTTP للتحقق والاستدعاء والتسلسل فقط.
- Workers للصحة والتحديث والاكتشاف والتنظيف.
- Observability وConfiguration بلا Magic Numbers.

نبدأ Modular Monolith قويًا. PostgreSQL وRedis وQueues والتوزيع قرارات لاحقة مرتبطة بحاجة مثبتة.

## الصحة والفشل

حالات الصحة: `UNKNOWN`, `REACHABLE`, `PLAYBACK_VERIFIED`, `DEGRADED`, `TEMPORARILY_FAILED`, `BLOCKED`, `UNAVAILABLE`.

تصنيف الفشل المستهدف: `DNS_FAILURE`, `TLS_FAILURE`, `HTTP_401`, `HTTP_403`, `HTTP_404`, `HTTP_429`, `TIMEOUT`, `GEO_BLOCKED`, `SOURCE_EXPIRED`, `INVALID_MEDIA`, `EMPTY_SOURCE`, `EMBED_UNAVAILABLE`, `PLAYBACK_NOT_STARTED`, `PROVIDER_PARSE_ERROR`, `PROVIDER_SCHEMA_ERROR`, `CIRCUIT_OPEN`, `UNKNOWN`.

## مسار التنفيذ

- PR #3: Playback Verification & Provider Recovery.
- PR #4: Background Health & Refresh.
- PR #5: Download Resolver المنفصل.
- PR #6: Production Hardening.
- PR #7: Flutter Integration.
- PR #8: Production Deployment.

## بوابة النسخة الذهبية

Canonical search/series/episodes/mappings، Direct/HLS/verified Embed، fallback/retry/circuit/ranking، migrations/backups، TLS/SSRF/redirect/input/rate-limit gates، اختبارات unit/integration/contract/live/regression/load، واستضافة مستقرة مع HTTPS ومراقبة واستعادة، ثم تطبيق يدعم البحث والمشاهدة والتحميل المنفصل وسلوك TV/mobile.

لا نبرمج لننتهي بسرعة؛ نصل إلى أبسط تصميم صحيح وآمن وقابل للاختبار والتوسع، دون Overengineering.

كل تغيير يجيب بنعم: هل يخدم ذيب؟ هل في الطبقة الصحيحة؟ هل يعمل فعليًا؟ هل له Regression Test؟ هل يحافظ على الأمن؟ هل يجعل الخطوة التالية أسهل؟
