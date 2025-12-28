/**
 * JavaScript Obfuscation Script
 * Tüm client-side JS dosyalarını gizler
 * Kullanım: node obfuscate.js
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Obfuscate edilecek dosyalar (sadece client-side)
const filesToObfuscate = [
    'public/games/2048/chat.js',
    'public/games/2048/game.js',
    'public/games/bottleflip/bottleflip.js',
    'public/js/script.js'
];

// Güvenli obfuscation ayarları (siteyi bozmaz)
const obfuscationOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.1,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false, // Global'ları değiştirME (DOM erişimi bozulmasın)
    selfDefending: false, // Development'ta kapalı
    simplify: true,
    splitStrings: false, // KAPALI - DOM ID'leri korunsun
    stringArray: false, // KAPALI - String'ler encode edilmesin
    transformObjectKeys: false, // Object key'leri değiştirME (JSON parse sorunları)
    unicodeEscapeSequence: false
};

console.log('🔐 JavaScript Obfuscation Başlatılıyor...\n');

let successCount = 0;
let failCount = 0;

filesToObfuscate.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    const backupPath = fullPath.replace('.js', '.original.js');

    try {
        // Dosya var mı kontrol
        if (!fs.existsSync(fullPath)) {
            console.log(`⚠️  Dosya bulunamadı: ${filePath}`);
            return;
        }

        // Orijinali oku
        const code = fs.readFileSync(fullPath, 'utf8');

        // Yedek al (sadece yoksa)
        if (!fs.existsSync(backupPath)) {
            fs.writeFileSync(backupPath, code);
            console.log(`📁 Yedek alındı: ${path.basename(backupPath)}`);
        }

        // Obfuscate et
        const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscationOptions).getObfuscatedCode();

        // Yaz
        fs.writeFileSync(fullPath, obfuscatedCode);
        console.log(`✅ Obfuscate edildi: ${filePath}`);
        successCount++;

    } catch (error) {
        console.log(`❌ Hata (${filePath}): ${error.message}`);
        failCount++;
    }
});

console.log('\n========================================');
console.log(`✅ Başarılı: ${successCount} dosya`);
if (failCount > 0) console.log(`❌ Başarısız: ${failCount} dosya`);
console.log('========================================');
console.log('\n📝 Orijinal dosyalar .original.js olarak yedeklendi.');
console.log('🔄 Geri almak için: node restore.js');
