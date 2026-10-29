# -*- coding: utf-8 -*-
# 生成校园资讯轮播图（本地生成，不花图片生成额度）
# 用法：用 fnart 环境的 python 运行本脚本，输出到 student-end/images/
import os
from PIL import Image, ImageDraw, ImageFont

FONT = "C:/Windows/Fonts/msyhbd.ttc"   # 微软雅黑 Bold
FONT_R = "C:/Windows/Fonts/msyh.ttc"   # 微软雅黑 Regular
if not os.path.exists(FONT):
    FONT = "C:/Windows/Fonts/simhei.ttf"
    FONT_R = FONT

W, H = 750, 420

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make_banner(path, c1, c2, tag, title, subtitle):
    base = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(base)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp(c1, c2, y / H))

    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    # 装饰圆
    od.ellipse([W - 300, -160, W + 60, 200], fill=(255, 255, 255, 34))
    od.ellipse([W - 120, 40, W + 160, 320], fill=(255, 255, 255, 22))
    od.ellipse([-120, H - 220, 160, H + 60], fill=(255, 255, 255, 26))
    # 左侧暗色渐变（保证白字可读）
    for x in range(0, int(W * 0.62)):
        a = int(80 * (1 - x / (W * 0.62)))
        od.line([(x, 0), (x, H)], fill=(0, 0, 0, a))
    base = Image.alpha_composite(base.convert("RGBA"), ov).convert("RGB")

    d = ImageDraw.Draw(base)
    f_tag = ImageFont.truetype(FONT, 26)
    f_title = ImageFont.truetype(FONT, 50)
    f_sub = ImageFont.truetype(FONT_R, 28)

    # 标签药丸
    tag_w = d.textlength(tag, font=f_tag)
    px, py = 56, 150
    d.rounded_rectangle([px, py, px + tag_w + 40, py + 50], radius=25, fill=(255, 255, 255, 230))
    d.text((px + 20, py + 9), tag, font=f_tag, fill=(214, 51, 132))

    # 标题 + 副标题
    d.text((56, 220), title, font=f_title, fill=(255, 255, 255))
    d.text((58, 292), subtitle, font=f_sub, fill=(255, 255, 255, 235))

    base.save(path, "PNG")
    print("saved", path)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "student-end", "images")
os.makedirs(out, exist_ok=True)
out = os.path.abspath(out)

make_banner(os.path.join(out, "news1.png"), (255, 96, 162), (255, 176, 206),
            "开学季", "2026 级新生开学典礼", "10 月 8 日 · 校体育馆")
make_banner(os.path.join(out, "news2.png"), (126, 92, 230), (255, 120, 180),
            "技能大赛", "信息工程学院技能大赛", "报名开启 · 截止 10 月 20 日")
make_banner(os.path.join(out, "news3.png"), (255, 122, 92), (255, 108, 170),
            "图书馆", "国庆后开放时间调整", "10 月 1 日起执行")
print("done ->", out)
