// ==========================================
// FLIP CHALLENGE - TURKALKOL PRO
// Premium Edition with Real Physics
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ==========================================
// ITEMS (Glasses & Bottles)
// ==========================================
const ITEMS = {
    // Bardaklar (Glasses) - PNG destekli
    shotGlass: {
        name: 'Shot Bardak', type: 'glass',
        h: 120, w: 70, topW: 70, bottomW: 50,
        image: '/images/bottles/shot/jagermeister.png',
        fill: '#c9a227', opacity: 0.6,
        mass: 0.4, centerOfMass: 0.7
    },
    beerGlass: {
        name: 'Bira Bardağı', type: 'glass',
        h: 160, w: 80, topW: 80, bottomW: 65,
        image: '/images/bottles/bira/efes.png',
        fill: '#f5b800', opacity: 0.5,
        mass: 0.6, centerOfMass: 0.65
    },
    wineGlass: {
        name: 'Şarap Kadehi', type: 'glass',
        h: 170, w: 80, topW: 75, bottomW: 40,
        image: '/images/bottles/sarap/kavaklidere.png',
        fill: '#722F37', opacity: 0.4,
        mass: 0.5, centerOfMass: 0.55
    },
    whiskyGlass: {
        name: 'Viski Bardağı', type: 'glass',
        h: 140, w: 80, topW: 80, bottomW: 70,
        image: '/images/bottles/viski/jack-daniels.png',
        fill: '#d4a574', opacity: 0.5,
        mass: 0.7, centerOfMass: 0.75
    },

    // Şişeler (Bottles) - PNG destekli
    rakiBottle: {
        name: 'Rakı Şişesi', type: 'bottle',
        h: 200, w: 70, neckH: 50, neckW: 22,
        image: '/images/bottles/raki/yeni-raki.png',
        fill: '#ffffff', opacity: 0.3,
        mass: 1.0, centerOfMass: 0.6
    },
    vodkaBottle: {
        name: 'Votka Şişesi', type: 'bottle',
        h: 200, w: 70, neckH: 60, neckW: 25,
        image: '/images/bottles/vodka/istanblue.png',
        fill: '#e0e0e0', opacity: 0.25,
        mass: 1.1, centerOfMass: 0.55
    }
};

// ==========================================
// SURFACES (with image backgrounds)
// ==========================================
const SURFACES = {
    rakiTable: {
        name: 'Rakı Masası',
        image: 'tables/raki_table.png',
        bounce: 0.3, friction: 0.8
    },
    beerTable: {
        name: 'Bira Masası',
        image: 'tables/beer_table.png',
        bounce: 0.35, friction: 0.75
    },
    woodBar: {
        name: 'Ahşap Bar',
        image: 'tables/wood_table.png',
        bounce: 0.3, friction: 0.8
    },
    glassTable: {
        name: 'Cam Masa',
        color: 'rgba(100,180,220,0.4)', highlight: 'rgba(150,200,240,0.6)',
        bounce: 0.25, friction: 0.5, transparent: true
    }
};

// ==========================================
// PHYSICS CONSTANTS
// ==========================================
const PHYSICS = {
    gravity: 0.35,
    airDrag: 0.997,
    angularDrag: 0.995,
    minVelocity: 0.5,
    maxPower: 100,

    // Landing tolerance (degrees)
    perfectLanding: 8,
    goodLanding: 20,
    okLanding: 35
};

// ==========================================
// PERFORMANCE (Mobile optimization)
// ==========================================
const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

const PERF = {
    maxParticles: isMobile ? 6 : 15,
    enableShadows: !isMobile,
    enableGlow: !isMobile,
    enableWoodGrain: !isMobile,
    enableAmbientLight: !isMobile
};

// ==========================================
// GAME STATE
// ==========================================
let state = {
    screen: 'menu',
    username: '',

    currentItem: 'shotGlass',
    currentSurface: 'woodBar',

    score: 0,
    combo: 0,
    bestCombo: 0,

    isFlipping: false,
    isCharging: false,
    power: 0,
    powerDir: 1.5,

    soundOn: true,

    particles: []
};

