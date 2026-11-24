# CULMERA — خطة استكمال صور الخدمات الـ77

## 1. الهدف الأصلي

الموقع هو موقع شركة CULMERA Solutions، والمطلوب تحسين صور/رسومات بطاقات الخدمات في الكتالوج. الرسومات القديمة كانت عامة ومتشابهة، ولا توضّح للعميل طبيعة كل خدمة بشكل احترافي.

المطلوب إنشاء صورة بصرية مخصصة لكل خدمة من الخدمات الـ77، بحيث:

- تعبّر الصورة بوضوح عن وظيفة الخدمة نفسها.
- تكون الصور كلها جزءًا من لغة بصرية واحدة متناسقة.
- يبدو العمل كأنه Art Direction احترافي من فريق Product/Brand Design عالمي.
- لا تبدو الصور كصور AI عشوائية أو Stock images.
- لا يتم الإيحاء بأن الصور Case Studies حقيقية أو مشاريع عملاء منفذة، بل هي conceptual product visuals.
- يتم ربط كل صورة بالخدمة الصحيحة داخل بطاقات الكتالوج وصفحة تفاصيل الخدمة.
- يتم ضغط الصور وتحسينها للويب حتى لا تؤثر على سرعة الموقع.

## 2. اتجاه الـArt Direction المعتمد

استخدم هذا الوصف في كل عمليات التوليد القادمة:

> Premium editorial product illustration for a digital service catalogue. Show a refined responsive web-product interface or a carefully composed product-design scene that makes the service understandable at first glance. Use one consistent CULMERA visual language across the full set: deep navy background, warm muted gold accents, ivory surfaces, steel-blue panels, subtle glass and depth, controlled studio lighting, clean geometric composition, sophisticated global digital agency art direction, high-end UI/product design presentation, restrained contrast, no visual clutter.

### قواعد ثابتة لكل الصور

1. الأسلوب: premium editorial product illustration / product UI art direction، وليس cartoon أو flat icon.
2. الألوان: deep navy، muted warm gold، ivory، steel blue، مع الحفاظ على مظهر الموقع الحالي.
3. التكوين: واجهة منتج رقمية أو مجموعة واجهات مترابطة، غالبًا داخل browser/device-like frame أو composition عائم.
4. كل صورة يجب أن تحتوي على عناصر وظيفية مرتبطة بالخدمة، وليس مجرد شكل رمزي عام.
5. لا تستخدم نصوصًا مقروءة داخل الصور؛ استخدم خطوطًا وكتلًا UI مجردة بدل النصوص حتى لا تظهر أخطاء AI.
6. ممنوع الشعارات، أسماء الشركات، العلامات التجارية، العلامات المائية، أو أسماء عملاء وهمية.
7. ممنوع استخدام صور أشخاص أو صور Stock إلا إذا كانت الخدمة نفسها تحتاج مفهوم الجمهور/المستخدم، وحتى وقتها الأفضل استخدام avatars هندسية مجردة.
8. ممنوع جعل كل الصور نفس الشاشة مع تغيير لون بسيط؛ يجب أن يختلف composition والعناصر الوظيفية حسب الخدمة.
9. لا تستخدم أيقونة منفردة كصورة نهائية.
10. يجب أن تبدو النتيجة كتصميم منتج رقمي احترافي، لا كصورة مولّدة عشوائيًا.
11. استخدم aspect ratio 16:9 لكل صور بطاقات الخدمات.
12. استخدم PNG أو JPG حسب ما يناسب الأداة، ثم أنشئ نسخة WebP مضغوطة للاستخدام في الموقع.
13. احفظ الصورة الأصلية والنسخة المضغوطة إن أمكن، لكن استخدم WebP داخل الموقع.
14. سمِّ الملفات بالـslug الدقيق للخدمة، مثل: `corporate.webp` و`online-store.webp`.

## 3. ما تم إنجازه حتى الآن

تم تعديل المشروع بالفعل لإيقاف الرسومات العشوائية القديمة وتفعيل نظام الرسومات المخصصة الموجود في `js/catalog-art.js`.

التعديل البرمجي الحالي:

- `index.html` أصبح يحمّل `js/catalog-art.js`.
- `js/app.js` يستخدم `CatalogArt.render(...)` بدل مولّد SVG العشوائي القديم.
- يوجد مجلد للأصول الجديدة: `images/services/`.
- تم توليد 10 صور AI مبدئية بنفس الـArt Direction المذكور أعلاه.

### الصور الموجودة حاليًا

- `images/services/corporate.png`
- `images/services/landing-page.png`
- `images/services/portfolio.png`
- `images/services/hospitality-site.png`
- `images/services/events.png`
- `images/services/docs-knowledge.png`
- `images/services/online-store.png`
- `images/services/digital-store.png`
- `images/services/subscriptions.png`
- `images/services/marketplace.png`

هذه الصور تم توليدها بدقة أصلية تقريبًا 2816×1584، ولم يتم بعد ربطها بالبطاقات أو تحويلها إلى WebP داخل المشروع. يجب عدم إعادة توليد هذه العشرة؛ استخدمها كما هي، ثم أنشئ منها نسخ WebP محسّنة للويب.

