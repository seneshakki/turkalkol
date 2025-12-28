#!/bin/bash

echo "=== TurkAlkol VDS Kurulum Scripti ==="

# 1. Sistem güncellemesi
echo "📦 Sistem güncelleniyor..."
apt update && apt upgrade -y

# 2. Python ve gerekli paketleri yükle
echo "🐍 Python yükleniyor..."
apt install python3 python3-pip python3-venv nginx -y

# 3. Proje klasörüne git
cd /root/turkalkol

# 4. Virtual environment oluştur
echo "🔧 Virtual environment oluşturuluyor..."
python3 -m venv venv
source venv/bin/activate

# 5. Python paketlerini yükle
echo "📚 Python paketleri yükleniyor..."
pip install --upgrade pip
pip install -r requirements.txt

# 6. Systemd servisini kur
echo "⚙️ Servis kuruluyor..."
cp turkalkol.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable turkalkol
systemctl start turkalkol

echo "✅ Kurulum tamamlandı!"
echo "🌐 Siteniz http://185.233.164.40:5000 adresinde çalışıyor"
systemctl status turkalkol