// ==========================================
// OBJECT PHYSICS
// ==========================================
let obj = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: 0, angVel: 0,
    grounded: true
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const $ = id => document.getElementById(id);
const ui = {
    menuScreen: $('loginScreen'),
    gameScreen: $('gameScreen'),
    username: $('usernameInput'),
    startBtn: $('startBtn'),
    leaderboard: $('top5List'),

    score: $('currentScore'),
    combo: $('comboDisplay'),
    message: $('messageOverlay'),
    powerFill: $('powerFill'),
    powerText: $('powerText'),
    flipBtn: $('flipBtn'),

    exitBtn: $('exitBtn'),
    soundBtn: $('soundBtn'),
    itemBtn: $('itemBtn'),
    surfaceBtn: $('surfaceBtn')
};

// ==========================================
// TABLE IMAGES
// ==========================================
const tableImages = {};

function preloadTableImages() {
    Object.keys(SURFACES).forEach(key => {
        const surface = SURFACES[key];
        if (surface.image) {
            const img = new Image();
            img.src = surface.image;
            img.onload = () => { tableImages[key] = img; };
        }
    });
}

// ==========================================
// ITEM IMAGES (PNG desteği)
// ==========================================
const itemImages = {};

function preloadItemImages() {
    Object.keys(ITEMS).forEach(key => {
        const item = ITEMS[key];
        if (item.image) {
            const img = new Image();
            img.src = item.image;
            img.onload = () => {
                itemImages[key] = img;
                console.log('Loaded:', key, item.image);
            };
            img.onerror = () => {
                console.warn('Failed to load:', item.image);
            };
        }
    });
}

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
    preloadTableImages();
    preloadItemImages();
    resize();
    loadLeaderboard();

    window.addEventListener('resize', resize);

    // Event listeners
    ui.startBtn?.addEventListener('click', startGame);
    ui.exitBtn?.addEventListener('click', exitGame);
    ui.soundBtn?.addEventListener('click', toggleSound);
    ui.itemBtn?.addEventListener('click', cycleItem);
    ui.surfaceBtn?.addEventListener('click', cycleSurface);

    // Power charging (press & hold)
    if (ui.flipBtn) {
        ui.flipBtn.addEventListener('contextmenu', e => e.preventDefault());

        const startCharge = e => {
            if (state.screen === 'game' && !state.isFlipping && obj.grounded) {
                e.preventDefault();
                state.isCharging = true;
                state.power = 0;
                ui.flipBtn.classList.add('pressing');
            }
        };

        const endCharge = e => {
            if (state.isCharging) {
                e.preventDefault();
                state.isCharging = false;
                ui.flipBtn.classList.remove('pressing');
                if (state.power > 5) doFlip();
            }
        };

        ui.flipBtn.addEventListener('mousedown', startCharge);
        ui.flipBtn.addEventListener('touchstart', startCharge, { passive: false });
        window.addEventListener('mouseup', endCharge);
        window.addEventListener('touchend', endCharge);
    }

    // Start game loop
    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    resetObject();
}

// ==========================================
// GAME FLOW
// ==========================================
function startGame() {
    const name = ui.username?.value.trim() || 'Oyuncu';
    if (name.length < 2) {
        showMessage('İsim çok kısa!', '#ef4444');
        return;
    }

    state.username = name;
    state.screen = 'game';
    state.score = 0;
    state.combo = 0;

    ui.menuScreen?.classList.remove('active');
    ui.gameScreen?.classList.add('active');

    resetObject();
    updateUI();
}

function exitGame() {
    if (state.score > 0) saveScore();

    state.screen = 'menu';
    ui.menuScreen?.classList.add('active');
    ui.gameScreen?.classList.remove('active');
    loadLeaderboard();
}

