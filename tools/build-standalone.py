#!/usr/bin/env python3
"""index.html -> standalone.html (bitta faylga yig'ilgan versiya).

Ishlatish:
    python3 tools/build-standalone.py

Nima qiladi:
  * css/app.css va assets/fonts/fonts.css ni <style> ichiga joylaydi
  * shriftlarni (woff2) base64 data URL ga aylantiradi
  * vendor/lucide.min.js, js/data.js, js/app.js ni <script> ichiga joylaydi
  * ikonka va avatar rasmlarini base64 data URL ga aylantiradi
  * PWA qismlarini (manifest, service worker, o'rnatish tugmasi) olib tashlaydi —
    bitta fayl sifatida ular ishlamaydi va kerak ham emas

Avval Tailwind CSS ni yangilab oling:
    bash tools/build-css.sh
"""
import base64
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
OUT = ROOT / "standalone.html"


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def data_url(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> int:
    html = read(SRC)
    css = read(ROOT / "css" / "app.css")
    data_js = read(ROOT / "js" / "data.js")
    app_js = read(ROOT / "js" / "app.js")
    lucide_js = read(ROOT / "vendor" / "lucide.min.js")

    for name, src in (("data.js", data_js), ("app.js", app_js), ("lucide", lucide_js)):
        if "</script" in src:
            print(f"XATO: {name} ichida </script> uchraydi — inline qilish xavfli.", file=sys.stderr)
            return 1

    # --- 1) Shriftlar: fonts.css + woff2 fayllar data URL sifatida ---------
    fonts_css = read(ROOT / "assets" / "fonts" / "fonts.css")

    def inline_font(match: "re.Match[str]") -> str:
        rel = match.group(1)
        path = ROOT / "assets" / "fonts" / rel
        if not path.exists():
            print(f"Diqqat: shrift topilmadi: {rel}", file=sys.stderr)
            return match.group(0)
        return f"url('{data_url(path)}')"

    fonts_css = re.sub(r"url\('([^']+)'\)", inline_font, fonts_css)

    if '<link rel="stylesheet" href="assets/fonts/fonts.css">' not in html:
        print("XATO: assets/fonts/fonts.css havolasi topilmadi.", file=sys.stderr)
        return 1
    html = html.replace(
        '<link rel="stylesheet" href="assets/fonts/fonts.css">',
        "<style>\n" + fonts_css + "\n</style>",
        1,
    )

    # --- 2) Tailwind CSS inline -------------------------------------------
    if '<link rel="stylesheet" href="css/app.css">' not in html:
        print("XATO: css/app.css havolasi topilmadi.", file=sys.stderr)
        return 1
    html = html.replace(
        '<link rel="stylesheet" href="css/app.css">',
        "<style>\n" + css + "\n</style>",
        1,
    )

    # --- 3) PWA qismlarini olib tashlash ----------------------------------
    # Bitta faylda service worker / manifest ishlamaydi.
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', "")
    html = html.replace('<script src="js/pwa.js" defer></script>', "")
    # O'rnatish tugmalari va o'rnatish qo'llanmasi modali
    html = re.sub(
        r'\s*<button type="button" data-pwa-install.*?</button>',
        "",
        html,
        flags=re.DOTALL,
    )
    html = re.sub(
        r'\s*<!-- ILOVANI O\'RNATISH QO\'LLANMASI -->\s*<div id="pwaInstallHelp".*?</div>\s*(?=<script)',
        "\n",
        html,
        flags=re.DOTALL,
    )
    # Oflayn chizig'i: pwa.js bo'lmagani uchun hech qachon ko'rsatilmaydi
    html = re.sub(
        r'\s*<!-- OFLAYN HOLAT CHIZIG\'I -->\s*<div id="offlineBar".*?</div>',
        "",
        html,
        flags=re.DOTALL,
    )

    # --- 4) Rasmlarni data URL ga aylantirish -----------------------------
    for rel in sorted(set(re.findall(r'(?:src|href)="(assets/(?:icons|avatars)/[^"]+)"', html))):
        path = ROOT / rel
        if path.exists():
            html = html.replace(f'"{rel}"', f'"{data_url(path)}"')
        else:
            print(f"Diqqat: rasm topilmadi: {rel}", file=sys.stderr)

    # --- 5) JS inline ------------------------------------------------------
    html = html.replace(
        '<script src="vendor/lucide.min.js" defer></script>',
        "<script>\n" + lucide_js + "\n</script>",
        1,
    )
    html = html.replace(
        '<script src="js/data.js" defer></script>',
        "<script>\n" + data_js + "\n</script>",
        1,
    )
    html = html.replace(
        '<script src="js/app.js" defer></script>',
        "<script>\n" + app_js + "\n</script>",
        1,
    )

    leftovers = re.findall(r'(?:src|href)="((?:js|css|assets|vendor)/[^"]+)"', html)
    if leftovers:
        print(
            "Diqqat: inline qilinmagan fayllar qoldi: " + ", ".join(sorted(set(leftovers))),
            file=sys.stderr,
        )

    OUT.write_text(html, encoding="utf-8")
    print(f"standalone.html yangilandi: {OUT.stat().st_size/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
