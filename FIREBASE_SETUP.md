# 🔥 Firebase Setup — IELTS Speaking Pro

Saytga akkaunt tizimi (Kirish / Ro'yxatdan o'tish / Parolni tiklash) va bulutli
sinxronizatsiya (Firestore) ulangan. Quyidagi 5 qadamni bajaribsiz, hammasi ishlaydi.

---

## 1. Firebase loyiha yaratish

1. https://console.firebase.google.com ga o'ting va Google akkaunt bilan kiring.
2. **Add project** → nom: `ielts-speaking-pro` (istalgan nom) → davom eting.
3. Google Analytics kerak emas — o'chirib qo'ysangiz ham bo'ladi.

## 2. Authentication'ni yoqish (Email + Parol)

1. Chap menyu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → **Enable** → Save.
3. **Settings → Authorized domains**: bu yerda saytingiz domaini turishi kerak.
   - `localhost` avtomatik bor.
   - Vercel'da chiqqan domainni qo'shing (masalan `ielts-speaking.vercel.app` yoki o'z domainingiz).

## 3. Firestore Database yaratish

1. Chap menyu: **Build → Firestore Database → Create database**.
2. **Production mode** tanlang.
3. Region: O'zbekiston uchun `eur3 (europe-west)` yoki `nam5` — tezkorini tanlang.

## 4. Security Rules'ni joylash (MUHIM ❗)

1. Firestore Database → **Rules** tab.
2. Loyihadagi **`firestore.rules`** fayli mazmunini nusxalab, shu yerga joylashtiring.
3. **Publish** bosing.

Rules nimani qiladi:

| Amal | Ruxsat |
| --- | --- |
| `users/{uid}` o'qish | Faqat o'z egasi (`request.auth.uid == uid`) |
| `users/{uid}` yozish | Faqat o'z egasi + maydonlar sanitariyasi |
| Boshqa hamma yo'llar | To'liq taqiqlangan (`allow: if false`) |

Demak hech kim boshqa foydalanuvchining Mock natijalari, streak yoki audio tarixini
o'qiy olmaydi.

## 5. Kalitlarni saytga joylash

1. Project **⚙ Settings → General → Your apps → Web app (`</>`)** → app yarating
   (Firebase Hosting kerak emas — Vercel'da turibdi).
2. Berilgan `firebaseConfig` obyektidagi qiymatlarni nusxalang.
3. Loyihada **`js/app.js`** faylining boshidagi `FIREBASE_CONFIG` ni to'ldiring:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",              // <- shu yerlarga
  authDomain:        "app.firebaseapp.com",
  projectId:         "ielts-speaking-pro",
  storageBucket:     "app.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234:web:abcd"
};
```

4. O'zgarishni commit qilib Vercel'ga deploy qiling.

> ⚠️ `apiKey` maxfiy kalit EMAS — Firebase Web API key brauzerda ochiq turadi,
> xavfsizlik Firestore Rules bilan ta'minlanadi. Lekin uni hech kimga admin
> huquq bergicha tarqatmang.

---

## Qanday ishlaydi (qisqacha)

- **Ro'yxatdan o'tish**: Email+parol → `users/{uid}` hujjati yaratiladi.
- **Sinxron**: Mock natijalari, Mock tarixi, Daily streak/darslar, tugallangan
  dars raqami va audio yozuvlar tarixi `users/{uid}.data` maydonida saqlanadi.
- **Ko'chirish**: Ro'yxatdan o'tishdan OLDIN saytda yig'ilgan natijalar (mehmon
  rejimida localStorage'da turgan bo'lsa) birinchi kirishda avtomatik bulutga
  ko'chiriladi.
- **Boshqa qurilma**: Shu akkaunt bilan kirsa — natijalar real vaqtda yuklanadi
  (`onSnapshot`), internet kelganda o'zgarishlar qayta sinxronlanadi.
- **Himoya**: Mock boshlash, Daily yakunlash/skip, progressni resetlash — faqat
  login qilganlar uchun. Mavzular (Part 1/2/3) login siz ham ochiq.

## Tekshirish ro'yxati (deploy'dan keyin)

- [ ] Ro'yxatdan o'tish ishlaydi, header'da ism + Chiqish chiqyapti
- [ ] Mock topshirilsa — Firebase Console → Firestore → `users` kolleksiyasida hujjat paydo bo'ldi
- [ ] Boshqa brauzerdan shu akkauntga kirsam — natijalar ko'rinyapti
- [ ] Chiqib, boshqa akkauntga kirsa — o'z natijalarim ko'rinyapti, begona emas
- [ ] "Parolni unutdingizmi?" — email kelardi
- [ ] Firestore Rules → "Rules playground"da boshqa uid bilan `get /users/{boshqa-uid}` → **Deny**

## Muammolar

| Muammo | Yechim |
| --- | --- |
| `auth/operation-not-allowed` | 2-qadam: Email/Password yoqilmagan |
| `permission-denied` (yozishda) | 4-qadam: Rules joylanmagan yoki eski |
| Kirganda natijalar yuklanmaydi | Console'da `[Cloud]` xatolarini ko'ring; domain Authorized domains'dami? |
| `Firebase: not configured` | 5-qadam: `FIREBASE_CONFIG` hali PASTE_ holatda |