// ==========================================
// PHYSICS ENGINE
// ==========================================
function doFlip() {
    const item = ITEMS[state.currentItem];
    const surface = SURFACES[state.currentSurface];

    state.isFlipping = true;
    obj.grounded = false;
    state.flipStartTime = Date.now();

    ui.flipBtn.textContent = '🔄';
    ui.flipBtn.disabled = true;

    // Calculate launch parameters based on power and item properties
    const powerRatio = state.power / PHYSICS.maxPower;
    const massEffect = Math.sqrt(1 / item.mass); // Square root for more balanced effect
    const heightBonus = 1 + (item.h / 150) * 0.2; // Taller items get slight boost

    // Vertical velocity - main launch force (smoother, lower)
    const baseVy = 8 + powerRatio * 10;
    obj.vy = -baseVy * massEffect * heightBonus;

    // Horizontal drift based on power (less power = more random)
    const driftAmount = (1 - powerRatio * 0.5) * 5;
    obj.vx = (Math.random() - 0.5) * driftAmount;

    // Angular velocity - CENTER OF MASS affects spin
    // Lower center of mass = harder to flip correctly
    const spinDir = Math.random() > 0.5 ? 1 : -1;
    const comEffect = 1 + (item.centerOfMass - 0.5) * 0.5; // 0.5 is neutral
    const spinBase = 0.10 + powerRatio * 0.30;
    obj.angVel = spinBase * massEffect * comEffect * spinDir;

    // Add slight wobble at start
    obj.wobble = 0.02;

    playSound('launch');
}

function updatePhysics() {
    // Power bar charging animation (slower for control)
    if (state.isCharging) {
        state.power += state.powerDir * 0.7;
        if (state.power >= PHYSICS.maxPower) {
            state.power = PHYSICS.maxPower;
            state.powerDir = -Math.abs(state.powerDir);
        } else if (state.power <= 0) {
            state.power = 0;
            state.powerDir = Math.abs(state.powerDir);
        }
        updatePowerBar();
    }

    if (!state.isFlipping) {
        // Subtle idle wobble when grounded
        if (obj.grounded && obj.wobble > 0) {
            obj.wobble *= 0.92;
            obj.angle = Math.sin(Date.now() * 0.01) * obj.wobble;
            if (obj.wobble < 0.001) {
                obj.wobble = 0;
                obj.angle = 0;
            }
        }
        return;
    }

    const item = ITEMS[state.currentItem];
    const surface = SURFACES[state.currentSurface];

    // Apply gravity with slight variation based on mass
    const gravityMod = 0.9 + item.mass * 0.2;
    obj.vy += PHYSICS.gravity * gravityMod;

    // Air resistance - heavier objects affected less
    const airDragMod = PHYSICS.airDrag + (item.mass - 0.5) * 0.002;
    obj.vx *= airDragMod;
    obj.vy *= Math.min(0.999, airDragMod);

    // Angular drag - taller objects slow rotation faster
    const angDragMod = PHYSICS.angularDrag - (item.h / 200) * 0.01;
    obj.angVel *= angDragMod;

    // Air spin stabilization (like a real flip)
    // Objects tend to stabilize rotation when falling
    if (obj.vy > 0) { // Falling down
        const stabilization = 0.0005 * (1 - item.centerOfMass);
        if (obj.angVel > 0) obj.angVel -= stabilization;
        else obj.angVel += stabilization;
    }

    // Update position
    obj.x += obj.vx;
    obj.y += obj.vy;
    obj.angle += obj.angVel;

    // Wall collision with spin effect
    const halfW = item.w / 2;
    if (obj.x - halfW < 0) {
        obj.x = halfW;
        obj.vx *= -0.4;
        obj.angVel += obj.vx * 0.02; // Wall adds spin
    } else if (obj.x + halfW > canvas.width) {
        obj.x = canvas.width - halfW;
        obj.vx *= -0.4;
        obj.angVel -= obj.vx * 0.02;
    }

    // Floor collision - REALISTIC
    const floorY = getFloorY();
    if (obj.y >= floorY) {
        obj.y = floorY;

        const impactSpeed = Math.abs(obj.vy);
        const impactAngle = Math.abs((obj.angle % (Math.PI * 2)) * 180 / Math.PI);
        const isUpright = impactAngle < 30 || impactAngle > 330;

        if (impactSpeed > 2.5) {
            // Calculate bounce based on angle of impact
            // Upright landings bounce less
            const angleBounce = isUpright ? 0.5 : 1.2;
            obj.vy *= -surface.bounce * angleBounce;
            obj.vx *= surface.friction;

            // Angular velocity affected by impact
            if (!isUpright) {
                // Tipping over adds rotation
                const tipDir = impactAngle < 180 ? 1 : -1;
                obj.angVel += tipDir * impactSpeed * 0.008;
            } else {
                // Upright landing stops rotation quickly
                obj.angVel *= 0.3;
            }

            obj.angVel *= surface.friction;

            createImpactParticles();
            playSound('bounce');
        } else if (impactSpeed > PHYSICS.minVelocity) {
            // Small settling bounces
            obj.vy *= -surface.bounce * 0.3;
            obj.angVel *= 0.5;
        } else {
            // Fully settled - check if successful
            checkLanding();
        }
    }

    // Update particles
    updateParticles();
}

