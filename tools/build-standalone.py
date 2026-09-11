#!/usr/bin/env python3
"""index.html -> standalone.html (bitta faylga yig'ilgan versiya).

Ishlatish:
    python3 tools/build-standalone.py

Nima qiladi:
  * css/app.css ni <style> ichiga joylaydi
  * js/data.js va js/app.js ni <script> ichiga joylaydi
  * assets/logo.png ni base64 data URL ga aylantiradi
  * boshqa barcha narsa (masalan pravatar rasmlari) o'z holida qoladi

Avval Tailwind CSS ni yangilab oling:
    npx tailwindcss -i input.css -o css/app.css --minify
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
OUT = ROOT / "standalone.html"


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    html = read(SRC)
    css = read(ROOT / "css" / "app.css")
    data_js = read(ROOT / "js" / "data.js")
    app_js = read(ROOT / "js" / "app.js")

    if "</script" in data_js or "</script" in app_js:
        print("XATO: js fayllarda </script> uchraydi — inline qilish xavfli.", file=sys.stderr)
        return 1

    # 1) Tailwind CSS inline
    if '<link rel="stylesheet" href="css/app.css">' not in html:
        print("XATO: css/app.css havolasi topilmadi.", file=sys.stderr)
        return 1
    html = html.replace(
        '<link rel="stylesheet" href="css/app.css">',
        "<style>\n" + css + "\n</style>",
        1,
    )

    # 2) logo.png -> data URL
    logo = (ROOT / "assets" / "logo.png").read_bytes()
    logo_url = "data:image/png;base64," + base64.b64encode(logo).decode("ascii")
    html = html.replace('href="assets/logo.png"', f'href="{logo_url}"')
    html = html.replace('src="assets/logo.png"', f'src="{logo_url}"')

    # 3) JS inline
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

    leftovers = re.findall(r'(?:src|href)="(js/[^"]+|css/[^"]+|assets/[^"]+)"', html)
    if leftovers:
        print("Diqqat: inline qilinmagan fayllar qoldi: " + ", ".join(sorted(set(leftovers))), file=sys.stderr)

    OUT.write_text(html, encoding="utf-8")
    print(f"standalone.html yangilandi: {OUT.stat().st_size/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
