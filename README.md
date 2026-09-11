# IELTS Speaking Pro — Eagle 9 (Uzbekistan)

IELTS Speaking uchun tayyorgarlik sayti: Part 1 / Part 2 / Part 3 mavzular banki,
Best Answer (Band 8-9) namunalari, audio (AI ovoz), Mock Speaking va 20' Daily dars.

## Fayllar

| Fayl | Vazifasi |
| --- | --- |
| `index.html` | Asosiy sahifa (Vercel'ga shu chiqadi) |
| `standalone.html` | Hammasi bitta faylda (CSS + JS ichida) — offline/ulashish uchun |
| `js/data.js` | Savollar banki (Part 1: 38 mavzu, Part 2: 80 cue card, Part 3: 42 mavzu) |
| `js/app.js` | Sayt logikasi: qidiruv, modal, audio, mock, daily + **Firebase auth & bulut sinxronizatsiya** |
| `css/app.css` | Tailwind CSS (build qilinadi) |
| `admin.html`, `js/admin.js` | Admin panel (mavzu qo'shish/tahrirlash, import/export) |
| `firestore.rules` | Firestore Security Rules — har bir foydalanuvchi faqat o'z ma'lumotini ko'radi |
| `FIREBASE_SETUP.md` | Firebase akkaunt tizimini ulash bo'yicha qadam-baqadam yo'riqnoma |
| `tools/build-standalone.py` | `standalone.html` ni qayta yig'adi |

## Build

```bash
# 1) Tailwind CSS ni yangilash (yangi class qo'shsangiz)
npx tailwindcss -i input.css -o css/app.css --minify

# 2) standalone.html ni qayta yig'ish
python3 tools/build-standalone.py
```

## Asosiy funksiyalar

- **Akkaunt tizimi (Firebase)** — Email+parol bilan Kirish / Ro'yxatdan o'tish,
  "Parolni unutdim" tiklash. Mock natijalari, Daily streak, tugallangan darslar va
  audio yozuvlar tarixi Firestore'da har bir foydalanuvchining `uid`'iga bog'lab
  saqlanadi — boshqa qurilmadan kirsa ham natijalar ko'rinadi. Mavzular login siz
  ham ochiq; natija saqlash uchun akkaunt kerak. Sozlash: `FIREBASE_SETUP.md`.
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
