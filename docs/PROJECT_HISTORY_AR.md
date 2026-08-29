# akwam-indexer
Backend indexer and media catalog experiment
التقرير الشامل لمشروع Theeb Engine — ذيب

هذا التقرير يوثّق نقطة التوقف الحالية للمشروع بدقة، بحيث نستطيع الرجوع له لاحقًا ونستأنف العمل دون إعادة اكتشاف ما أنجزناه أو الخلط بين ما تم فعليًا وما يزال في مرحلة الخطة. سأفصل التقرير إلى قسمين كبيرين: الأول يوثّق كل ما تم إنجازه حتى الآن، والثاني يوضح رؤيتنا المستقبلية، وما تبقى، وما أُجّل عمدًا، والطريق الذي نريد أن يصل إليه ذيب في النهاية.

وأهم نقطة قبل كل شيء: حالة Git الحالية التي ظهرت عندك:

On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

تعني أن نسخة العمل الحالية محفوظة بالكامل في GitHub، ولا توجد تعديلات محلية غير محفوظة داخل Codespaces. بمعنى عملي: نقطة توقفنا اليوم أصبحت نقطة رجوع آمنة.

⸻

التقرير الأول: ما تم إنجازه حتى الآن

1. الفكرة الأساسية للمشروع

بدأ المشروع من فكرة أكبر من مجرد استخراج رابط فيديو من موقع معين.

الرؤية التي بنينا عليها Theeb Engine هي أن يكون ذيب طبقة مستقلة بين تطبيق المشاهدة وبين المواقع التي توفر المحتوى.

بدل أن يكون تطبيق ذيب مرتبطًا مباشرة بموقع مثل Akwam أو WeCima أو ArabSeed، أصبح التصميم كالتالي:

المستخدم / تطبيق ذيب
        ↓
    Theeb Engine
        ↓
طبقة البحث والتوحيد
        ↓
طبقة Providers
        ↓
Akwam / ArabSeed / WeCima / ...

وهذا القرار من أهم القرارات الهندسية التي أخذناها.

لأن الموقع الخارجي قد يغير الدومين، أو تصميم الصفحة، أو رابط المشغل، أو ترتيب السيرفرات، ولكن تطبيق ذيب نفسه لا يحتاج أن يعرف هذه التفاصيل. الذي يتغير فقط هو الـProvider المسؤول عن المصدر.

هذه النقطة حولت المشروع من كود Scraper بسيط إلى بداية محرك محتوى متعدد المصادر.

⸻

2. البيئة التقنية التي اعتمدناها

تم اعتماد:

* Node.js
* Express
* Axios
* Cheerio
* SQLite عبر better-sqlite3
* GitHub Codespaces
* GitHub لحفظ المشروع وإدارته.

المستودع الحالي:

theeb1230-dot/akwam-indexer

ومجلد المشروع داخل Codespaces:

/workspaces/akwam-indexer

المشروع أصبح يعمل كخادم API مستقل، وليس مجرد سكربت يتم تشغيله يدويًا.

⸻

3. الانتقال من مصدر واحد إلى بنية Multi-Provider

في البداية كان التركيز على Akwam.

ثم قررنا ألا نجعل المشروع:

Akwam Engine

بل:

Theeb Engine

بحيث يكون Akwam مجرد Provider من عدة Providers.

وصلنا حاليًا إلى وجود ثمانية Providers في النظام:

Provider	الحالة العامة
Akwam	متقدم جدًا
ArabSeed	البحث والمكتبة يعملان، التشغيل متوقف عند OKHD
WeCima	البحث والمكتبة + استخراج سيرفرات التشغيل
Shahid4u	البحث والمكتبة
LodyNet	البحث والمكتبة
Qask	البحث والمكتبة
CimaLeek	البحث والمكتبة
Laaroza	البحث والمكتبة

وبذلك أصبح المحرك لا يعتمد على مصدر واحد.

⸻

4. Provider Registry

تم إنشاء طبقة مركزية لإدارة جميع المصادر.

الـRegistry أصبح مسؤولًا عن معرفة:

* ما هي المصادر الموجودة.
* هل المصدر يدعم البحث.
* هل يدعم المسلسلات.
* هل يدعم الحلقات.
* هل يدعم معلومات المشاهدة.
* ما هي القدرات المتاحة لكل Provider.

وأصبحت المصادر تُسجل بشكل موحد داخل:

src/providers/index.js

وهذا مهم جدًا لأن الطبقات الأعلى في النظام لا تحتاج إلى معرفة تفاصيل كل موقع.

مثلًا محرك البحث لا يحتاج أن يعرف:

كيف يبحث Akwam؟

ولا:

كيف يبحث WeCima؟

هو فقط يقول:

provider.search(query)

وكل Provider ينفذ المهمة بطريقته.

⸻

5. البحث الموحد Multi-Provider Search

هذه واحدة من أكبر الخطوات التي أنجزناها.

أنشأنا محرك بحث يقوم بإرسال الاستعلام إلى جميع المصادر القادرة على البحث.

المسار الذي تم اختباره:

GET /api/search?q=Lucky

وفي اختبار Lucky عمل البحث على:

8 Providers

وكانت النتيجة:

searched_providers: 8
successful_providers: 8
failed_providers: 0

وهذه نقطة مهمة جدًا.

معناها أن جميع المصادر الثمانية استطاعت المشاركة في البحث بدون انهيار محرك البحث كله بسبب Provider واحد.

⸻

6. حل مشكلة اختلاف أسماء المحتوى

المشكلة التي ظهرت سريعًا هي أن نفس العمل لا يحمل دائمًا نفس الاسم في كل موقع.

مثال:

Lucky
Lucky مترجم
مسلسل Lucky مترجم
Lucky الحلقة...

وفي مصادر أخرى قد يظهر الاسم بالعربية بينما المستخدم يبحث بالإنجليزية أو العكس.

لذلك لم نعتمد مقارنة نصية بسيطة.

تم إنشاء منطق:

Normalization
+
Scoring
+
Canonical Grouping

أي:

