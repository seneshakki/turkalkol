#!/bin/bash
# VPS'e deploy scripti
# Kullanım: ./vps-deploy.sh

VPS_HOST="185.233.164.40"
VPS_USER="root"
VPS_PATH="/root/turkalkol"

echo "🚀 TurkAlkol VPS Deploy Başlatılıyor..."

# Dosyaları VPS'e gönder
echo "📤 Dosyalar yükleniyor..."
scp -r public/* ${VPS_USER}@${VPS_HOST}:${VPS_PATH}/public/

# Servisi yeniden başlat
echo "🔄 Servis yeniden başlatılıyor..."
ssh ${VPS_USER}@${VPS_HOST} "systemctl restart turkalkol"

echo "✅ Deploy tamamlandı!"
echo "🌐 Site: http://turkalkol.com"