function checkLanding() {
    state.isFlipping = false;
    obj.grounded = true;
    obj.vx = 0;
    obj.vy = 0;
    obj.angVel = 0;

    ui.flipBtn.textContent = 'BASILI TUT';
    ui.flipBtn.disabled = false;

    // Normalize angle to 0-360
    let deg = ((obj.angle * 180 / Math.PI) % 360 + 360) % 360;
    if (deg > 180) deg = 360 - deg;

    // Check landing quality
    if (deg <= PHYSICS.perfectLanding) {
        handleSuccess('perfect');
    } else if (deg <= PHYSICS.goodLanding) {
        handleSuccess('good');
    } else if (deg <= PHYSICS.okLanding) {
        handleSuccess('ok');
    } else {
        handleFail();
    }
}

function handleSuccess(quality) {
    const points = quality === 'perfect' ? 3 : quality === 'good' ? 2 : 1;
    const msg = quality === 'perfect' ? 'MÜKEMMEL!' : quality === 'good' ? 'GÜZEL!' : 'OLDU!';
    const color = quality === 'perfect' ? '#22c55e' : quality === 'good' ? '#84cc16' : '#eab308';

    state.score += points;
    state.combo++;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;

    showMessage(state.combo > 1 ? `${state.combo}x ${msg}` : msg, color);
    createSuccessParticles();
    playSound('success');

    obj.angle = 0;
    updateUI();

    if (state.score % 5 === 0) saveScore();
}

function handleFail() {
    state.combo = 0;
    showMessage('DÜŞTÜ!', '#ef4444');
    playSound('fail');

    const item = ITEMS[state.currentItem];
    obj.angle = Math.PI / 2;

    saveScore();

    setTimeout(() => {
        if (!state.isFlipping) resetObject();
    }, 600);
}

function resetObject() {
    const item = ITEMS[state.currentItem];
    obj.x = canvas.width / 2;
    obj.y = getFloorY();
    obj.vx = 0;
    obj.vy = 0;
    obj.angle = 0;
    obj.angVel = 0;
    obj.grounded = true;
}

function getFloorY() {
    return canvas.height - 300;
}

// ==========================================
// PARTICLES
// ==========================================
function createImpactParticles() {
    const count = Math.min(PERF.maxParticles, 8);
    for (let i = 0; i < count; i++) {
        state.particles.push({
            x: obj.x + (Math.random() - 0.5) * 30,
            y: getFloorY(),
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 4 - 2,
            size: Math.random() * 4 + 2,
            life: 1,
            color: '#ffffff'
        });
    }
}

