/* ===========================
   TURKALKOL.COM - Fotoğraf Sistemi + Beğeni
   =========================== */

const API_URL = "";
const DIR = `${API_URL}/images/watermarked`;
let photos = [];
let index = 0;

const photoWrap = document.getElementById("photoWrap");
const mainPhotoEl = document.getElementById("mainPhoto");

function rndm(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Benzersiz kullanıcı ID'si
let userId = localStorage.getItem("turkalkol_userId");
if (!userId) {
  userId = "user_" + Math.random().toString(36).substr(2, 9) + Date.now();
  localStorage.setItem("turkalkol_userId", userId);
}

/* ===========================
   SWIPE FUNCTIONALITY
=========================== */
let startX = 0;
let currentX = 0;
let dragging = false;
const threshold = 70;
const followRate = 0.35;

function swipeStart(x) {
  if (!photos.length || !mainPhotoEl) return;
  dragging = true;
  startX = x;
  currentX = x;
  mainPhotoEl.style.transition = "none";
}

function swipeMove(x) {
  if (!dragging || !mainPhotoEl) return;
  currentX = x;
  const diff = currentX - startX;
  mainPhotoEl.style.transform = `translateX(${diff * followRate}px)`;
}

function swipeEnd() {
  if (!dragging) return;
  dragging = false;
  const diff = currentX - startX;

  if (diff < -threshold && index < photos.length - 1) {
    render(index + 1);
  } else if (diff > threshold && index > 0) {
    render(index - 1);
  }

  mainPhotoEl.style.transition = "transform 0.2s ease";
  mainPhotoEl.style.transform = "translateX(0)";
}

photoWrap.addEventListener("touchstart", e => swipeStart(e.touches[0].clientX));
photoWrap.addEventListener("touchmove", e => swipeMove(e.touches[0].clientX));
photoWrap.addEventListener("touchend", swipeEnd);
photoWrap.addEventListener("mousedown", e => swipeStart(e.clientX));
photoWrap.addEventListener("mousemove", e => swipeMove(e.clientX));
photoWrap.addEventListener("mouseup", swipeEnd);
photoWrap.addEventListener("mouseleave", swipeEnd);

/* ===========================
   LIKE FUNCTIONS
=========================== */
async function loadLikes(photoName, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${API_URL}/likes/${photoName}`, {
        cache: "no-store",
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) return { count: 0, users: [] };
      const data = await res.json();
      return data;
    } catch (err) {
      if (i === retries) {
        console.error("Like yükleme hatası:", err);
        return { count: 0, users: [] };
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return { count: 0, users: [] };
}

async function toggleLike(photoName) {
  const res = await fetch(`${API_URL}/like/${photoName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Beğeni gönderilemedi");
  return await res.json();
}

async function updateLikeButton(photoName) {
  const likeBtn = document.getElementById("likeBtn");
  const likeCount = document.getElementById("likeCount");
  const heart = likeBtn.querySelector(".heart-icon");

  // Loading state
  likeCount.textContent = "...";
  heart.textContent = "🤍";

  try {
    const likes = await loadLikes(photoName);
    const hasLiked = likes.users.includes(userId);
    likeCount.textContent = likes.count ?? 0;
    heart.textContent = hasLiked ? "❤️" : "🤍";
    likeBtn.classList.toggle("liked", hasLiked);
  } catch {
    likeCount.textContent = "0";
    heart.textContent = "🤍";
    likeBtn.classList.remove("liked");
  }
}

/* ===========================
   BUTTON STATES
=========================== */
function updateButtons() {
  const prev = document.getElementById("prevBtn");
  const next = document.getElementById("nextBtn");
  prev.disabled = index === 0;
  next.disabled = index === photos.length - 1;
}

/* ===========================
   LOAD PHOTOS
=========================== */
async function loadPhotos() {
  try {
    const res = await fetch(`${API_URL}/list`, { cache: "no-store" });
    if (!res.ok) return;

    const data = await res.json();
    if (!Array.isArray(data)) return;

    photos = data.sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)/)?.[0]) || 0;
      const numB = parseInt(b.match(/(\d+)/)?.[0]) || 0;
      return numA - numB;
    });

    if (!photos.length) {
      document.getElementById("photoNumber").textContent = "#0 / 0";
      return;
    }

    index = photos.length - 1;
    render(index);
  } catch (err) {
    console.error("Fotoğraf listesi alınamadı:", err);
  }
}

/* ===========================
   RENDER PHOTO
=========================== */
async function render(i) {
  if (!photos.length) return;
  if (i < 0) i = 0;
  if (i >= photos.length) i = photos.length - 1;

  index = i;
  mainPhotoEl.style.transform = "translateX(0)";

  const name = photos[index];
  const src = `${DIR}/${name}`;

  mainPhotoEl.src = src;
  mainPhotoEl.alt = name;
  document.getElementById("photoNumber").textContent = `#${index + 1} / ${photos.length}`;

  const likeBtn = document.getElementById("likeBtn");
  likeBtn.disabled = true;
  await updateLikeButton(name);
  likeBtn.disabled = false;

  const downloadBtn = document.getElementById("downloadBtn");
  downloadBtn.href = src;
  downloadBtn.download = name;

  updateButtons();
}

/* ===========================
   EVENT LISTENERS
=========================== */
document.getElementById("prevBtn").addEventListener("click", () => render(index - 1));
document.getElementById("nextBtn").addEventListener("click", () => render(index + 1));
document.getElementById("randBtn").addEventListener("click", () => {
  if (!photos.length) return;
  let r;
  do {
    r = rndm(0, photos.length - 1);
  } while (r === index && photos.length > 1);
  render(r);
});

