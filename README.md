# درة الهجرة للعقارات

واجهة React + Vite مستقلة، مع Firebase Client وVercel Function خادمية لإشعارات العقارات إلى تيليجرام.

## التشغيل والبناء

```bash
pnpm install
pnpm dev
pnpm build
```

يتضمن أمر `build` فحص TypeScript قبل إنشاء مجلد `dist`.

## إعداد Firebase وVercel

إعداد Firebase العام موجود في `src/lib/firebase.ts`. يلزم توفير `VITE_FIREBASE_API_KEY` و`FIREBASE_PROJECT_ID` في إعدادات Vercel. لا ترفع ملف `.env` الحقيقي إلى GitHub؛ ابدأ من `.env.example`.

في Vercel استخدم جذر المشروع الحالي، وأمر البناء `pnpm build` ومجلد الإخراج `dist`.

قواعد Firestore وStorage موجودة في `firestore.rules` و`storage.rules` ويمكن نشرها إلى مشروع Firebase عبر Firebase CLI. تعتمد صلاحيات الموقع على هذه القواعد وعلى وثائق الموظفين الموجودة مسبقاً في مجموعة `employees`.

## إشعارات تيليجرام

بعد إنشاء عقار جديد وحفظه بنجاح، تستدعي الواجهة `api/telegram-notify.ts` لإرسال العنوان والنوع والسعر والموقع ورقم الإعلان إلى القناة المحددة. التعديلات على العقارات الموجودة لا ترسل إشعاراً جديداً. تتحقق الدالة من Firebase ID token، ومن أن الموظف نشط، وأنه صاحب العقار؛ وترسل الرسالة من الخادم حتى لا يظهر رمز البوت في ملفات المتصفح.

أضف `TELEGRAM_BOT_TOKEN` كمتغير سري في إعدادات Vercel، وأضف `TELEGRAM_CHAT_ID` و`FIREBASE_PROJECT_ID` و`VITE_FIREBASE_API_KEY` للبيئات التي ستنشرها. يجب أن يكون البوت عضواً في القناة ومسموحاً له بالنشر. الرمز الذي سبق إرساله في المحادثة ينبغي إلغاؤه وإصدار بديل عبر BotFather، ثم حفظ البديل مباشرة في Vercel؛ لا تضعه في الكود أو GitHub.

أمر `pnpm dev` يشغّل الواجهة فقط؛ لاختبار مسار `/api` محلياً استخدم Vercel CLI (`vercel dev`) بعد ضبط المتغيرات.

## تهيئة دخول موظف

يحوّل النموذج رقم الجوال إلى بريد دخول بصيغة `<الأرقام>@durrat.internal`؛ مثلاً `0539000650` يصبح `0539000650@durrat.internal`. يجب تفعيل Email/Password في Firebase Authentication، ثم إنشاء المستخدم من Firebase Console. بعد نسخ Auth UID، أنشئ في Firestore وثيقة `employees/{Auth UID}` تحتوي `displayName` و`phone` و`role` و`active`. يجب أن تكون `active` هي القيمة المنطقية `true` وأن يكون `role` إحدى `employee` أو `super_admin`. لا ترسل كلمة المرور أو مفاتيح Firebase عبر المحادثة أو تضعها في ملفات Git.

## إدارة الموظفين

يرى المسؤول العام (`super_admin`) زر "إدارة الموظفين" في الصفحة الرئيسية. يمكنه إضافة موظف جديد (يُنشأ له حساب دخول عبر `api/employees.ts`)، وتعديل الاسم الظاهر، وحذف الصلاحية. يُخزَّن اسم الموظف ورقم جواله مع كل عقار ينشره، ويوجه زر واتساب في العقار إلى رقمه.

كلمات المرور لا تُحفظ في Firestore أو في الكود. تغيير كلمة مرور موظف موجود أو حذف حساب دخوله من Firebase Authentication يحتاج Firebase Admin، وهو غير مفعّل في هذا المشروع؛ حذف الموظف من القائمة يلغي صلاحياته فوراً لأن الموقع وقواعد Firestore تتحقق من وثيقته.

بيانات المالك (الاسم والجوال) تُخزَّن في مجموعة `property_owners` وتقرؤها الإدارة والموظفون المسجلون فقط.

## حدود النسخة

إشعار تيليجرام يستخدم Vercel Function مستقلة، ولا يتطلب Firebase Admin private key؛ يتحقق من هوية الموظف عبر Firebase ويقرأ وثائقه باستخدام قواعد Firestore الحالية. الدالتان المشتركتان للتحقق موجودتان في `server/staff-auth.ts`.
