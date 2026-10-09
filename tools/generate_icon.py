# -*- coding: utf-8 -*-
"""Routina Weave 圖示：從 432943.jpg 的設計稿產出所有尺寸（作法同 routina-tone/tools/generate_icon.py）。

設計稿下方的「Weave」手寫字樣刻意不要：launcher 本來就會在圖示下面印 App 名稱，
48dp 下手寫體會糊成一團。

自適應圖示的前景必須落在 66dp 安全圈內，縮放依據是圖案**實際著墨處的最小外接圓**，
不是外框矩形。

產出：
- Android 自適應圖示的前景與主題（單色）圖層
- Hub 名冊用的 icons/weave.png（144×144）
- 網頁的 favicon 與 apple-touch-icon
"""
import math
from PIL import Image, ImageDraw

# 設計稿原檔（不進版控，重做圖示時要用）
SRC = r"C:/Users/User/Downloads/432943.jpg"
ROOT = r"C:/Users/User/Desktop/SideProject/routina-weave"
RES = ROOT + "/android/app/src/main/res"
PUBLIC = ROOT + "/public"
HUB_ICON = r"C:/Users/User/Desktop/SideProject/routina/icons/weave.png"

CREAM = (252, 248, 239)
# 圖形區（不含字樣），量自設計稿：圖形在 x 261..1004、y 248..886，字樣從 y 889 開始
FIG = (240, 230, 1025, 888)

SS = 4  # 超取樣，邊緣才不會鋸齒


def load_art():
    """裁出圖形、把奶油底去掉，邊緣留半透明"""
    im = Image.open(SRC).convert("RGB").crop(FIG)
    w, h = im.size
    src = im.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            d = max(abs(p[0] - CREAM[0]), abs(p[1] - CREAM[1]), abs(p[2] - CREAM[2]))
            if d <= 10:
                continue
            a = 255 if d >= 40 else int(255 * (d - 10) / 30)
            dst[x, y] = (p[0], p[1], p[2], a)
    return out.crop(out.getbbox())


def enclosing_circle(img):
    """著墨處的最小外接圓。候選圓心在格點上掃一遍就夠準了"""
    w, h = img.size
    a = img.load()
    pts = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if a[x, y][3] > 96]
    best = None
    cx0, cy0 = w / 2, h / 2
    step = max(w, h) / 16.0
    while step > 0.5:
        improved = False
        for dx in (-step, 0, step):
            for dy in (-step, 0, step):
                cx, cy = cx0 + dx, cy0 + dy
                r = max(math.hypot(x - cx, y - cy) for x, y in pts)
                if best is None or r < best[0] - 1e-6:
                    best, cx0, cy0 = (r, cx, cy), cx, cy
                    improved = True
        if not improved:
            step /= 2
    return best[0], cx0, cy0


def place(art, big, art_diameter_ratio):
    """把圖案縮放到外接圓直徑佔畫布的比例，圓心對齊畫布中心"""
    r, cx, cy = CIRCLE
    scale = (big * art_diameter_ratio / 2.0) / r
    w, h = art.size
    small = art.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return small, (round(big / 2 - cx * scale), round(big / 2 - cy * scale))


def render(art, size, art_diameter_ratio, bg, out_path):
    big = size * SS
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    if bg is not None:
        ImageDraw.Draw(canvas).rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=bg)
    small, pos = place(art, big, art_diameter_ratio)
    canvas.alpha_composite(small, pos)
    canvas.resize((size, size), Image.LANCZOS).save(out_path)


def render_mono(art, size, art_diameter_ratio, out_path):
    """主題圖示：只取形狀填黑，系統再依桌布上色"""
    big = size * SS
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    small, pos = place(art, big, art_diameter_ratio)
    black = Image.new("RGBA", small.size, (0, 0, 0, 255))
    black.putalpha(small.getchannel("A"))
    canvas.alpha_composite(black, pos)
    canvas.resize((size, size), Image.LANCZOS).save(out_path)


ART = load_art()
CIRCLE = enclosing_circle(ART)
print("art size", ART.size, " 外接圓 r=%.1f 圓心=(%.1f, %.1f)" % CIRCLE)

# 自適應前景：432px = 108dp，安全圈 66dp -> 直徑佔 66/108
SAFE = 66.0 / 108.0
render(ART, 432, SAFE, None, RES + "/drawable/ic_launcher_foreground.png")
render_mono(ART, 432, SAFE, RES + "/drawable/ic_launcher_monochrome.png")

# 自己帶底色、沒有遮罩的場合，圖案可以大一點
FULL = 0.80
render(ART, 144, FULL, CREAM + (255,), HUB_ICON)
render(ART, 192, FULL, CREAM + (255,), PUBLIC + "/icon-192.png")
render(ART, 180, FULL, CREAM + (255,), PUBLIC + "/apple-touch-icon.png")
print("icons written")