## 4. ترتيب الدفعات المطلوبة

يوجد 77 خدمة. تم إنجاز الخدمات من 1 إلى 5 ومن 11 إلى 15. أكمل بالترتيب التالي، مع توليد 10 صور في كل مرحلة، ثم 7 صور في المرحلة الأخيرة.

### الدفعة 1 — مكتملة مسبقًا

1. `corporate` — Corporate website
2. `landing-page` — Landing page
3. `portfolio` — Portfolio & personal site
4. `hospitality-site` — Restaurant, café & hotel website
5. `events` — Event & occasion site

### الدفعة 2 — مكتملة مسبقًا

11. `docs-knowledge` — Documentation & knowledge base
12. `online-store` — Online store
13. `digital-store` — Digital products store
14. `subscriptions` — Subscriptions & memberships
15. `marketplace` — Multi-vendor marketplace

### الدفعة 3 — المطلوب توليدها الآن

6. `nonprofit` — Non-profit & charity site
7. `education-showcase` — Education showcase site
8. `institutional` — Institutional & public-body site
9. `microsite` — Microsite
10. `content-media` — Blog, magazine, news & podcast site

16. `b2b-wholesale` — B2B wholesale portal
17. `dropshipping-pod` — Dropshipping & print-on-demand
18. `auctions-rentals` — Auctions & rental platforms
19. `catalog-orders` — Catalog with WhatsApp / pay-on-delivery orders
20. `configurator-store` — Customizable product store

### الدفعة 4

21. `appointments` — Appointment booking
22. `stays` — Hotel, chalet & short-stay booking
23. `table-booking` — Table booking & restaurant chains
24. `ticketing` — Ticketing & event booking
25. `rentals` — Rentals: cars, equipment, venues
26. `on-demand` — On-demand services
27. `travel` — Travel & tourism platform
28. `saas` — SaaS platform
29. `crm` — CRM & sales management
30. `erp` — ERP

### الدفعة 5

31. `hr` — HR management
32. `project-management` — Project & task management
33. `accounting` — Accounting & invoicing
34. `logistics` — Warehouse & logistics
35. `pos` — Point of sale (POS)
36. `property-mgmt` — Property & asset management
37. `support-desk` — Customer support system
38. `documents-esign` — Document management & e-signature
39. `portals` — Client & supplier portals
40. `education-lms` — Education platform (LMS)

### الدفعة 6

41. `healthcare` — Healthcare systems
42. `fintech` — Finance & fintech
43. `real-estate` — Real estate
44. `automotive` — Automotive
45. `hospitality-systems` — Hospitality management
46. `industry-iot` — Agriculture, industry & energy
47. `legal` — Legal practice systems
48. `government` — Government & public services
49. `media-streaming` — Media & streaming
50. `recruitment` — Recruitment & freelancer platforms

### الدفعة 7

51. `community` — Communities & social networks
52. `sports-fitness` — Sports & fitness
53. `games` — Games & entertainment
54. `emerging-tech` — Emerging tech
55. `ai-data-platform` — AI & data platforms
56. `chatbots` — Chatbots & assistants
57. `automation` — Automation systems
58. `bi` — Business intelligence dashboards
59. `internal-tools` — Internal tools
60. `recording-studio` — Online recording & production studio

### الدفعة 8

61. `interactive-studio` — Interactive storytelling
62. `configurator-3d` — 3D product configurator
63. `virtual-showroom` — Virtual showroom & tours
64. `ar` — AR experiences
65. `launch-campaign` — Cinematic launch & campaign sites
66. `digital-twin` — Digital twins & operations views
67. `virtual-events` — Virtual expos & conferences
68. `interactive-identity` — Interactive brand identity & presentations
69. `mobile-apps` — Mobile & desktop apps
70. `integrations` — APIs & integrations

### الدفعة 9 — الأخيرة، 7 صور

71. `admin-cms` — Admin dashboard & CMS
72. `multi-region` — Multi-language, multi-currency & tax
73. `migration` — Migration & platform change
74. `redesign` — Redesign & optimisation
75. `maintenance` — Maintenance & support
76. `audit` — Audit
77. `training` — Training & documentation

## 5. فكرة كل صورة حسب نوع الخدمة

لا تكتفِ بكتابة اسم الخدمة في prompt. أظهر الوظيفة بصريًا:

- Corporate: company site، services، team، news، careers.
- Landing page: hero، offer، testimonial، pricing، lead form.
- Portfolio: project gallery، case studies، profile/CV، booking.
- Hospitality site: menu، venue/gallery، reservations، location.
- Events: schedule، speakers، RSVP، venue map، ticket.
- Nonprofit: campaign، impact metrics، donation، volunteering.
- Education: programs، admissions، faculty، campus، enquiry.
- Institutional: departments، public services directory، notices، documents.
- Microsite: one focused story، media، countdown، sign-up، trailer.
- Content media: article feed، categories، author، podcast player، search.
- E-commerce: catalog، filters، variants، cart، checkout، orders.
- Booking: calendar، availability، deposit، reminders، rescheduling.
- SaaS/CRM/ERP: dashboard، users/teams، workflows، billing، data tables.
- Healthcare/legal/finance: records، cases، secure access، approvals، audit trail، while avoiding real personal data.
- AI/data/BI: datasets، pipelines، model/evaluation concepts، KPI dashboards، charts without readable fake numbers.
- 3D/AR/immersive: 3D object، showroom، spatial layers، live scene or interactive canvas.
- Integrations/automation: connected systems، workflow nodes، sync states، automation steps.
- Maintenance/audit/training: monitoring، audit checklist، reports، guides، progress states.

