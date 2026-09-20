# IELTS Speaking Pro — Eagle 9 (Uzbekistan)

IELTS Speaking uchun tayyorgarlik platformasi: Part 1 / Part 2 / Part 3 mavzular banki,
Best Answer (Band 8-9) namunalari, audio (AI ovoz), Mock Speaking va 20' Daily dars.

**Uchta ko'rinishda ishlaydi:**

| Ko'rinish | Kim uchun | Qanday |
| --- | --- | --- |
| **Sayt** | Noutbuk / kompyuter | Vercel'ga deploy qilinadi, brauzerda ochiladi |
| **PWA ilova** | Telefon va noutbuk | Saytdan "Ilovani o'rnatish" — alohida dastur kabi ochiladi, mavzular oflayn ishlaydi |
| **Android / iOS** | Play Store, App Store | Capacitor qobig'i (`android/`, `ios/`) |

### Oflayn qoidasi

- **Oflayn ishlaydi:** Part 1 / Part 2 / Part 3 mavzulari, Best Answer'lar, cue card'lar,
  20' Daily dars, AI ovoz (qurilma o'zining nutq sintezi), mavzu ichidagi yozib olish.
- **Internet talab qiladi:** Mock Speaking (natijalar bulutga yoziladi), akkauntga kirish,
  progressni qurilmalar o'rtasida sinxronlash.

Internet uzilsa sahifa tepasida sariq chiziq chiqadi, Mock tugmasi vaqtincha o'chadi,
mavzular esa odatdagidek ochilaveradi.

## Fayllar

