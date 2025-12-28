/**
 * Restore Script - Orijinal dosyaları geri yükle
 * Kullanım: node restore.js
 */

const fs = require('fs');
const path = require('path');

const filesToRestore = [
    'public/games/2048/chat.js',
    'public/games/2048/game.js',
    'public/games/bottleflip/bottleflip.js',
    'public/js/script.js'
];

console.log('🔄 Orijinal dosyalar geri yükleniyor...\n');

filesToRestore.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    const backupPath = fullPath.replace('.js', '.original.js');

    try {
        if (fs.existsSync(backupPath)) {
            const original = fs.readFileSync(backupPath, 'utf8');
            fs.writeFileSync(fullPath, original);
            console.log(`✅ Geri yüklendi: ${filePath}`);
        } else {
            console.log(`⚠️  Yedek bulunamadı: ${filePath}`);
        }
    } catch (error) {
        console.log(`❌ Hata: ${error.message}`);
    }
});

console.log('\n✅ Tamamlandı! Orijinal kodlar geri yüklendi.');
