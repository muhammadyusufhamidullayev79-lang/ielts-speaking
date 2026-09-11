# IELTS Speaking Pro — Eagle 9 (Uzbekistan)

IELTS Speaking uchun tayyorgarlik sayti: Part 1 / Part 2 / Part 3 mavzular banki,
Best Answer (Band 8-9) namunalari, audio (AI ovoz), Mock Speaking va 20' Daily dars.

## Fayllar

| Fayl | Vazifasi |
| --- | --- |
| `index.html` | Asosiy sahifa (Vercel'ga shu chiqadi) |
| `standalone.html` | Hammasi bitta faylda (CSS + JS ichida) — offline/ulashish uchun |
| `js/data.js` | Savollar banki (Part 1: 38 mavzu, Part 2: 80 cue card, Part 3: 42 mavzu) |
| `js/app.js` | Sayt logikasi: qidiruv, modal, audio, mock, daily |
| `css/app.css` | Tailwind CSS (build qilinadi) |
| `admin.html`, `js/admin.js` | Admin panel (mavzu qo'shish/tahrirlash, import/export) |
| `tools/build-standalone.py` | `standalone.html` ni qayta yig'adi |

## Build

```bash
# 1) Tailwind CSS ni yangilash (yangi class qo'shsangiz)
npx tailwindcss -i input.css -o css/app.css --minify

# 2) standalone.html ni qayta yig'ish
python3 tools/build-standalone.py
```

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
   qo‘shing. Password reset xati shablonini Authentication → Templates’da sozlang.
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
