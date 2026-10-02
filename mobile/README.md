# تطبيق يوني هوم — Android

تطبيق Capacitor 8 يفتح https://unihome.up.railway.app داخل WebView، باسم «يوني هوم» ومعرّف `app.unihome.mobile`. يحتاج اتصال إنترنت ويعرض صفحة عربية عند تعذّر تحميل الموقع. يظل تسجيل الدخول والبيانات على خادم Railway؛ لا تُنسخ ملفات `.env.local` أو مفاتيح الخادم إلى التطبيق.

## البناء على Windows

ثبّت Android Studio وAndroid SDK Platform 36 وBuild Tools 35، واستخدم JDK 21. Java 25 المرفقة ببعض إصدارات Android Studio لا تتوافق مع Gradle 8.14.3 المستخدم هنا. قد ينزّل Gradle حزم SDK الناقصة إذا كانت رخصها مقبولة.

```powershell
cd mobile
npm.cmd ci
# إذا لم تكن Java 21 موجودة في مسار UniHome المحلي:
$env:JAVA_HOME = 'C:\path\to\jdk-21'
npm.cmd run apk
```

النتيجة في `dist/unihome-debug.apk`، موقّعة بمفتاح debug للتجربة والتثبيت المباشر. نشر إصدار على المتجر يحتاج بناء release وتوقيعًا خاصًا.

لفتح المشروع في Android Studio: `npm.cmd run open`. اختر JDK 21 ضمن إعدادات Gradle.

لتغيير الدومين عدّل `server.url` في `capacitor.config.json` وروابط الموقع في `www/index.html` و`www/offline.html`، ثم أعد البناء. تعديلات واجهة الموقع المنشورة تظهر داخل التطبيق عند تحميلها دون إعادة بناء APK.

هذا غلاف للموقع المنشور لأن المشروع يستخدم Next.js cookies وAPI وقاعدة بيانات ولا يمكن تصديره كاملًا كملفات ثابتة. تصف وثائق Capacitor خيار `server.url` باعتباره مخصصًا للتطوير؛ هذه النسخة مخصصة للتجربة كغلاف متصل بالموقع، وتحتاج مراجعة بنية التوزيع قبل نشرها للمتاجر. لا تتضمن دمج إشعارات Android الأصلية؛ إشعارات Web Push الحالية لا تعني وجود إشعارات أصلية داخل WebView.

المراجع: [إعدادات Capacitor](https://capacitorjs.com/docs/config)، [متطلبات البيئة](https://capacitorjs.com/docs/getting-started/environment-setup).
