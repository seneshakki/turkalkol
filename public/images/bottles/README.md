# Şişe PNG'leri - Klasör Yapısı

Bu klasörde alkol şişelerinin PNG dosyalarını kategorilere göre organize edebilirsin.

## Klasör Yapısı (6 Kategori)

```
bottles/
├── bira/          → Bira markaları (Efes, Tuborg, Carlsberg vs.)
├── raki/          → Rakı markaları (Yeni Rakı, Tekirdağ vs.)
├── sarap/         → Şarap markaları (Kavaklıdere, Doluca vs.)
├── shot/          → Shot içkileri (Jägermeister, Sambuca vs.)
├── viski/         → Viski markaları (JW, Chivas, Jameson vs.)
└── vodka/         → Vodka markaları (Absolut, Smirnoff vs.)
```

## PNG Nasıl Eklenir

1. PNG dosyasını uygun klasöre koy
2. `bottles.html` dosyasını aç
3. Yorum satırını aç ve düzenle:

```html
<div class="bottle-card" data-category="raki">
  <span class="bottle-badge popular">Popüler</span>
  <img src="/images/bottles/raki/yeni-raki.png" alt="Yeni Rakı">
  <div class="bottle-card-info">
    <div class="bottle-name">Yeni Rakı</div>
    <div class="bottle-category">Rakı</div>
  </div>
</div>
```

## Badge Türleri

- `popular` → Kırmızı/Turuncu gradient
- `new` → Yeşil gradient  
- `premium` → Altın gradient

## Önemli Notlar

- PNG formatı kullan (şeffaf arkaplan için)
- Önerilen boyut: En az 500x500 piksel
- Dosya isimlerinde Türkçe karakter kullanma