1. تنظيف الاسم.
2. توحيد الصياغة.
3. حساب درجة التشابه.
4. تجميع النتائج التي تمثل نفس العمل.

⸻

7. Search Orchestrator

تم إنشاء:

src/services/search-orchestrator.js

وهو المسؤول عن تجميع نتائج البحث من المصادر المختلفة.

وظيفته ليست فقط:

ابحث في ثمانية مواقع.

بل يقوم كذلك بتحديد:

هل هذه النتائج كلها نفس المسلسل؟

ويحوّل النتائج المتعددة إلى مجموعة Canonical واحدة.

في Lucky مثلًا تم الوصول إلى مجموعة:

series:lucky

وضمت مصادر مثل:

Akwam
ArabSeed
WeCima
Shahid4u
Laaroza

بدل عرض خمس نسخ منفصلة للمستخدم.

⸻

8. إصلاح مشكلة النتائج المشابهة خطأً

ظهر أثناء تطوير البحث مثال مهم.

عند البحث عن:

Lucky

كانت هناك احتمالية لظهور:

Lucky Hank
Lucky Strike

ضمن نفس المجموعة.

تم تحسين الـScoring والـThreshold حتى لا يتم دمج الأعمال المختلفة لمجرد وجود كلمة مشتركة.

بعد التعديل أصبحت مجموعة:

series:lucky

تمثل Lucky الفعلي فقط.

هذه خطوة مهمة جدًا لأن جودة محرك البحث لا تعتمد فقط على إيجاد النتائج، بل على عدم دمج نتائج خاطئة.

⸻

9. دعم البحث عبر الـslug وليس العنوان فقط

ظهر معنا مثال Qask.

العنوان داخل الموقع لم يكن مطابقًا للاستعلام التركي:

Kurtlar Vadisi Pusu

ولكن الرابط نفسه يحتوي على:

kurtlar-vadisi-pusu

فتم تحسين المطابقة لتشمل:

* title
* provider_series_id
* source_url
* slug

وبذلك استطاع Qask الظهور في البحث حتى عندما لم يكن العنوان الظاهر مطابقًا بشكل مباشر.

⸻

10. Canonical Series Resolver

بعد نجاح البحث ظهرت المشكلة التالية:

البحث يقول:

هذا المسلسل موجود في خمسة مواقع.

لكننا نحتاج إلى معرفة:

ما الحلقات الموجودة في كل موقع؟

لذلك أنشأنا طبقة Resolver للمسلسل.

المسار الذي استخدمناه:

/api/resolve?q=Lucky&group_key=series:lucky

هذه الطبقة تقوم بأخذ جميع المصادر الموجودة ضمن المجموعة ثم تستدعي:

getSeries()

لكل Provider.

ثم توحّد الحلقات.

⸻

11. نتيجة Resolver لمسلسل Lucky

تم حل Lucky عبر خمسة مصادر.

النتيجة كانت تقريبًا:

matched_sources: 5
resolved_sources: 5
failed_sources: 0
episode_count: 8

وكان توزيع الحلقات مختلفًا بين المصادر.

مثلًا:

Akwam     → 6 حلقات
ArabSeed  → 8 حلقات
WeCima    → 7 حلقات
Shahid4u  → 7 حلقات
Laaroza   → 7 حلقات

وهذا أثبت عمليًا لماذا بنية Multi-Provider مهمة.

لأن المصدر الأول لا يحتوي بالضرورة على جميع الحلقات.

⸻

12. مفهوم Episode Source Map

بدل أن نقول:

الحلقة الأولى موجودة

أصبح النظام يعرف:

الحلقة الأولى:
- Akwam
- ArabSeed
- WeCima
- Shahid4u
- Laaroza

والحلقة الثانية مثلًا قد تكون:

- ArabSeed
- WeCima
- Shahid4u
- Laaroza

وهكذا.

هذه البنية هي أساس نظام Fallback التلقائي مستقبلًا.

⸻

13. Episode Resolver

بعد Resolver المسلسل أنشأنا Resolver على مستوى الحلقة.

هدفه:

لدي الآن الحلقة الأولى من Lucky، من أي مصدر أستطيع تشغيلها؟

تم اختبار:

Lucky
Season 1
Episode 1

وكانت النتيجة في ذلك الوقت:

matched_sources: 5
resolved_sources: 5
playable_sources: 1
failed_sources: 0

وكان المصدر القابل للتشغيل فعليًا حينها:

Akwam

بينما كانت بقية المصادر:

metadata_only

وهذا كان قبل نجاح استخراج سيرفرات WeCima الذي أنجزناه اليوم.

⸻

14. Akwam — المصدر الأكثر اكتمالًا حاليًا

Akwam كان المصدر الأول الذي وصلنا معه إلى سلسلة كاملة تقريبًا:

Search
↓
Series
↓
Episode
↓
Watch
↓
Direct Video
↓
Theeb Play

واستطعنا استخراج مصادر الفيديو الفعلية.

مثال قديم:

Episode 13
episode id: 60515
watch id: 111112
quality: 720p

⸻

15. مشكلة روابط Akwam المؤقتة

اكتشفنا أن الروابط المباشرة قد تكون:

Dynamic
Expiring

وبالتالي كان تخزين الرابط المباشر في قاعدة البيانات قرارًا خاطئًا.

لذلك أصبح التصميم:

لا نخزن direct URL النهائي

بل نخزن:

Provider
Episode ID
Watch ID
Quality

وعند طلب التشغيل يتم استخراج الرابط في الوقت الحقيقي.

وهذا تصميم أقوى بكثير.

⸻

16. Theeb Play

هذه من أهم المراحل التي أنجزناها.

تم إنشاء Route مثل:

/play/:provider/:watchId/:episodeId

ومثال:

/play/akwam/180599/101887?quality=1080p

وبذلك المستخدم لم يعد يتعامل مع رابط المصدر الحقيقي.

بل يرى:

Theeb URL

وذيب نفسه يتولى الحصول على المصدر وتشغيله.

⸻

17. دعم iPhone وSafari

واجهنا مشكلة في Safari.

كان الرابط يتم التعامل معه أحيانًا كتحميل بدل تشغيل.