## 6. خطوات كل مرحلة

في كل مرحلة، نفّذ الخطوات التالية بالترتيب:

1. اقرأ `js/catalog.js` وتأكد من أسماء الخدمات والـslugs.
2. افحص `images/services/` ولا تعِد توليد أي ملف موجود بالفعل.
3. ولّد صور الدفعة المطلوبة فقط، بحد أقصى 10 صور في المرحلة، أو 7 في الدفعة الأخيرة.
4. استخدم نفس الـArt Direction والقواعد الموجودة في هذا الملف.
5. تحقق بصريًا أن كل صورة مختلفة وظيفيًا عن الصور الأخرى، وأنها لا تحتوي نصوصًا مشوهة أو شعارات وهمية.
6. حوّل الصور إلى WebP مضغوطة مناسبة للبطاقات، مع الحفاظ على aspect ratio 16:9. جودة مبدئية مقترحة 78–85.
7. احتفظ بالصور الأصلية في مجلد منفصل مثل `images/services/source/` إن كان ذلك مناسبًا، واستخدم نسخ WebP في البطاقات.
8. عدّل `js/app.js` بحيث تكون الأولوية للصورة الجديدة حسب الـslug، مع fallback إلى `CatalogArt.render(t, L.catalog.concept)` إذا لم توجد صورة.
9. لا تحذف fallback الرسومات الحالية؛ يجب أن يظل الموقع يعمل حتى لو كانت بعض الصور ناقصة.
10. استخدم `loading="lazy"` و`decoding="async"` للصور داخل البطاقات، مع `width` و`height` أو `aspect-ratio` لتقليل layout shift.
11. حدّث `js/app.js` أيضًا في صفحة تفاصيل الخدمة `typePage` حتى تستخدم الصورة نفسها.
12. شغّل فحص JavaScript:
    - `node --check js/app.js`
    - `node --check js/catalog-art.js`
13. نفّذ فحصًا آليًا يطابق كل الـ77 slug مع صورة WebP أو fallback معروف.
14. لا تعتبر المرحلة مكتملة إذا كان اسم ملف الصورة لا يطابق slug الخدمة.
15. أنشئ ZIP محدثًا للمشروع بعد كل مرحلة، مع إبقاء ملف `AI_SERVICE_VISUALS_PLAN.md` داخله.

## 7. المطلوب النهائي بعد الدفعة الأخيرة

بعد اكتمال الصور الـ77:

- كل خدمة يجب أن يكون لها صورة AI مخصصة بصيغة WebP، أو fallback واضح فقط في حالة فشل موثق.
- جميع الصور يجب أن تظهر في بطاقة الخدمة وصفحة تفاصيل الخدمة.
- يجب ألا تكون الصور مجرد SVG generic إذا كانت صورة الخدمة جاهزة.
- يجب أن تبقى الرسومات SVG الحالية كـfallback احتياطي.
- يجب تحديث أي alt text باستخدام اسم الخدمة، وعدم ادعاء أن الصور تمثل مشاريع حقيقية.
- يجب تشغيل فحص كامل للـ77 خدمة والـ77 asset.
- يجب إنشاء ZIP نهائي يحتوي على المشروع كاملًا.
- يجب ذكر أي خدمة فشل توليد صورتها بدل اختلاق صورة أو إعادة استخدام صورة خدمة أخرى.

## 8. ملاحظة مهمة عن حدود التوليد

إذا كانت أداة التوليد تفرض حدًا يوميًا، لا تعِد توليد الصور الموجودة ولا تعِد إرسال نفس الدفعة الفاشلة عدة مرات. سجّل آخر slug تم إنجازه، وانتظر عودة الحد، ثم أكمل من أول slug غير موجود. لا تربط صورة خدمة بصورة خدمة أخرى كحل مؤقت.

## 9. تعريف النجاح

تعتبر المهمة ناجحة فقط عند تحقق الشروط التالية:

- 77 خدمة موجودة في `js/catalog.js`.
- لكل خدمة ملف asset مطابق للـslug.
- الصور متناسقة بصريًا لكنها مختلفة وظيفيًا.
- الصور لا تحتوي على شعارات أو نصوص AI مشوهة.
- الصور مربوطة بالبطاقات وصفحات التفاصيل.
- الصور مضغوطة للويب وتستخدم lazy loading.
- `CatalogArt` يظل fallback.
- فحوصات JavaScript والمطابقة الآلية تمر بنجاح.
- ZIP النهائي يحتوي على كل الكود والأصول وملف الخطة.