function createSuccessParticles() {
    const colors = ['#22c55e', '#84cc16', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 15; i++) {
        const angle = (i / 15) * Math.PI * 2;
        state.particles.push({
            x: obj.x,
            y: obj.y,
            vx: Math.cos(angle) * (Math.random() * 4 + 2),
            vy: Math.sin(angle) * (Math.random() * 4 + 2) - 3,
            size: Math.random() * 5 + 3,
            life: 1,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

function updateParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life -= 0.03;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
}

// ==========================================
// RENDERING
// ==========================================
function gameLoop() {
    updatePhysics();
    render();
    requestAnimationFrame(gameLoop);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();
    drawSurface();
    drawObject();
    drawParticles();
}

function drawBackground() {
    const w = canvas.width;
    const h = canvas.height;

    // Simple solid or gradient background
    if (isMobile) {
        ctx.fillStyle = '#0c0c14';
        ctx.fillRect(0, 0, w, h);
    } else {
        // Deep gradient background (desktop only)
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#0a0a12');
        bgGrad.addColorStop(0.4, '#0d0d18');
        bgGrad.addColorStop(0.7, '#10101a');
        bgGrad.addColorStop(1, '#08080e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Ambient lights (desktop only)
        if (PERF.enableAmbientLight) {
            const topLight = ctx.createRadialGradient(w / 2, -50, 0, w / 2, -50, w * 0.7);
            topLight.addColorStop(0, 'rgba(80, 80, 120, 0.12)');
            topLight.addColorStop(1, 'transparent');
            ctx.fillStyle = topLight;
            ctx.fillRect(0, 0, w, h);
        }
    }
}

function drawSurface() {
    const surface = SURFACES[state.currentSurface];
    const floorY = getFloorY();
    const item = ITEMS[state.currentItem];
    const tableTop = floorY + item.h / 2;

    const tableW = Math.min(canvas.width * 0.88, 480);
    const tableH = 90;
    const tableX = (canvas.width - tableW) / 2;
    const cornerR = 12;

    // Large shadow (desktop only - expensive)
    if (PERF.enableShadows) {
        ctx.save();
        ctx.shadowBlur = 40;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowOffsetY = 15;
        ctx.fillStyle = 'rgba(0,0,0,0.01)';
        ctx.beginPath();
        roundRect(ctx, tableX, tableTop, tableW, tableH, cornerR);
        ctx.fill();
        ctx.restore();
    }

    // Table body with gradient
    const bodyGrad = ctx.createLinearGradient(0, tableTop, 0, tableTop + tableH);
    if (state.currentSurface === 'woodBar') {
        bodyGrad.addColorStop(0, '#6B4423');
        bodyGrad.addColorStop(0.3, '#5C3317');
        bodyGrad.addColorStop(0.7, '#4A2810');
        bodyGrad.addColorStop(1, '#3D200D');
    } else if (state.currentSurface === 'marbleCounter') {
        bodyGrad.addColorStop(0, '#f5f5f5');
        bodyGrad.addColorStop(0.5, '#e8e8e8');
        bodyGrad.addColorStop(1, '#d0d0d0');
    } else if (state.currentSurface === 'metalTable') {
        bodyGrad.addColorStop(0, '#5a5a5a');
        bodyGrad.addColorStop(0.3, '#4a4a4a');
        bodyGrad.addColorStop(0.7, '#3a3a3a');
        bodyGrad.addColorStop(1, '#2a2a2a');
    } else {
        bodyGrad.addColorStop(0, 'rgba(100, 180, 220, 0.5)');
        bodyGrad.addColorStop(1, 'rgba(60, 140, 180, 0.4)');
    }

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    roundRect(ctx, tableX, tableTop, tableW, tableH, cornerR);
    ctx.fill();

    // Table top surface (reflective)
    const topGrad = ctx.createLinearGradient(tableX, tableTop, tableX + tableW, tableTop);
    topGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
    topGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    topGrad.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(tableX + cornerR, tableTop);
    ctx.lineTo(tableX + tableW - cornerR, tableTop);
    ctx.arcTo(tableX + tableW, tableTop, tableX + tableW, tableTop + cornerR, cornerR);
    ctx.lineTo(tableX + tableW, tableTop + 8);
    ctx.lineTo(tableX, tableTop + 8);
    ctx.lineTo(tableX, tableTop + cornerR);
    ctx.arcTo(tableX, tableTop, tableX + cornerR, tableTop, cornerR);
    ctx.closePath();
    ctx.fill();

    // Edge highlight line
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableX + cornerR, tableTop + 0.5);
    ctx.lineTo(tableX + tableW - cornerR, tableTop + 0.5);
    ctx.stroke();

    // Wood grain pattern for wood table
    if (state.currentSurface === 'woodBar') {
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            const y = tableTop + 15 + i * 10;
            ctx.beginPath();
            ctx.moveTo(tableX + 20, y);
            ctx.bezierCurveTo(
                tableX + tableW * 0.3, y + (Math.random() - 0.5) * 4,
                tableX + tableW * 0.6, y + (Math.random() - 0.5) * 4,
                tableX + tableW - 20, y
            );
            ctx.stroke();
        }
    }

    // Landing zone (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 50, floorY);
    ctx.lineTo(canvas.width / 2 + 50, floorY);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawObject() {
    const item = ITEMS[state.currentItem];
    const img = itemImages[state.currentItem];

    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.rotate(obj.angle);

    // Shadow under object
    ctx.save();
    ctx.rotate(-obj.angle);
    ctx.shadowBlur = 25;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    ctx.fillRect(-item.w / 2, -item.h / 2, item.w, item.h);
    ctx.restore();

    // PNG varsa onu çiz, yoksa canvas çizimi kullan
    if (img && img.complete && img.naturalWidth > 0) {
        // PNG image çiz
        const scale = item.h / img.naturalHeight;
        const drawW = img.naturalWidth * scale;
        const drawH = item.h;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
        // Fallback: Eski canvas çizimi
        if (item.type === 'glass') {
            drawGlass(item);
        } else {
            drawBottle(item);
        }
    }

    ctx.restore();
}

function drawGlass(item) {
    const h = item.h;
    const topW = item.topW;
    const bottomW = item.bottomW;

    // Glass body path
    ctx.beginPath();
    ctx.moveTo(-topW / 2, -h / 2);
    ctx.lineTo(topW / 2, -h / 2);
    ctx.lineTo(bottomW / 2, h / 2);
    ctx.lineTo(-bottomW / 2, h / 2);
    ctx.closePath();

    // Glass gradient (crystal effect)
    const glassGrad = ctx.createLinearGradient(-topW / 2, 0, topW / 2, 0);
    glassGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
    glassGrad.addColorStop(0.3, 'rgba(255,255,255,0.2)');
    glassGrad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    glassGrad.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    glassGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = glassGrad;
    ctx.fill();

    // Liquid with gradient
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-topW / 2, -h / 2);
    ctx.lineTo(topW / 2, -h / 2);
    ctx.lineTo(bottomW / 2, h / 2);
    ctx.lineTo(-bottomW / 2, h / 2);
    ctx.closePath();
    ctx.clip();

    const liqGrad = ctx.createLinearGradient(0, -h / 4, 0, h / 2);
    liqGrad.addColorStop(0, 'transparent');
    liqGrad.addColorStop(0.1, item.fill);
    liqGrad.addColorStop(0.9, item.fill);
    liqGrad.addColorStop(1, shadeColor(item.fill, -30));
    ctx.fillStyle = liqGrad;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-topW, -h * 0.15, topW * 2, h);
    ctx.restore();

    // Glass rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-topW / 2, -h / 2);
    ctx.lineTo(topW / 2, -h / 2);
    ctx.stroke();

    // Glass outline
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-topW / 2, -h / 2);
    ctx.lineTo(topW / 2, -h / 2);
    ctx.lineTo(bottomW / 2, h / 2);
    ctx.lineTo(-bottomW / 2, h / 2);
    ctx.closePath();
    ctx.stroke();

    // Left highlight (reflection)
    const reflectGrad = ctx.createLinearGradient(-topW / 2, 0, -topW / 2 + 12, 0);
    reflectGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
    reflectGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = reflectGrad;
    ctx.beginPath();
    ctx.moveTo(-topW / 2 + 3, -h / 2 + 4);
    ctx.lineTo(-topW / 2 + 12, -h / 2 + 4);
    ctx.lineTo(-bottomW / 2 + 10, h / 2 - 4);
    ctx.lineTo(-bottomW / 2 + 3, h / 2 - 4);
    ctx.closePath();
    ctx.fill();

    // Sparkle at top
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(-topW / 4, -h / 2 + 3, 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawBottle(item) {
    const h = item.h;
    const w = item.w;
    const neckH = item.neckH;
    const neckW = item.neckW;
    const bodyH = h - neckH;

    // Bottle body with gradient
    const bodyGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    bodyGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
    bodyGrad.addColorStop(0.2, 'rgba(255,255,255,0.18)');
    bodyGrad.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    bodyGrad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    bodyGrad.addColorStop(0.8, 'rgba(255,255,255,0.1)');
    bodyGrad.addColorStop(1, 'rgba(255,255,255,0.03)');

    // Body
    ctx.beginPath();
    roundRect(ctx, -w / 2, -h / 2 + neckH, w, bodyH, 8);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Neck shape
    ctx.beginPath();
    ctx.moveTo(-neckW / 2, -h / 2 + neckH);
    ctx.lineTo(-neckW / 2 - 4, -h / 2 + neckH - 5);
    ctx.lineTo(-neckW / 2, -h / 2 + 12);
    ctx.quadraticCurveTo(-neckW / 2, -h / 2 + 4, -neckW / 4, -h / 2 + 2);
    ctx.lineTo(neckW / 4, -h / 2 + 2);
    ctx.quadraticCurveTo(neckW / 2, -h / 2 + 4, neckW / 2, -h / 2 + 12);
    ctx.lineTo(neckW / 2 + 4, -h / 2 + neckH - 5);
    ctx.lineTo(neckW / 2, -h / 2 + neckH);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Liquid in body
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, -w / 2, -h / 2 + neckH, w, bodyH, 8);
    ctx.clip();

    const liqGrad = ctx.createLinearGradient(0, 0, 0, bodyH);
    liqGrad.addColorStop(0, item.fill);
    liqGrad.addColorStop(0.8, item.fill);
    liqGrad.addColorStop(1, shadeColor(item.fill, -25));
    ctx.fillStyle = liqGrad;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(-w, h / 2 - bodyH * 0.6, w * 2, bodyH);
    ctx.restore();

    // Body outline
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, -w / 2, -h / 2 + neckH, w, bodyH, 8);
    ctx.stroke();

    // Neck outline
    ctx.beginPath();
    ctx.moveTo(-neckW / 2, -h / 2 + neckH);
    ctx.lineTo(-neckW / 2, -h / 2 + 12);
    ctx.quadraticCurveTo(-neckW / 2, -h / 2 + 4, 0, -h / 2 + 2);
    ctx.quadraticCurveTo(neckW / 2, -h / 2 + 4, neckW / 2, -h / 2 + 12);
    ctx.lineTo(neckW / 2, -h / 2 + neckH);
    ctx.stroke();

    // Cap
    const capGrad = ctx.createLinearGradient(-neckW / 2, -h / 2, neckW / 2, -h / 2);
    capGrad.addColorStop(0, '#333');
    capGrad.addColorStop(0.5, '#555');
    capGrad.addColorStop(1, '#222');
    ctx.fillStyle = capGrad;
    ctx.fillRect(-neckW / 2 + 2, -h / 2, neckW - 4, 6);

    // Left highlight
    const reflGrad = ctx.createLinearGradient(-w / 2, 0, -w / 2 + 15, 0);
    reflGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
    reflGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = reflGrad;
    ctx.fillRect(-w / 2 + 3, -h / 2 + neckH + 8, 12, bodyH - 20);

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-w / 2 + 8, h / 2 - bodyH / 2 - 18, w - 16, 36);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 8, h / 2 - bodyH / 2 - 18, w - 16, 36);

    // Sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(-w / 4, -h / 2 + neckH + 15, 2.5, 0, Math.PI * 2);
    ctx.fill();
}