تم تعديل الاستجابة بحيث ترسل:

Content-Type: video/mp4
Content-Disposition: inline
Accept-Ranges: bytes

كما تم دعم:

HTTP Range Requests

وهذا مهم جدًا لمشغلات الفيديو.

لأنه يسمح للمستخدم:

* بالتقديم.
* بالرجوع.
* باستكمال التحميل الجزئي.
* وتشغيل الفيديو بدون تنزيل الملف كاملًا.

وأصبح Akwam يعمل عبر Theeb Play على Safari.

⸻

18. Lucky على Akwam

تم العثور على Lucky الحلقة الأولى.

المعلومات التي وصلنا إليها:

provider_episode_id: 101887
quality: 1080p
watch_id: 180599

ورابط ذيب:

/play/akwam/180599/101887?quality=1080p

وهذا أثبت أن بنية Theeb Play ليست مرتبطة بالمسلسل الأول الذي جربناه.

⸻

19. قاعدة البيانات

تم اعتماد SQLite:

data/theeb.sqlite

والهيكل الأولي يحتوي على جداول مثل:

series
episodes
watch_options

وكانت هناك إحصائية خلال مرحلة من التطوير تقارب:

Series: 8
Episodes: 108
Watch options: 40
Providers: 8

لكن الأهم هو أننا أدركنا أن قاعدة بيانات من نوع:

Series → Provider واحد

لن تكون كافية للمشروع النهائي.

⸻

20. الاتجاه نحو Canonical Database

بدأنا تصميم طبقة أكثر تطورًا بحيث يصبح لدينا مثلًا:

canonical_series
provider_series
canonical_episodes
provider_episodes

الفكرة:

Lucky

يكون كيانًا واحدًا داخل ذيب.

وتحته:

Lucky في Akwam
Lucky في ArabSeed
Lucky في WeCima
...

بدل إنشاء نسخة منفصلة من Lucky لكل موقع.

هذه البنية ما تزال بحاجة إلى استكمال وربط كامل بجميع أجزاء النظام، وسأتحدث عنها في التقرير الثاني.

⸻

21. ArabSeed

تمكنّا من:

Search
Series
Episodes

ووجدنا Lucky الحلقة الأولى:

https://arabsseed.christmas/watch.php?vid=5c4f4a858

ثم اكتشفنا داخل الصفحة:

embed_url:
https://arabsseed.christmas/embed.php?vid=5c4f4a858

وعند فتح صفحة الـembed ظهر:

https://mp4.okhd.site/embed-vm6in0p12qt9.html

وهنا وصلنا إلى الطرف الخارجي:

OKHD

⸻

22. اكتشاف مشكلة OKHD

من Codespaces ظهر أولًا:

Your country is not allowed on this site

ثم في محاولات أخرى:

403
Cloudflare Challenge

قمنا بفحص عنوان خروج Codespaces، وظهر:

loc=IN
colo=BOM

أي أن Cloudflare يرى خادم Codespaces خارجًا من الهند.

وبالتالي المشكلة لم تكن في ArabSeed.

السلسلة نفسها صحيحة:

ArabSeed
↓
embed.php
↓
OKHD

لكن الوصول من Codespaces إلى OKHD هو المشكلة.

⸻

23. ماذا لم نفعل مع Cloudflare

لم نبن المشروع على محاولة كسر Cloudflare أو الاعتماد على حيل مؤقتة.

التصميم الصحيح مستقبلًا، خصوصًا مع وجود تصريح رسمي من المصدر حسب ما أوضحت، هو أحد الحلول:

API
أو
IP Allowlist
أو
Origin Integration
أو
Signed URL

لأن Codespaces أصلًا ليس بيئة Production ثابتة.

⸻

24. WeCima — نقطة التحول الأخيرة

WeCima كان في البداية ينجح في:

Search
Series
Episodes

لكن لا يعطينا تشغيلًا.

في البداية ظهر Lucky بمعرف:

02407ef98

واتضح لاحقًا أن هذا ليس معرف الحلقة الأولى الفعلي الذي نحتاجه للتشغيل.

وهذا كان سبب أن التحليلات الأولى لم تجد قائمة السيرفرات.

⸻

25. اكتشاف معرف Lucky الحقيقي في WeCima

من خلال اختبارك المباشر للموقع تم الوصول إلى الحلقة الأولى الصحيحة:

3939f732e

ورابط التشغيل:

https://mywecima.beauty/play.php?vid=3939f732e

وكان هذا اكتشافًا مهمًا جدًا.

⸻

26. اكتشاف قائمة سيرفرات WeCima

وجدنا أن play.php يحتوي فعليًا على عناصر:

li[data-embed]

أي أن قائمة السيرفرات موجودة داخل HTML نفسه.

ولذلك لا نحتاج AJAX معقدًا ولا reverse engineering لجافاسكربت الموقع للحصول على السيرفرات.

هذه نقطة اختصرت علينا جزءًا كبيرًا جدًا من العمل.

⸻

27. السيرفرات التي وجدناها

للحلقة الأولى من Lucky ظهر:

Mp4
Rty1
Vidoba
Mp4plus
Anafast
Vidspeed
Abstream
Mixdrop
Dsvplay
Voe

⸻

28. الاختبار الفعلي للسيرفرات

قمت أنت باختبارها على الجهاز الحقيقي.

والنتيجة التي اعتمدناها:

1. Mp4
2. Mp4plus
3. Anafast
4. Vidspeed
5. Mixdrop

هذه هي السيرفرات التي تعمل.

أما البقية فاعتبرناها حاليًا:

غير مناسبة / معطلة

وVoe تحديدًا ظهر أنه محجوب لديك.

⸻

29. ترتيب WeCima الجديد

قررنا ألا يعرض ذيب جميع السيرفرات بشكل أعمى.

بل نعتمد ترتيب جودة عملي:

Mp4
↓
Mp4plus
↓
Anafast
↓
Vidspeed
↓
Mixdrop

وبذلك المحرك يمتلك Server Priority بدل قائمة عشوائية.

⸻

30. تعديل getWatchInfo في WeCima

