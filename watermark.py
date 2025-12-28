from PIL import Image, ImageDraw, ImageFont
import os

# === YOL AYARLARI ===
INPUT_DIR = "public/images/original"
OUTPUT_DIR = "public/images/watermarked"
FONT_PATH = "C:/Windows/Fonts/arial.ttf"  # Windows için garanti font yolu

# === WATERMARK AYARLARI ===
TEXT = "turkalkol.com"
FONT_SIZE = 44
COLOR = (255, 255, 255, 220)  # beyaz, hafif şeffaf
SHADOW = (0, 0, 0, 100)       # hafif gölge efekti

os.makedirs(OUTPUT_DIR, exist_ok=True)

for filename in os.listdir(INPUT_DIR):
    if not filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        continue

    path = os.path.join(INPUT_DIR, filename)
    img = Image.open(path).convert("RGBA")
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    draw = ImageDraw.Draw(img)

    # Yazının boyutunu bul
    bbox = draw.textbbox((0, 0), TEXT, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Pozisyon (sağ alt köşe)
    x = img.width - text_w - 40
    y = img.height - text_h - 30

    # Gölge
    draw.text((x+2, y+2), TEXT, font=font, fill=SHADOW)
    # Ana yazı
    draw.text((x, y), TEXT, font=font, fill=COLOR)

    # Kaydet
    output_path = os.path.join(OUTPUT_DIR, filename)
    img.convert("RGB").save(output_path, quality=95)
    print(f"✅ Watermarked: {filename}")