// Helper: darken/lighten color
function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function drawParticles() {
    for (const p of state.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
}

// ==========================================
// UI HELPERS
// ==========================================
function updateUI() {
    if (ui.score) ui.score.textContent = state.score;
    if (ui.combo) ui.combo.textContent = state.combo > 1 ? `${state.combo}x` : '';
}

function updatePowerBar() {
    if (ui.powerFill) ui.powerFill.style.width = state.power + '%';
    if (ui.powerText) ui.powerText.textContent = Math.round(state.power) + '%';
}

function showMessage(text, color) {
    if (!ui.message) return;
    ui.message.textContent = text;
    ui.message.style.color = color;
    ui.message.classList.add('show');
    setTimeout(() => ui.message.classList.remove('show'), 1200);
}

function cycleItem() {
    const items = Object.keys(ITEMS);
    const idx = items.indexOf(state.currentItem);
    state.currentItem = items[(idx + 1) % items.length];
    resetObject();

    const item = ITEMS[state.currentItem];
    showMessage(item.name, '#3b82f6');
}

function cycleSurface() {
    const surfaces = Object.keys(SURFACES);
    const idx = surfaces.indexOf(state.currentSurface);
    state.currentSurface = surfaces[(idx + 1) % surfaces.length];

    const surface = SURFACES[state.currentSurface];
    showMessage(surface.name, '#8b5cf6');
}

function toggleSound() {
    state.soundOn = !state.soundOn;
    if (ui.soundBtn) ui.soundBtn.textContent = state.soundOn ? '🔊' : '🔇';
}

// ==========================================
// AUDIO
// ==========================================
let audioCtx;
function playSound(type) {
    if (!state.soundOn) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        const sounds = {
            launch: { freq: 400, type: 'triangle', dur: 0.1 },
            bounce: { freq: 150, type: 'square', dur: 0.08 },
            success: { freq: 600, type: 'sine', dur: 0.15 },
            fail: { freq: 100, type: 'sawtooth', dur: 0.2 }
        };

        const s = sounds[type] || sounds.bounce;
        osc.type = s.type;
        osc.frequency.setValueAtTime(s.freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(s.freq / 2, audioCtx.currentTime + s.dur);
        gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + s.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + s.dur + 0.05);
    } catch (e) { }
}

// ==========================================
// BACKEND
// ==========================================
async function saveScore() {
    if (!state.username || state.score === 0) return;
    try {
        await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: state.username,
                score: state.score,
                stats: {
                    longestCombo: state.bestCombo
                }
            })
        });
    } catch (e) { }
}

async function loadLeaderboard() {
    if (!ui.leaderboard) return;
    ui.leaderboard.innerHTML = '<li>Yükleniyor...</li>';

    try {
        const res = await fetch('/api/leaderboard');
        const data = await res.json();

        ui.leaderboard.innerHTML = '';
        if (!data || data.length === 0) {
            ui.leaderboard.innerHTML = '<li>Henüz skor yok</li>';
            return;
        }

        data.slice(0, 5).forEach((p, i) => {
            const li = document.createElement('li');
            li.className = i < 3 ? `rank-${i + 1}` : '';
            li.innerHTML = `
        <span class="rank-num">${i + 1}</span>
        <span class="name">${escapeHtml(p.username)}</span>
        <span class="pts">${p.score}</span>
      `;
            ui.leaderboard.appendChild(li);
        });
    } catch (e) {
        ui.leaderboard.innerHTML = '<li style="color:#ef4444">Bağlantı hatası</li>';
    }
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// Start
window.onload = init;