وهذه آخر خطوة برمجية كبيرة نفذناها اليوم.

تم تعديل:

src/providers/wecima.js

وبالتحديد:

getWatchInfo()

لكي يقوم بـ:

play.php?vid=<episodeId>

ثم يقرأ:

li[data-embed]

ثم يستخرج:

iframe src

ثم يحتفظ بالسيرفرات الخمسة المطلوبة فقط.

ثم يرتبها.

⸻

31. بنية Watch Options في WeCima

أصبح كل خيار تقريبًا يحمل معلومات مثل:

name
server
type
embed_url
url
priority

ويتم إرجاعها داخل:

watch_options

بدل أن يكون WeCima:

metadata_only

بلا أي معلومات تشغيل.

⸻

32. اختبار WeCima الأخير

اختبرنا Lucky الحلقة الأولى بالمعرف:

3939f732e

والهدف كان الحصول على:

source_count: 5

وبالترتيب:

Mp4
Mp4plus
Anafast
Vidspeed
Mixdrop

وذكرت أن النتيجة:

مضبوطة.

وبذلك نستطيع اعتبار مرحلة استخراج سيرفرات WeCima ناجحة.

لكن هناك فرق مهم جدًا:

استخراج Embed Server

ليس بعد مساويًا لـ:

Direct Media Proxy عبر Theeb Play

وهذه نقطة سنكملها لاحقًا.

⸻

33. الحلقة الأولى في WeCima والحلقات المكتشفة

لدينا حاليًا معرفات Lucky للموسم الأول:

E1 → 3939f732e
E2 → ed70f2d37
E3 → fbceb728d
E4 → 34aa2435e
E5 → 89b16f053
E6 → 4703c2f72
E7 → ed5388c25

وهذا يفيدنا أيضًا في التأكد مستقبلًا من أن getSeries() يلتقط معرفات الحلقات الفعلية وليس معرفًا تمثيليًا للمسلسل.

⸻

34. مسار التحميل في WeCima

اكتشفنا أيضًا وجود:

downloads.php?vid=...

مثال الحلقة الأولى:

https://mywecima.beauty/downloads.php?vid=3939f732e

لكننا تعمدنا عدم دمج التحميل مع المشاهدة.

لأن رؤيتنا التي اتفقنا عليها هي:

مشاهدة
أو
تحميل

والقرار للمستخدم.

وليس:

كل تشغيل = تحميل

أو العكس.

⸻

35. المصادر التي لم نكملها حاليًا

خلال المشروع درسنا أو مررنا على مصادر أخرى.

بعضها تم تعليقه لسبب تقني أو لأن الوقت لم يحن بعد.

منها:

CimaNow
FaselHD
Cima4U
CimaClub
CimaLight
AromaCinema

CimaLight تم استبعاده من الخطة الحالية.

AromaCinema كانت هناك اعتبارات وصول/دفع.

والبقية لم نرد أن نضيع الوقت عليها بينما لدينا ثمانية Providers يعمل معهم البحث.

وهذا كان قرارًا جيدًا؛ لأن هدفنا الحالي بناء المحرك وليس جمع أكبر رقم ممكن من المواقع.

⸻

36. وضع GitHub الحالي

آخر خطوة قمنا بها اليوم كانت:

git add .
git commit
git push

ثم:

git status

وأعطانا:

On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

وهذه هي نقطة الحفظ الرسمية الحالية للمشروع.

⸻

الملخص التنفيذي لما تم إنجازه

لو أردنا اختصار كل العمل حتى الآن في صورة واحدة:

                    THEEB ENGINE
                         │
                         ▼
                  Multi Search
                         │
                         ▼
               Canonical Grouping
                         │
                         ▼
                  Series Resolver
                         │
                         ▼
                 Episode Resolver
                         │
       ┌─────────────────┴────────────────┐
       │                                  │
       ▼                                  ▼
    Akwam                               WeCima
       │                                  │
 Direct Media                      Embed Servers
       │                                  │
       ▼                                  ▼
 Theeb Play                 Mp4 / Mp4plus / Anafast
                            Vidspeed / Mixdrop

وصلنا فعليًا إلى محرك يستطيع:

* التعامل مع ثمانية Providers.
* البحث فيهم جميعًا.
* تجميع نفس العمل.
* توحيد حلقاته.
* معرفة أي المصادر لديه الحلقة.
* الوصول إلى Direct Video من Akwam.
* تشغيل Akwam عبر Theeb نفسه.
* دعم Range وSafari.
* الوصول إلى سلسلة ArabSeed حتى OKHD.
* تشخيص سبب توقف OKHD من Codespaces.
* استخراج سيرفرات WeCima تلقائيًا.
* تحديد خمسة سيرفرات WeCima عاملة فعليًا.
* ترتيبها حسب الأولوية.
* حفظ المشروع بالكامل على GitHub.

والأهم أن المشروع لم يعد تجربة مرتبطة بموقع واحد.

أصبح لدينا نواة نظام حقيقية.

⸻

التقرير الثاني: الرؤية المستقبلية وما تبقى

الآن ننتقل من:

ماذا صنعنا؟

إلى:

ماذا نريد أن يصبح ذيب؟

وهذه المرحلة أهم من إضافة Provider جديد؛ لأن القرارات القادمة ستحدد شكل المشروع النهائي.

⸻

1. الرؤية النهائية

الرؤية ليست أن يدخل المستخدم ويختار:

Akwam
ArabSeed
WeCima

هذه تفاصيل Backend لا يفترض أن تشغل المستخدم العادي.

المستخدم يجب أن يرى:

Lucky
الموسم الأول
الحلقة الأولى
▶ مشاهدة
⬇ تحميل

فقط.

أما في الخلفية فقد يقوم ذيب بـ:

Akwam → فشل
WeCima Mp4 → فشل
WeCima Mp4plus → نجح

ولا يشعر المستخدم بأي شيء.

هذه هي المرحلة التي نريد الوصول إليها.

⸻

2. Theeb يجب أن يصبح Aggregator حقيقيًا

المشروع النهائي لا يفترض أن يكون:

قائمة مواقع

بل:

مكتبة موحدة

مثال:

بدل:

Lucky - Akwam
Lucky - ArabSeed
Lucky - WeCima

المكتبة تحتوي فقط:

Lucky

ثم داخليًا:

Canonical Series ID: 123
Sources:
Akwam
ArabSeed
WeCima
Shahid4u
Laaroza

وهذا هو السبب في أهمية استكمال Canonical Database.

⸻

3. استكمال Canonical Database

هذه من أولويات المرحلة القادمة.

نريد هيكلًا قريبًا من:

canonical_series
canonical_episodes
provider_series
provider_episodes
playback_sources
download_sources

مثلًا:

canonical_series
ID: 1001
Title: Lucky

ثم:

provider_series
Akwam     → 5697
WeCima    → ...
ArabSeed  → ...

ثم الحلقة:

canonical_episode
series: 1001
season: 1
episode: 1

وتحتها:

Akwam episode: 101887
WeCima episode: 3939f732e
ArabSeed episode: 5c4f4a858
...

هذه ستصبح نواة النظام بأكمله.

⸻

4. فصل Metadata عن Playback

هذه نقطة معمارية مهمة جدًا.

وجود المسلسل في الموقع لا يعني أن الفيديو يعمل.

لذلك نريد ثلاث حالات واضحة:

Metadata Available
Playback Available
Download Available

وقد يكون Provider:

Metadata ✅
Playback ❌
Download ❌

أو:

Metadata ✅
Playback ✅
Download ✅

وهذا أفضل بكثير من كلمة عامة:

available

⸻

5. استكمال WeCima Resolver Integration

هذه هي أقرب مهمة عندما نعود.

اليوم getWatchInfo() أصبح يستخرج السيرفرات.

لكن لم نكمل بعد ربط هذه النتيجة بالكامل بالـEpisode Resolver.

الهدف أن يصبح Lucky E1 مثلًا:

Akwam:
  direct
  1080p
WeCima:
  Mp4
  Mp4plus
  Anafast
  Vidspeed
  Mixdrop

ثم يصبح:

playable_sources >= 2

بدل مصدر واحد.

⸻

6. التمييز بين Embed وDirect

وهذه نقطة لا ينبغي استعجالها.

Akwam يعطي:

Direct Media

أما WeCima حاليًا يعطينا:

Embed Pages

وهما ليسا نفس الشيء.

لذلك لا ينبغي أن نخدع النظام ونقول إن:

Mixdrop embed

يساوي:

MP4 direct

يجب أن تكون لدينا أنواع واضحة:

direct_mp4
hls
embed
external_player

حتى يعرف تطبيق ذيب كيف يتعامل مع كل مصدر.

⸻

7. Theeb Player Resolver

مستقبلًا نحتاج طبقة مثل:

Playback Resolver

يأخذ:

Episode

ثم يقرر أفضل مسار.

مثلًا:

1. Akwam direct 1080p
2. WeCima Mp4
3. WeCima Mp4plus
4. WeCima Anafast
5. WeCima Vidspeed
6. WeCima Mixdrop

ويستطيع أيضًا معرفة:

أيها direct؟
أيها embed؟
أيها يحتاج WebView؟

⸻

8. Health Check للسيرفرات

الاختبار الذي قمنا به يدويًا يجب ألا يبقى يدويًا للأبد.

مستقبلًا نريد أن يسجل النظام:

Mp4       Healthy
Mp4plus   Healthy
Anafast   Healthy
Vidspeed  Healthy
Mixdrop   Healthy
Voe       Blocked

ثم يعيد التحقق دوريًا.

وبذلك إذا تعطل Mp4 مستقبلًا، لا يحتاج المستخدم إلى اكتشاف المشكلة.

ذيب يعرف قبل المستخدم.

⸻

9. Server Scoring

حتى السيرفرات التي تعمل ليست متساوية.

يمكن مستقبلًا إعطاء كل Server Score مثلًا:

Availability
Latency
Startup Time
Buffering
Resolution
Failure Rate
Geo Compatibility

ثم تصبح الأولوية ديناميكية.

بدل ترتيب ثابت فقط.

مثلًا اليوم:

Mp4 = 95
Mp4plus = 90
Anafast = 86
Vidspeed = 82
Mixdrop = 78

لكن غدًا قد تتغير تلقائيًا.

⸻

10. Fallback الذكي

هذا من أهم أهداف المشروع.

المستخدم يضغط:

تشغيل

ويحاول ذيب:

Source A

إذا فشل في ثانيتين أو ثلاث:

Source B

ثم:

Source C

حتى ينجح.

بدون أن يطلب من المستخدم:

اختر سيرفر 1 أو 2 أو 3.

ويمكن إبقاء خيار تغيير السيرفر للمستخدم المتقدم فقط.

⸻

11. نظام Region Awareness

تجربة Voe وOKHD أثبتت أن المصدر قد يعمل في دولة ويفشل في أخرى.

لذلك مستقبلًا يمكن أن يعرف المحرك:

Saudi Arabia:
Voe = blocked
Mixdrop = working

لكن:

Europe:
Voe = working

وبالتالي ترتيب السيرفرات قد يتغير حسب البيئة.

⸻

12. نقل Backend من Codespaces إلى Production

Codespaces ممتاز للتطوير.

لكنه ليس المكان النهائي لـTheeb Engine.

لأنه:

* عنوان الخروج قد يتغير.
* الدولة قد تتغير.
* الجلسة قد تتوقف.
* ليس Backend إنتاج دائمًا.
* لا يعطينا تحكمًا كاملًا في الشبكة.

مستقبلًا نحتاج Backend دائمًا.

قد يكون:

VPS
Cloud VM
Dedicated Server

حسب احتياج المشروع عند تلك المرحلة.

⸻

13. IP ثابت

هذا مهم خصوصًا إذا أردنا Integration رسمي مع مصادر مثل OKHD.

بدل:

Codespaces IP يتغير

نريد:

Theeb Production IP

ثابت.

وعندها يمكن للمصدر أن يقول:

هذا IP مسموح له

وتصبح العملية نظيفة ومستقرة.

⸻