| Fayl | Vazifasi |
| --- | --- |
| `index.html` | Asosiy sahifa (Vercel'ga shu chiqadi) |
| `manifest.webmanifest` | PWA manifesti — ilova nomi, ikonkalar, shortcut'lar |
| `sw.js` | Service worker — oflayn cache (Firebase hech qachon cache'lanmaydi) |
| `offline.html` | Ilova hali yuklanmaganda ko'rsatiladigan zaxira sahifa |
| `js/pwa.js` | O'rnatish tugmasi, oflayn holat, yangilanish, Capacitor integratsiyasi |
| `js/data.js` | Savollar banki (Part 1: 38 mavzu, Part 2: 80 cue card, Part 3: 42 mavzu) |
| `js/app.js` | Sayt logikasi: qidiruv, modal, audio, mock, daily |
| `css/app.css` | Build natijasi — **qo'lda tahrirlamang** (`tools/build-css.sh` yaratadi) |
| `css/account.css`, `css/pwa.css` | Qo'lda yoziladigan stillar (build vaqtida app.css ga qo'shiladi) |
| `vendor/`, `assets/fonts/` | Lucide ikonkalari va shriftlar — oflayn uchun loyiha ichida |
| `assets/logo.svg` | Brend logosi — vektor manba (`tools/make-logo.mjs` yaratadi) |
| `assets/logo-mark.svg` | Faqat mikrofon belgisi (kichik o'lchamlar uchun) |
| `assets/icons/` | PWA / Android / iOS ikonkalari (`tools/build-icons.mjs` yaratadi) |
| `standalone.html` | Hammasi bitta faylda — ulashish uchun (`tools/build-standalone.py`) |
| `admin.html`, `js/admin.js` | Admin panel (mavzu qo'shish/tahrirlash, import/export) |
| `capacitor.config.json` | Android/iOS qobig'i sozlamalari |
| `android/`, `ios/` | Native loyihalar (Android Studio / Xcode bilan ochiladi) |

## Build

```bash
npm install          # bir marta

npm run build:css    # css/app.css (Tailwind + account.css + pwa.css)
npm run build:logo   # assets/logo.svg — brend logosi
npm run build:icons  # assets/icons/ — logodan PWA ikonkalari
npm run test         # testlar
npm run serve        # http://localhost:8000
```

### Logoni o'zgartirish

Logo `tools/make-logo.mjs` ichida kod bilan chiziladi (matn vektor yo'llarga
aylantiriladi, shrift o'rnatilgan bo'lishi shart emas). Rang yoki shaklni
o'zgartirgach, quyidagilarni ketma-ket ishga tushiring:

```bash
npm run build:logo            # assets/logo.svg + logo-mark.svg
npm run build:icons           # PWA ikonkalari
npm run build:native-assets   # Android/iOS ikonka va splash ekranlari
npm run build:standalone      # standalone.html
```

`index.html`, `js/*.js` yoki CSS'ni o'zgartirsangiz `npm run build:css` ni ishlating —
`css/app.css` build natijasi, uni qo'lda tahrirlash bekor bo'ladi.

### Yangi versiyani chiqarish

Service worker cache'ini yangilash uchun `sw.js` ichidagi `VERSION` ni oshiring
(masalan `v1.0.0` → `v1.0.1`). Foydalanuvchilarga "yangi versiya tayyor" degan
bildirishnoma chiqadi.

## Android va iOS ilovalari

Native loyihalar Capacitor bilan yig'ilgan. Veb kodi `www/` ga ko'chiriladi
(bu papka git'ga kirmaydi, har safar qayta yaratiladi).

```bash
npm run build:app                      # www/ ni tayyorlaydi
npx cap sync                           # www/ ni android/ va ios/ ga ko'chiradi
npm run build:native-assets            # ikonka va splash ekranlar

npm run android                        # Android Studio'da ochadi
npm run ios                            # Xcode'da ochadi (Mac kerak)
```

**Kerakli dasturlar:** Android uchun — Android Studio va JDK 17.
iOS uchun — Mac, Xcode va CocoaPods (`sudo gem install cocoapods`, so'ng
`cd ios/App && pod install`).

### Play Store uchun

1. Android Studio'da **Build → Generate Signed Bundle / APK → Android App Bundle**.
2. Keystore yarating va **xavfsiz saqlang** — yo'qotsangiz ilovani yangilay olmaysiz.
3. `android/app/build.gradle` da `versionCode` (butun son) va `versionName` ni oshiring.
4. Hosil bo'lgan `.aab` faylni Play Console'ga yuklang.
5. Play Console mikrofon ruxsati haqida so'raydi: Mock Speaking javoblarini yozib olish uchun.

### App Store uchun

1. Xcode'da **Signing & Capabilities** da o'z Apple Developer jamoangizni tanlang.
2. `Product → Archive`, so'ng **Distribute App** orqali App Store Connect'ga yuboring.
3. Apple Developer Program a'zoligi yiliga $99 turadi.

Ilova identifikatori: `uz.eagle9.ieltsspeaking` (`capacitor.config.json` da).

## Asosiy funksiyalar

- **Mock Speaking** — 11 savol (6 × Part 1, 1 × Part 2 cue card, 4 × Part 3).
  - Savol AI ovozida o'qiladi, javob mikrofonda yozib olinadi.
  - **Best Answer mock davomida yopiq** — mock topshirilgandan keyin ochiladi.
  - Natijada **har bir bo'lim (Part 1 / Part 2 / Part 3) alohida ro'yxat**:
    savol + sizning audio javobingiz + Best Answer + tip.
  - Baholash: Fluency, Lexical, Grammar, Pronunciation (0.5 qadam bilan), hisobotni `.txt` yuklab olish mumkin.
- **20' Daily dars** — 20 daqiqalik taymer; **Restart (↻ Qayta)** joriy darsni 20:00 dan
  qaytadan boshlaydi, **01** tugmasi butun progressni noldan boshlaydi.
- **Audio** — ikki AI ovoz (Dilnoza / Jasur), tezlik sozlanadi; barcha sanoq
  ko'rsatkichlari (mavzu/savol/Best Answer soni) `js/data.js` dan avtomatik hisoblanadi.

## Firebase akkaunt tizimini ulash

1. Firebase Console’da loyiha va **Web app** yarating. `index.html` ichidagi
   `window.FIREBASE_CONFIG` ga shu ilovaning `apiKey`, `authDomain`, `projectId`,
   `appId` qiymatlarini yozing. Bular ochiq frontend konfiguratsiyasi; **service account
   yoki private key joylamang**.
2. Authentication → Sign-in method → **Email/Password** ni yoqing.
   Settings → Authorized domains ga saytingiz domenini (test uchun preview domenini ham)
   qo‘shing. **Android/iOS ilovasi uchun** shu ro‘yxatga `localhost` ni ham qo‘shing —
   Capacitor veb qismini `https://localhost` origin ostida ochadi. Password reset xati shablonini Authentication → Templates’da sozlang.
3. Firestore Database yarating (production mode). `firestore.rules` ni Console → Rules
   orqali publish qiling yoki Firebase CLI bilan:
   `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
4. Saytni HTTPS orqali oching. Email/parol ro‘yxatdan o‘tishi, kirish, parolni tiklash
   va chiqishni tekshiring. Firebase konfiguratsiyasi bo‘sh bo‘lsa mavzular ochiq qoladi,
   lekin login/bulutga saqlash ishlamaydi va modalda tushuntirish chiqadi.

### Saqlash va maxfiylik

- Progress `users/{uid}/progress/{key}` hujjatlarida saqlanadi, `onSnapshot` orqali
  boshqa qurilmadan ham olinadi. Brauzerda mavzu/dizayn/ovoz sozlamalari o‘zgarishsiz qoladi.
- Mock tarixi, javoblar metama’lumotlari, Daily tarixi, streak, dars raqami, Daily’da
  tugallangan mavzu ID’lari va `recs_*` audio tarixi foydalanuvchiga bog‘langan.
- Eski localStorage natijalari avtomatik ravishda birinchi kirgan odamga berilmaydi:
  akkaunt nomini bosib **Shu qurilmadagi eski natijalarni ko‘chirish** orqali tasdiqlanadi.
  Faqat bulutda yo‘q bo‘limlar ko‘chadi; mavjud bulut ma’lumotlari almashtirilmaydi.
  Eski qurilma nusxasi o‘chirilmaydi.
- Avvalgi kod audio fayllarini localStorage’da saqlamagan, faqat sana/savol/hajm kabi
  metama’lumotlarni saqlagan. Ushbu tarix akkaunt modalida ko‘rinadi. Audio **fayllari**
  qurilmalararo ko‘chirilmaydi (buning uchun alohida Firebase Storage kerak).
- Mehmonlar barcha mavzu va mashqlarni ochishi mumkin; natija saqlash login talab qiladi.
  Hisob almashtirilganda joriy sessiya va audio tozalanadi. Bulutga yozish xatosi yashirilmaydi;
  qayta ulanish/sahifani yangilash talab qilinadi. Offline saqlash kafolatlanmaydi.
- Bir bo‘lim bir vaqtda ikki qurilmadan tahrirlansa, oxirgi yozuv ustun keladi.
- `standalone.html` offline nusxasi ataylab qayta yig‘ilmadi; yangi akkaunt tizimi
  `index.html` orqali ishlaydi.

### Tekshirish ro‘yxati

- Ikki alohida akkaunt: A’da Mock/Daily saqlang, B’da ular ko‘rinmasligini tekshiring.
- A bilan boshqa brauzer/qurilmadan kirib natijalarni va audio metama’lumotlarini tekshiring.
- Chiqib, Part 1/2/3 ochilishini va saqlash login modalini ochishini tekshiring.
- Parol tiklash xatini oling; noto‘g‘ri parol va uzilgan internet holatlarini tekshiring.
- Firestore Rules Playground’da anonim va boshqa UID bilan read/write rad etilishi,
  o‘z UID bilan ruxsat berilishi, noma’lum kalit/ortiqcha maydon rad etilishini tekshiring.
