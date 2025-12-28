from flask import Flask, request, jsonify, send_from_directory, Response, redirect
import os
from werkzeug.utils import secure_filename
from flask_cors import CORS
import logging
import json
from functools import wraps
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont

# === Admin Basic Auth ===
ADMIN_USER = os.environ.get("ADMIN_USER", "turkalkol")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "kamberoğlu")


def check_auth(username, password):
    return username == ADMIN_USER and password == ADMIN_PASS


def authenticate():
    return Response(
        "Yetkisiz erişim", 401,
        {"WWW-Authenticate": 'Basic realm="turkalkol admin"'}
    )


def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # OPTIONS isteği için auth kontrolü yapma
        if request.method == 'OPTIONS':
            return "", 204
            
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated


# === Logging ===
logging.basicConfig(level=logging.INFO)

# === Flask Uygulaması ===
app = Flask(__name__, static_folder="public", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

CORS(
    app,
    resources={r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type"],
        "supports_credentials": True  # ✅ Basic Auth için
    }}
)


@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = '*'
    
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, PUT, OPTIONS'
    response.headers['Access-Control-Max-Age'] = '3600'
    
    if request.method == 'OPTIONS':
        response.status_code = 204
    
    return response


# === Yol Ayarları ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "public", "images", "original")
WATERMARKED_FOLDER = os.path.join(BASE_DIR, "public", "images", "watermarked")
LIKES_FILE = os.path.join(BASE_DIR, "public", "likes.json")
LEADERBOARD_FILE = os.path.join(BASE_DIR, "public", "leaderboard.json") 

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(WATERMARKED_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "jpe"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# === Beğeni Dosyası ===
def load_likes():
    if os.path.exists(LIKES_FILE):
        try:
            with open(LIKES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_likes(likes_data):
    with open(LIKES_FILE, "w", encoding="utf-8") as f:
        json.dump(likes_data, f, ensure_ascii=False, indent=2)


# === Leaderboard Dosyası ===
def load_leaderboard():
    if os.path.exists(LEADERBOARD_FILE):
        try:
            with open(LEADERBOARD_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_leaderboard(data):
    with open(LEADERBOARD_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# === Sayfalar ===
@app.route("/")
def index_page():
    return send_from_directory("public", "index.html")


@app.route("/admin")
@requires_auth
def admin_page():
    return send_from_directory("public", "admin.html")


@app.route("/test")
def test():
    return jsonify({"status": "OK", "message": "CORS çalışıyor!"})


# === BOTTLE FLIP API ENDPOINTS ===

# Leaderboard Al (Public)
@app.route("/api/leaderboard", methods=["GET", "OPTIONS"])
def get_leaderboard():
    if request.method == "OPTIONS":
        return "", 204
    
    try:
        game_filter = request.args.get('game', '').lower()
        data = load_leaderboard()
        
        # Oyuna göre filtrele
        if game_filter:
            data = [entry for entry in data if entry.get('game', 'bottleflip').lower() == game_filter]
        
        sorted_data = sorted(data, key=lambda x: x.get("score", 0), reverse=True)
        return jsonify(sorted_data[:50])  
    except Exception as e:
        app.logger.error(f"Leaderboard okuma hatası: {e}")
        return jsonify([]), 200


# Skor Kaydet / Güncelle
@app.route("/api/leaderboard", methods=["POST", "OPTIONS"])
def update_leaderboard():
    if request.method == "OPTIONS":
        return "", 204
    
    try:
        req_data = request.get_json(silent=True) or {}
        username = (req_data.get("username") or "").strip()
        score = int(req_data.get("score", 0) or 0)

        if not username or len(username) < 2 or len(username) > 20:
            return jsonify({"error": "Geçersiz kullanıcı adı"}), 400

        if score < 0:
            return jsonify({"error": "Skor negatif olamaz"}), 400

        if score > 1_000_000:
            return jsonify({"error": "Skor çok büyük"}), 400

        stats = req_data.get("stats") or {}
        game_type = (req_data.get("game") or "bottleflip").lower()
        total_flips      = max(0, int(stats.get("totalFlips", 0) or 0))
        successful_flips = max(0, int(stats.get("successfulFlips", 0) or 0))
        longest_combo    = max(0, int(stats.get("longestCombo", 0) or 0))
        games_played     = max(0, int(stats.get("gamesPlayed", 0) or 0))

        leaderboard = load_leaderboard()
        
        user_entry = None
        for entry in leaderboard:
            if (entry.get("username") or "").lower() == username.lower() and entry.get("game", "bottleflip").lower() == game_type:
                user_entry = entry
                break
        
        now = datetime.now().isoformat()

        if user_entry:
            old_score = int(user_entry.get("score", 0) or 0)
            if score > old_score:
                user_entry["score"] = score

            user_entry["total_flips"]      = max(int(user_entry.get("total_flips", 0) or 0), total_flips)
            user_entry["successful_flips"] = max(int(user_entry.get("successful_flips", 0) or 0), successful_flips)
            user_entry["longest_combo"]    = max(int(user_entry.get("longest_combo", 0) or 0), longest_combo)
            user_entry["games_played"]     = max(int(user_entry.get("games_played", 0) or 0), games_played)

            user_entry["updated_at"] = now
            app.logger.info(f"🏆 Skor güncellendi: {username} ({game_type}) -> {user_entry['score']}")
        else:
            user_entry = {
                "username": username,
                "score": score,
                "game": game_type,
                "total_flips": total_flips,
                "successful_flips": successful_flips,
                "longest_combo": longest_combo,
                "games_played": games_played,
                "created_at": now,
                "updated_at": now,
            }
            leaderboard.append(user_entry)
            app.logger.info(f"✨ Yeni oyuncu: {username} ({game_type}) -> {score}")
        
        save_leaderboard(leaderboard)
        
        return jsonify({
            "success": True,
            "username": username,
            "score": user_entry["score"],
            "total_flips": user_entry["total_flips"],
            "successful_flips": user_entry["successful_flips"],
            "longest_combo": user_entry["longest_combo"],
            "games_played": user_entry["games_played"],
        })
        
    except Exception as e:
        app.logger.error(f"Leaderboard güncelleme hatası: {e}")
        return jsonify({"error": str(e)}), 500


# === ADMIN PANEL ENDPOINTLERİ ===

@app.route("/api/admin/leaderboard/<username>", methods=["DELETE", "OPTIONS"])
@requires_auth
def admin_delete_user(username):
    if request.method == "OPTIONS":
        return "", 204
    try:
        leaderboard = load_leaderboard()
        new_list = [
            u for u in leaderboard
            if u["username"].lower() != username.lower()
        ]
        if len(new_list) == len(leaderboard):
            return jsonify({"error": "Kullanıcı bulunamadı"}), 404

        save_leaderboard(new_list)
        return jsonify({"success": True})

    except Exception as e:
        app.logger.error(f"Silme hatası: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/leaderboard/<username>", methods=["PUT", "OPTIONS"])
@requires_auth
def admin_update_user(username):
    if request.method == "OPTIONS":
        return "", 204
    try:
        req = request.get_json(silent=True) or {}
        new_score = int(req.get("score", 0))
        if new_score < 0:
            return jsonify({"error": "Skor negatif olamaz"}), 400

        leaderboard = load_leaderboard()
        found = None

        for u in leaderboard:
            if u["username"].lower() == username.lower():
                found = u
                break

        if not found:
            return jsonify({"error": "Kullanıcı bulunamadı"}), 404

        found["score"] = new_score
        found["updated_at"] = datetime.now().isoformat()
        save_leaderboard(leaderboard)

        return jsonify({"success": True})

    except Exception as e:
        app.logger.error(f"Edit hatası: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/leaderboard/reset", methods=["POST", "OPTIONS"])
@requires_auth
def admin_reset_board():
    if request.method == "OPTIONS":
        return "", 204
    try:
        save_leaderboard([])
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# === Beğeni API ===
@app.route("/likes/<filename>", methods=["GET", "OPTIONS"])
def get_likes(filename):
    if request.method == "OPTIONS":
        return "", 204

    try:
        likes_data = load_likes()
        photo_likes = likes_data.get(filename, {"count": 0, "users": []})
        return jsonify(photo_likes)
    except Exception as e:
        app.logger.error(f"❌ Beğeni okuma hatası: {e}")
        return jsonify({"count": 0, "users": []}), 200


@app.route("/like/<filename>", methods=["POST", "OPTIONS"])
def toggle_like(filename):
    if request.method == "OPTIONS":
        return "", 204

    try:
        data = request.get_json(silent=True) or {}
        user_id = data.get("userId")

        if not user_id:
            return jsonify({"error": "userId gerekli"}), 400

        likes_data = load_likes()

        if filename not in likes_data:
            likes_data[filename] = {"count": 0, "users": []}

        photo_likes = likes_data[filename]

        if user_id in photo_likes["users"]:
            photo_likes["users"].remove(user_id)
            photo_likes["count"] = max(0, photo_likes["count"] - 1)
            action = "unliked"
        else:
            photo_likes["users"].append(user_id)
            photo_likes["count"] += 1
            action = "liked"

        likes_data[filename] = photo_likes
        save_likes(likes_data)

        return jsonify({
            "success": True,
            "action": action,
            "count": photo_likes["count"],
            "hasLiked": user_id in photo_likes["users"],
        })

    except Exception as e:
        app.logger.error(f"❌ Beğeni hatası: {e}")
        return jsonify({"error": str(e)}), 500


# === Upload + Watermark ===
@app.route("/upload", methods=["POST", "OPTIONS"])
@requires_auth
def upload_photo():
    if request.method == "OPTIONS":
        return "", 204

    app.logger.info("=== Upload İsteği Geldi ===")

    if "file" not in request.files:
        return jsonify({"error": "dosya yok"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "dosya seçilmedi"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "desteklenmeyen dosya türü"}), 400

    original_ext = file.filename.rsplit(".", 1)[1].lower()
    ext = original_ext
    if ext in {"heic", "heif", "jpe"}:
        ext = "jpg"

    base_name = os.path.splitext(secure_filename(file.filename))[0]
    filename = f"{base_name}.{ext}"

    original_path = os.path.join(UPLOAD_FOLDER, filename)
    watermarked_path = os.path.join(WATERMARKED_FOLDER, filename)

    try:
        if ext == "gif":
            data = file.read()
            with open(original_path, "wb") as f:
                f.write(data)
            with open(watermarked_path, "wb") as f:
                f.write(data)
            app.logger.info(f"🎞 GIF yüklendi: {filename}")
            return jsonify({"success": True, "file": filename})

        if original_ext in {"heic", "heif"}:
            try:
                import pillow_heif
                heif_data = file.read()
                heif_file = pillow_heif.read_heif(heif_data)
                img = Image.frombytes(heif_file.mode, heif_file.size, heif_file.data)
                img = img.convert("RGBA")
            except Exception as e:
                return jsonify({"error": f"HEIC/HEIF dönüştürülemedi: {e}"}), 500
        else:
            img = Image.open(file.stream).convert("RGBA")

        txt_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))

        font = None
        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ]
        for fp in font_paths:
            if os.path.exists(fp):
                font = ImageFont.truetype(fp, 44)
                break
        if not font:
            font = ImageFont.load_default()

        draw = ImageDraw.Draw(txt_layer)
        text = "turkalkol.com"

        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]

        x = img.width - tw - 40
        y = img.height - th - 30

        draw.text((x + 2, y + 2), text, font=font, fill=(0, 0, 0, 100))
        draw.text((x, y), text, font=font, fill=(255, 255, 255, 220))

        combined = Image.alpha_composite(img, txt_layer)

        img.convert("RGB").save(original_path, quality=95)
        combined.convert("RGB").save(watermarked_path, quality=95)

        app.logger.info(f"📸 Fotoğraf yüklendi: {filename}")
        return jsonify({"success": True, "file": filename})

    except Exception as e:
        app.logger.error(f"❌ Upload hatası: {str(e)}")
        import traceback
        app.logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# === Fotoğraf İşlemleri ===