14. إكمال OKHD في الوقت المناسب

لن نهدر وقتًا الآن في Cloudflare.

عندما يكون لدينا Backend Production ثابت، نرجع إلى OKHD.

الطريق المثالي:

OKHD
    ↓
Theeb authorized endpoint
    ↓
Direct/authorized media source
    ↓
Theeb Play

وليس الاعتماد على صفحة Browser Challenge.

⸻

15. استكمال ArabSeed Playback

بمجرد حل OKHD يصبح ArabSeed قريبًا جدًا من التحول من:

metadata_only

إلى:

playable

لأننا أصلًا وصلنا بنجاح إلى:

watch.php
↓
embed.php
↓
OKHD embed

المفقود فقط هو طبقة الوصول المناسبة إلى OKHD.

⸻

16. استكمال Shahid4u

حاليًا Shahid4u جيد كـMetadata Provider.

وقد استطعنا حتى الوصول من الحلقة إلى صفحة المسلسل.

لكن Playback Resolver لم يُبن له بعد.

سنضيفه عندما يصبح عندنا Framework موحد للتشغيل.

⸻

17. LodyNet / Qask / CimaLeek / Laaroza

هذه المصادر لا ينبغي أن نتعامل معها الآن واحدًا واحدًا دون نظام.

الأفضل بعد إنهاء:

Playback Interface

أن نطبق نفس الواجهة على كل Provider.

مثلًا:

getPlaybackOptions()

ويرجع صيغة موحدة.

ثم يصبح إضافة مصدر جديد أسرع بكثير.

⸻

18. Standard Provider Contract

مستقبلًا يجب أن يصبح لكل Provider Contract صريح.

مثل:

search()
getSeries()
getEpisode()
getPlaybackOptions()
getDownloadOptions()
healthCheck()

وهكذا يصبح أي Provider لا يلتزم بالعقد واضحًا.

⸻

19. Timeouts

عندما يبحث ذيب في 8 أو 20 Provider، لا يمكن الانتظار إلى الأبد.

نريد مثلًا:

Provider Timeout

إذا تجاوز المصدر مدة محددة:

skip

ويكمل البقية.

⸻

20. Parallel Requests

العمل الحالي أصلًا مهيأ لفكرة تعدد المصادر.

مستقبلًا سنحسن التنفيذ بحيث الاستعلامات المستقلة تعمل بالتوازي.

بدل:

Akwam ثم ArabSeed ثم WeCima

نريد:

Akwam ──────┐
ArabSeed ───┤
WeCima ─────┤ → Merge
Shahid4u ───┤
...

فيقل وقت البحث بشكل كبير.

⸻

21. Caching

لا داعي كل مرة يدخل المستخدم Lucky أن نعيد اكتشاف كل شيء.

نريد طبقات Cache مختلفة.

مثل:

Search Cache
Series Cache
Episode Cache
Playback Cache

لكن Playback Cache يجب أن يكون قصير العمر لأن الروابط قد تنتهي.

⸻

22. TTL حسب نوع البيانات

مثلًا:

Series metadata → 24 ساعة
Episode list → عدة ساعات
Server health → دقائق
Direct media URL → دقائق أو أقل

وهذا يمنع تخزين معلومات منتهية.

⸻

23. Refresh System

لدينا أساس سابق لـ:

refresh
refresh-all
jobs

لكن مستقبلًا نريد Scheduler حقيقيًا يحدث:

الحلقات الجديدة
المصادر
الصور
Metadata

بدون تدخل يدوي.

⸻

24. Background Jobs

إذا أضفنا مسلسلًا ضخمًا يحتوي:

180 حلقة

لا نريد حجز HTTP Request حتى ينتهي.

بل:

POST import
↓
Job ID
↓
Background processing

ثم المستخدم يسأل:

/job/:id

عن الحالة.

لدينا بداية لهذه الفكرة ويجب تطويرها.

⸻

25. Deduplication متقدم

العناوين وحدها لن تكفي على المدى البعيد.

مستقبلًا يمكن استخدام:

Year
Season count
Poster
TMDB ID
IMDb ID
Cast
Original title

للتأكد أن عملين هما نفس المسلسل.

⸻

26. TMDB / IMDb Mapping

هذه خطوة كبيرة جدًا عندما نصل إلى بناء المكتبة النهائية.

إذا حصلنا على:

TMDB ID

فيمكن أن يصبح هو المفتاح العالمي للمحتوى.

ثم:

Theeb Canonical Series
      ↕
TMDB
      ↕
Provider mappings

وهذا سيحسن البحث والتجميع بشكل هائل.

⸻

27. Metadata Layer مستقلة

المصادر التي نشاهد منها ليست بالضرورة أفضل مصدر للصور والوصف والتقييم.

مستقبلًا يمكن أن نقول:

Playback → Providers
Metadata → TMDB أو مصادر منظمة

وهذا يعطي تطبيقًا أجمل وأكثر ثباتًا.

⸻

28. اختيار الجودة

مع Akwam بدأنا بالفعل بمفهوم:

quality=1080p

مستقبلًا المستخدم يستطيع اختيار:

Auto
1080p
720p
480p

والـAuto يختار بناءً على:

سرعة الشبكة
استقرار السيرفر
توفر الجودة

⸻

29. Watch / Download

اتفقنا أن يكونا مسارين منفصلين.

واجهة المستخدم المستقبلية:

▶ مشاهدة
⬇ تحميل

وتحت كل واحد مصادره الخاصة.

لأن أفضل Server للمشاهدة قد لا يكون أفضل Server للتحميل.

⸻

30. Download Resolver

مستقبلًا يمكن للحلقة أن تحتوي:

watch_options
download_options

ولا نخلط الاثنين.

⸻

31. Theeb API النهائي

أحد الأشكال المحتملة مستقبلًا:

/api/search
/api/series/:id
/api/series/:id/episodes
/api/episode/:id
/api/episode/:id/play
/api/episode/:id/download

بحيث التطبيق لا يعرف شيئًا عن:

Akwam
WeCima
ArabSeed

إلا إذا فتح المستخدم شاشة متقدمة.