// Like button handler function
async function handleLike(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (!photos.length) return;
  const name = photos[index];
  const likeBtn = document.getElementById("likeBtn");
  const heart = likeBtn.querySelector(".heart-icon");

  if (likeBtn.disabled) return;
  likeBtn.disabled = true;

  try {
    const data = await toggleLike(name);
    document.getElementById("likeCount").textContent = data.count ?? 0;
    heart.textContent = data.hasLiked ? "❤️" : "🤍";
    likeBtn.classList.toggle("liked", data.hasLiked);

    // Pop animation
    if (data.hasLiked) {
      heart.classList.add("heart-pop");
      createHeartBurst(likeBtn);
      setTimeout(() => heart.classList.remove("heart-pop"), 400);
    }
  } catch (err) {
    console.error("Beğeni hatası:", err);
  } finally {
    likeBtn.disabled = false;
  }
}

// Add both click and touch events for like button
const likeBtnEl = document.getElementById("likeBtn");
likeBtnEl.addEventListener("click", handleLike);
likeBtnEl.addEventListener("touchend", handleLike);
likeBtnEl.style.touchAction = "manipulation";

// Heart burst effect with JS animation
function createHeartBurst(btn) {
  const rect = btn.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const directions = [
    { x: -30, y: -50 }, { x: 30, y: -50 },
    { x: -50, y: -20 }, { x: 50, y: -20 },
    { x: 0, y: -60 }, { x: -40, y: 10 },
    { x: 40, y: 10 }, { x: 0, y: 30 }
  ];

  directions.forEach((dir, i) => {
    const heart = document.createElement("span");
    heart.textContent = "❤️";
    heart.style.cssText = `
      position: fixed;
      left: ${centerX}px;
      top: ${centerY}px;
      font-size: 16px;
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      transition: all 0.5s ease-out;
      opacity: 1;
    `;
    document.body.appendChild(heart);

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        heart.style.transform = `translate(calc(-50% + ${dir.x}px), calc(-50% + ${dir.y}px)) scale(0.5)`;
        heart.style.opacity = "0";
      });
    });

    setTimeout(() => heart.remove(), 500);
  });
}

/* ===========================
   LIGHTBOX
=========================== */
const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbClose = document.getElementById("lbClose");
const lbBackdrop = document.getElementById("lbBackdrop");
const openLightboxBtn = document.getElementById("openLightbox");

openLightboxBtn.addEventListener("click", () => {
  if (!photos.length) return;
  lbImg.src = `${DIR}/${photos[index]}`;
  lightbox.setAttribute("aria-hidden", "false");
});

lbClose.addEventListener("click", () => lightbox.setAttribute("aria-hidden", "true"));
lbBackdrop.addEventListener("click", () => lightbox.setAttribute("aria-hidden", "true"));

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    lightbox.setAttribute("aria-hidden", "true");
    sideMenu.classList.remove("open");
    menuOverlay.classList.remove("active");
  }
  if (e.key === "ArrowLeft") render(index - 1);
  if (e.key === "ArrowRight") render(index + 1);
});

/* ===========================
   DRUNK MODE
=========================== */
const drunkToggle = document.getElementById("drunkToggle");
if (drunkToggle) {
  const saved = localStorage.getItem("drunkMode");
  const isOn = saved === "true";
  drunkToggle.checked = isOn;
  document.body.classList.toggle("sober", !isOn);

  drunkToggle.addEventListener("change", () => {
    const val = drunkToggle.checked;
    localStorage.setItem("drunkMode", String(val));
    document.body.classList.toggle("sober", !val);
  });
}

/* ===========================
   SIDE MENU
=========================== */
const menuBtn = document.getElementById("menuBtn");
const sideMenu = document.getElementById("sideMenu");
const menuOverlay = document.getElementById("menuOverlay");

if (menuBtn && sideMenu && menuOverlay) {
  menuBtn.addEventListener("click", () => {
    sideMenu.classList.toggle("open");
    menuOverlay.classList.toggle("active");
  });

  menuOverlay.addEventListener("click", () => {
    sideMenu.classList.remove("open");
    menuOverlay.classList.remove("active");
  });
}

/* ===========================
   INIT
=========================== */
loadPhotos();

/* ===========================
   18+ YAŞ DOĞRULAMA
=========================== */
(function initAgeVerification() {
  const modal = document.getElementById('ageVerification');
  const yesBtn = document.getElementById('ageYes');
  const noBtn = document.getElementById('ageNo');

  if (!modal || !yesBtn || !noBtn) return;

  // Modal'ı kapatma fonksiyonu
  function closeModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    modal.classList.add('hidden');
    document.body.style.overflow = ''; // Scroll'u geri aç
  }

  // Google'a yönlendirme fonksiyonu
  function redirectToGoogle(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.location.href = 'https://www.google.com';
  }

  // Sayfa açıldığında scroll'u engelle
  document.body.style.overflow = 'hidden';

  // Evet butonu - hem click hem touch event
  yesBtn.addEventListener('click', closeModal);
  yesBtn.addEventListener('touchend', closeModal);

  // Hayır butonu - hem click hem touch event
  noBtn.addEventListener('click', redirectToGoogle);
  noBtn.addEventListener('touchend', redirectToGoogle);

  // Butonların touch alanını büyütmek için CSS ekle
  yesBtn.style.touchAction = 'manipulation';
  noBtn.style.touchAction = 'manipulation';
})();