@app.route("/count")
def count_photos():
    try:
        files = [
            f for f in os.listdir(WATERMARKED_FOLDER)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))
        ]
        return jsonify({"count": len(files)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/delete/<path:filename>", methods=["POST", "DELETE", "OPTIONS"])
@requires_auth
def delete_photo(filename):
    if request.method == "OPTIONS":
        return "", 204

    try:
        # Güvenlik için sadece dosya adını al, path traversal önle
        filename = os.path.basename(filename)
        
        original_path = os.path.join(UPLOAD_FOLDER, filename)
        watermarked_path = os.path.join(WATERMARKED_FOLDER, filename)

        likes_data = load_likes()
        if filename in likes_data:
            del likes_data[filename]
            save_likes(likes_data)

        deleted = False
        if os.path.exists(original_path):
            os.remove(original_path)
            deleted = True
        if os.path.exists(watermarked_path):
            os.remove(watermarked_path)
            deleted = True

        if deleted:
            app.logger.info(f"🗑️ Silindi: {filename}")
            return jsonify({"success": True})

        return jsonify({"error": "dosya bulunamadı"}), 404
    except Exception as e:
        app.logger.error(f"❌ Silme hatası: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/list", methods=["GET", "OPTIONS"])
def list_photos():
    if request.method == "OPTIONS":
        return "", 204

    try:
        if not os.path.exists(WATERMARKED_FOLDER):
            return jsonify([])

        files = [
            f for f in os.listdir(WATERMARKED_FOLDER)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))
        ]

        files = sorted(
            files,
            key=lambda x: os.path.getmtime(os.path.join(WATERMARKED_FOLDER, x)),
            reverse=True
        )

        return jsonify(files)

    except Exception as e:
        app.logger.error(f"❌ Liste hatası: {e}")
        return jsonify({"error": str(e)}), 500


# === Static Servis ===
# Admin panelin kullandığı /watermarked/ route'u
@app.route("/watermarked/<filename>")
def serve_watermarked_short(filename):
    return send_from_directory(WATERMARKED_FOLDER, filename)

@app.route("/images/watermarked/<filename>")
def serve_watermarked(filename):
    return send_from_directory(WATERMARKED_FOLDER, filename)

@app.route("/images/original/<filename>")
def serve_original(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route("/games/bottleflip")
def bottleflip_redirect():
    return redirect("/games/bottleflip/")

@app.route("/games/bottleflip/")
def bottleflip_index():
    return send_from_directory("public/games/bottleflip", "index.html")

@app.route("/games/2048")
def game_2048_redirect():
    return redirect("/games/2048/")

@app.route("/games/2048/")
def game_2048_index():
    return send_from_directory("public/games/2048", "index.html")

@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory("public", filename)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)