⸻

32. توحيد API الحالي

لدينا حاليًا مسارات نمت مع نمو المشروع.

مثل:

/api/library/search
/api/search
/api/resolve
/api/episode/resolve

وهي مناسبة للتطوير.

لكن قبل Production يجب تنظيف API وتسميته بشكل نهائي وواضح.

⸻

33. Versioning

لدينا حاليًا اختلاف بسيط يجب تنظيفه لاحقًا:

Banner قد يشير إلى:

v0.10.0

بينما الـRoot API كان في نسخة سابقة يعرض:

0.9.0

هذه ليست مشكلة تشغيلية مهمة الآن، لكنها من الأمور التي يجب تنظيفها قبل إصدار رسمي.

⸻

34. Logging

نحتاج مستقبلًا Logging حقيقيًا.

مثل:

Search provider=wecima duration=420ms success
Playback provider=akwam quality=1080p success
Server=mixdrop failed timeout

بدل الاعتماد على console.log فقط.

⸻

35. Metrics

بعد ذلك يمكن أن نعرف:

أفضل Provider
أكثر Provider فشلًا
متوسط وقت البحث
أفضل Server
أكثر مسلسل يتم طلبه

وهذا يسمح لنا بتحسين النظام بناءً على بيانات حقيقية.

⸻

36. Error Taxonomy

بدل أن يعيد أي فشل:

Error

نريد أنواعًا واضحة مثل:

PROVIDER_TIMEOUT
CONTENT_NOT_FOUND
PLAYBACK_UNAVAILABLE
GEO_BLOCKED
RATE_LIMITED
SERVER_DOWN
SOURCE_EXPIRED

وبذلك يعرف الـFallback ماذا يفعل.

⸻

37. Circuit Breaker

إذا كان Provider متعطلًا تمامًا، ليس منطقيًا أن نحاول معه في كل طلب.

مستقبلًا:

10 failures
↓
temporarily disable
↓
recheck later

وهذا سيجعل المحرك أسرع وأكثر استقرارًا.

⸻

38. Rate Limiting

عندما يكبر المشروع يجب ألا يضرب المواقع الخارجية بمئات الطلبات غير الضرورية.

سنحتاج:

Caching
Request dedupe
Rate limits
Queue

وهذا أفضل للمشروع وللمصادر معًا.

⸻

39. Security Hardening

قبل Production نحتاج مراجعة:

SSRF
Redirect validation
Allowed hosts
Input validation
URL validation
Proxy restrictions
Timeouts
Maximum response size

خصوصًا لأن Theeb يتعامل مع روابط خارجية كثيرة.

⸻

40. عدم تحويل Theeb Play إلى Open Proxy

هذا مهم جدًا.

المسار:

/play

يجب ألا يسمح للمستخدم بإدخال أي URL على الإنترنت.

بل فقط:

provider + known identifiers

ويقوم Provider نفسه ببناء المصدر.

وهذه فلسفة التصميم الصحيحة.

⸻

41. Authentication مستقبلًا

إذا أصبح Backend عامًا، لا نريد أن يستطيع أي شخص استنزاف السيرفر.

يمكن أن يصبح التطبيق يرسل:

Theeb API token

أو جلسة مستخدم.

ليس مهمًا الآن، لكنه مهم قبل النشر الواسع.

⸻

42. دمج المحرك مع تطبيق ذيب

هذه هي اللحظة التي يتحول فيها Engine من مشروع Backend إلى منتج.

التطبيق يرسل:

search("Lucky")

ويأخذ نتائج موحدة.

ثم:

series
episodes
play

بدون Web scraping داخل التطبيق نفسه.

وهذا أفضل بكثير من وضع Scraper داخل Flutter.

⸻

43. فائدة فصل التطبيق عن Engine

إذا تغير WeCima غدًا:

نعدل:

wecima.js

فقط.

ولا نحتاج:

إصدار APK جديد
إصدار IPA جديد
تحديث Google TV
تحديث Windows

وهذه فائدة هندسية ضخمة.

⸻

44. التطبيق يصبح Client نحيفًا

تطبيق ذيب النهائي يجب أن يهتم بـ:

UI
Player
Navigation
Favorites
History
Downloads
Settings

أما:

Scraping
Provider logic
Canonical mapping
Fallback
Source discovery

فتكون داخل Engine.

⸻

45. المزامنة

بما أن Backend مركزي، مستقبلًا يمكن للمستخدم أن يبدأ الحلقة على التلفزيون ويكمل على الهاتف.

لأن:

Watch history
Progress
Favorites

يمكن أن تصبح على السيرفر.

هذه ليست أولوية الآن، لكنها من النتائج الطبيعية للبنية التي بنيناها.

⸻

46. Recommendation Engine

بعد وجود مكتبة Canonical، يصبح من الممكن مستقبلًا عمل:

لأنك شاهدت...
مشابه لـ...
الأكثر مشاهدة...
ترند...

وهذا شيء لا يمكن بناؤه بسهولة إذا كانت البيانات متفرقة على المواقع.

⸻

47. تعدد اللغات

يمكن أن يحتوي Canonical Series على:

Arabic title
Original title
English title
Turkish title
Aliases

وهذا سيحل جزءًا كبيرًا من مشاكل البحث مستقبلًا.

⸻

48. Search Engine أقوى

يمكن لاحقًا إضافة:

Typo tolerance
Arabic normalization
Transliteration
Turkish/Arabic matching
English/Arabic aliases

حتى البحث مثل:

وادي الذئاب
Kurtlar Vadisi
Kurtlar Vadisi Pusu

يفهم أنها مرتبطة.

⸻

49. عدم التسرع في الذكاء الاصطناعي

يمكن استخدام AI مستقبلًا في مطابقة الأعمال، لكن ليس من المنطقي جعله أساس النظام الآن.

الأفضل:

IDs
Metadata
Rules
Similarity

ثم AI فقط للحالات الغامضة.

⸻

50. مرحلة الجودة قبل إضافة 100 Provider

من أهم القرارات التي يجب أن نستمر عليها:

لسنا بحاجة الآن إلى:

50 موقع

إذا كان لكل واحد دعم ناقص.

الأفضل أن نصل مثلًا إلى:

5 Providers ممتازين

يدعمون:

Search
Series
Episodes
Playback
Fallback

ثم نوسع.

⸻

ما لم يكتمل حتى نقطة التوقف الحالية

إذا أردنا تحديد العمل المفتوح بدقة، فهذه أهم النقاط:

WeCima: استخراج السيرفرات نجح، لكن لم نكمل بعد تحويله إلى تجربة تشغيل كاملة عبر Resolver/Theeb Player.

ArabSeed: وصلنا إلى OKHD، ولكن طبقة التشغيل ما تزال معلقة لحين وجود Integration مناسب أو بيئة Production ثابتة.

Canonical DB: التصميم موجود جزئيًا والفكرة واضحة، لكنه لم يصبح بعد المصدر الأساسي الوحيد لجميع عمليات البحث والمسلسلات والحلقات.

Episode Resolver: يعمل، لكن يحتاج إدخال WeCima Playback الجديد وتحسين تصنيف direct مقابل embed.

Fallback: الفكرة والبنية موجودتان، لكن Automatic Playback Fallback الكامل لم يُنفذ بعد.

Server Health: قمنا بالاختبار يدويًا ولم يتحول بعد إلى Health Monitoring آلي.

Download: اكتشفنا مسارات تحميل، لكن Download Resolver لم يُبن بعد.

Production Deployment: ما زلنا في Codespaces.

Stable IP: غير موجود حتى الآن.

Provider Playback: معظم Providers ما تزال Metadata أكثر من Playback.

API Cleanup: يحتاج Naming/Versioning نهائيًا.

Security Hardening: يجب أن يأتي قبل فتح المحرك للعامة.

Flutter Integration: لم نصل بعد إلى مرحلة ربط Theeb Engine بصورة نهائية مع تطبيق ذيب العرب.

⸻

ما تعمدنا تأجيله لأن وقته لم يحن

بعض الأشياء ليست “ناقصًا” بمعنى الخطأ؛ بل مؤجلة عمدًا.

مثل:

نظام الحسابات
المزامنة بين الأجهزة
Recommendations
Analytics
واجهة Admin
نظام المستخدمين
Cloud Production
CDN
Auto scaling
Notifications
AI matching
TMDB enrichment الكامل
Download manager المتقدم
DRM إن احتجناه

لو بدأنا فيها الآن سنشتت المشروع قبل اكتمال أهم جزء:

Content → Episode → Reliable Playback

ولهذا ترتيبنا الحالي صحيح.

⸻

الترتيب المقترح عند استئناف المشروع

عندما نرجع للعمل، لا أنصح بالقفز إلى Provider جديد.

الترتيب الأقوى هو:

1. ربط WeCima watch_options بالـEpisode Resolver
2. اختبار Lucky E1 من API الموحد
3. تعريف direct/embed بشكل رسمي
4. تصميم Playback Option Schema النهائي
5. بناء Fallback أولي بين Akwam وWeCima
6. اختبار حلقات متعددة وليس Lucky E1 فقط
7. إصلاح WeCima getSeries لضمان معرفات الحلقات الصحيحة دائمًا
8. إكمال Canonical DB
9. ربط Resolver بقاعدة البيانات
10. بعد استقرار ذلك ننتقل إلى Provider Playback الثالث

بعد هذه النقطة، إضافة Shahid4u أو ArabSeed أو غيرهما ستصبح أسهل بكثير.

⸻

الشكل الذي أرى أن ذيب يمكن أن يصل إليه

المنتج النهائي يمكن أن يعمل بهذه الصورة:

المستخدم يبحث عن مسلسل
        ↓
Theeb Search
        ↓
Canonical Series
        ↓
Canonical Episode
        ↓
Playback Resolver
        ↓
Health + Ranking + Geo
        ↓
أفضل مصدر متوفر
        ↓
Theeb Player

وإذا فشل:

Automatic Fallback

وإذا أراد تحميل:

Download Resolver

وكل هذا بدون أن يعرف المستخدم أصلًا من أي موقع جاء الفيديو.

هذه هي النقلة الحقيقية من:

مشغل روابط

إلى:

Media Engine

⸻

الملخص النهائي للرؤية المستقبلية

نحن الآن في مرحلة يمكن وصفها بأنها:

Theeb Engine Foundation / Early Core

لسنا في البداية الصفرية؛ الجزء الصعب من التفكير المعماري بدأ يتشكل بالفعل.

لدينا حاليًا:

Multi-Provider Architecture
Search Orchestration
Canonical Grouping
Series Resolution
Episode Resolution
Akwam Direct Playback
Theeb Media Proxy
WeCima Server Extraction
Provider Registry
SQLite Library
GitHub versioned codebase

أما المرحلة القادمة فهي تحويل هذه القطع من أجزاء ناجحة منفصلة إلى منظومة تشغيل واحدة متماسكة.

الهدف القريب ليس إضافة عشرات المواقع.

الهدف القريب هو أن يستطيع ذيب أخذ:

Lucky S01E01

ثم يقول داخليًا:

عندي Akwam
وعندي WeCima
وعندي خمسة سيرفرات WeCima
أعرف أيها Direct
وأعرف أيها Embed
وأعرف ترتيبها
وأستطيع التبديل بينها

ثم يضغط المستخدم مشاهدة وينتهي الموضوع.

بعد استقرار هذه الطبقة، نبدأ التوسع الحقيقي: قاعدة Canonical كاملة، Health Monitoring، Fallback ذكي، Download Resolver، Production Backend، IP ثابت، Integration مع المصادر المصرح بها، وربط المحرك بتطبيق ذيب على الهاتف والتلفزيون والويب.

ونقطة توقفنا الحالية ممتازة من الناحية العملية: الكود محفوظ على GitHub، فرع main مطابق لـorigin/main، ولا توجد تعديلات معلقة. عندما نرجع في الجلسة القادمة، نقطة البداية الصحيحة هي WeCima → Episode Resolver → Playback/Fallback، وليس إعادة أي من العمل السابق.
