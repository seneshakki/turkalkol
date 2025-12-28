/**
 * 2048 Oyunu - Login Screen, Leaderboard ve Chat Entegrasyonu
 */

// Player state
let playerName = localStorage.getItem('player2048Name') || '';

class Game2048 {
    constructor() {
        this.size = 4;
        this.grid = [];
        this.score = 0;
        this.bestScore = parseInt(localStorage.getItem('bestScore2048') || '0');
        this.gameOver = false;
        this.rightSwipeCount = 0;
        this.secretThreshold = 15;
        this.isMoving = false;
        this.tileElements = {};

        this.tilesContainer = document.getElementById('tilesContainer');
        this.gridBackground = document.getElementById('gridBackground');
        this.scoreElement = document.getElementById('score');
        this.bestScoreElement = document.getElementById('bestScore');
        this.newGameBtn = document.getElementById('newGameBtn');
        this.exitGameBtn = document.getElementById('exitGameBtn');
        this.playerNameDisplay = document.getElementById('playerNameDisplay');

        this.tileId = 0;
        this.init();
    }

    init() {
        this.updateDimensions();
        this.createGrid();
        this.newGame();
        this.setupEvents();
        this.updateBestScore();
        window.addEventListener('resize', () => {
            this.updateDimensions();
            this.updateAllPositions();
        });
    }

    updateDimensions() {
        const board = document.querySelector('.board-container');
        if (!board) return;

        // CSS ile eşleşen hesaplama:
        // - board-container'ın içinde grid-background var
        // - grid-background: inset:12px, gap:12px, 4 sütun
        // - Tile boyutu = (container içi genişlik - 3 gap) / 4
        const containerWidth = board.offsetWidth;
        const padding = 12; // CSS inset değeri
        const gap = 12; // CSS gap değeri
        const innerWidth = containerWidth - (padding * 2); // inset sol + sağ
        const totalGaps = gap * 3; // 4 tile arasında 3 gap

        this.tileSize = Math.floor((innerWidth - totalGaps) / 4);
        this.gap = gap;
    }

    createGrid() {
        if (!this.gridBackground) return;
        this.gridBackground.innerHTML = '';
        for (let i = 0; i < 16; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            this.gridBackground.appendChild(cell);
        }
    }

    newGame() {
        this.grid = Array(4).fill(null).map(() => Array(4).fill(null));
        this.score = 0;
        this.gameOver = false;
        this.isMoving = false;
        this.rightSwipeCount = 0;
        this.tileElements = {};
        if (this.tilesContainer) this.tilesContainer.innerHTML = '';

        const overlay = document.querySelector('.game-over-overlay');
        if (overlay) overlay.remove();

        this.spawnTile();
        this.spawnTile();
        this.updateScore();

        if (this.playerNameDisplay && playerName) {
            this.playerNameDisplay.textContent = playerName;
        }
    }

    setupEvents() {
        document.addEventListener('keydown', (e) => {
            if (this.gameOver || this.isMoving) return;
            const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
            if (keys[e.key]) {
                e.preventDefault();
                this.move(keys[e.key]);
            }
        });

        let startX, startY;
        const container = document.getElementById('gameContainer');
        if (container) {
            container.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                e.preventDefault();
            }, { passive: false });

            container.addEventListener('touchend', (e) => {
                if (this.gameOver || this.isMoving || !startX) return;
                const dx = e.changedTouches[0].clientX - startX;
                const dy = e.changedTouches[0].clientY - startY;
                const min = 30;

                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > min) {
                    this.move(dx > 0 ? 'right' : 'left');
                } else if (Math.abs(dy) > min) {
                    this.move(dy > 0 ? 'down' : 'up');
                }
                startX = startY = null;
            }, { passive: true });
        }

        this.newGameBtn?.addEventListener('click', () => this.newGame());

        // Exit button - ana ekrana dön
        this.exitGameBtn?.addEventListener('click', () => exitToMenu());
    }

    getPos(r, c) {
        return {
            x: c * (this.tileSize + this.gap),
            y: r * (this.tileSize + this.gap)
        };
    }

    move(dir) {
        if (this.gameOver || this.isMoving) return;
        this.isMoving = true;

        let moved = false;
        const toRemove = [];
        const ranges = {
            left: { rows: [0, 1, 2, 3], cols: [0, 1, 2, 3], dr: 0, dc: -1 },
            right: { rows: [0, 1, 2, 3], cols: [3, 2, 1, 0], dr: 0, dc: 1 },
            up: { rows: [0, 1, 2, 3], cols: [0, 1, 2, 3], dr: -1, dc: 0 },
            down: { rows: [3, 2, 1, 0], cols: [0, 1, 2, 3], dr: 1, dc: 0 }
        };

        const { rows, cols, dr, dc } = ranges[dir];
        const merged = Array(4).fill(null).map(() => Array(4).fill(false));

        for (const r of rows) {
            for (const c of cols) {
                const tile = this.grid[r][c];
                if (!tile) continue;

                let nr = r, nc = c;
                while (this.inBounds(nr + dr, nc + dc) && !this.grid[nr + dr][nc + dc]) {
                    nr += dr;
                    nc += dc;
                }

                const nextR = nr + dr, nextC = nc + dc;
                if (this.inBounds(nextR, nextC) && this.grid[nextR][nextC] &&
                    this.grid[nextR][nextC].value === tile.value && !merged[nextR][nextC]) {
                    const target = this.grid[nextR][nextC];
                    target.value *= 2;
                    this.score += target.value;
                    merged[nextR][nextC] = true;
                    this.animateTile(tile, nextR, nextC);
                    toRemove.push(tile.id);
                    this.grid[r][c] = null;
                    moved = true;
                } else if (nr !== r || nc !== c) {
                    this.grid[nr][nc] = tile;
                    this.grid[r][c] = null;
                    this.animateTile(tile, nr, nc);
                    moved = true;
                }
            }
        }

        // Secret chat trigger
        if (dir === 'right') {
            this.rightSwipeCount++;
            if (this.rightSwipeCount >= this.secretThreshold) {
                this.rightSwipeCount = 0;
                if (typeof openSecretChat === 'function') openSecretChat();
            }
        } else {
            this.rightSwipeCount = 0;
        }

        if (moved) {
            setTimeout(() => {
                toRemove.forEach(id => {
                    if (this.tileElements[id]) {
                        this.tileElements[id].remove();
                        delete this.tileElements[id];
                    }
                });

                for (let r = 0; r < 4; r++) {
                    for (let c = 0; c < 4; c++) {
                        if (merged[r][c] && this.grid[r][c]) {
                            this.updateTileElement(this.grid[r][c]);
                        }
                    }
                }

                this.spawnTile();
                this.updateScore();
                this.isMoving = false;

                if (!this.canMove()) {
                    this.gameOver = true;
                    this.showGameOver();
                }
            }, 150);
        } else {
            this.isMoving = false;
        }
    }

    inBounds(r, c) {
        return r >= 0 && r < 4 && c >= 0 && c < 4;
    }

    animateTile(tile, toR, toC) {
        const el = this.tileElements[tile.id];
        if (!el) return;
        const pos = this.getPos(toR, toC);
        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
    }

    updateAllPositions() {
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const tile = this.grid[r][c];
                if (tile && this.tileElements[tile.id]) {
                    const pos = this.getPos(r, c);
                    const el = this.tileElements[tile.id];
                    el.style.width = this.tileSize + 'px';
                    el.style.height = this.tileSize + 'px';
                    el.style.left = pos.x + 'px';
                    el.style.top = pos.y + 'px';
                }
            }
        }
    }

    spawnTile() {
        // Tile oluşturmadan önce boyutların doğru olduğundan emin ol
        if (!this.tileSize || this.tileSize <= 0) {
            this.updateDimensions();
        }

        const empty = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (!this.grid[r][c]) empty.push({ r, c });
            }
        }
        if (empty.length === 0) return;

        const { r, c } = empty[Math.floor(Math.random() * empty.length)];
        const value = Math.random() < 0.9 ? 2 : 4;
        const tile = { id: ++this.tileId, value };
        this.grid[r][c] = tile;
        this.createTileElement(tile, r, c, true);
    }

    createTileElement(tile, r, c, isNew = false) {
        const el = document.createElement('div');
        el.className = `tile tile-${tile.value <= 2048 ? tile.value : 'super'}${isNew ? ' tile-new' : ''}`;
        el.textContent = tile.value;

        // Güvenli boyut hesaplaması - her seferinde yeniden hesapla
        const board = document.querySelector('.board-container');
        const containerWidth = board ? board.offsetWidth : 400;
        const padding = 12;
        const gap = 12;
        const innerWidth = containerWidth - (padding * 2);
        const calculatedTileSize = Math.floor((innerWidth - (gap * 3)) / 4);
        const safeTileSize = calculatedTileSize > 20 ? calculatedTileSize : 80; // minimum 80px

        const posX = c * (safeTileSize + gap);
        const posY = r * (safeTileSize + gap);

        // Font boyutu sayıya göre ayarla
        let fontSize;
        if (tile.value < 100) {
            fontSize = safeTileSize * 0.5;
        } else if (tile.value < 1000) {
            fontSize = safeTileSize * 0.4;
        } else {
            fontSize = safeTileSize * 0.3;
        }

        el.style.cssText = `
            width: ${safeTileSize}px;
            height: ${safeTileSize}px;
            left: ${posX}px;
            top: ${posY}px;
            font-size: ${fontSize}px;
            transition: left 0.15s ease, top 0.15s ease;
        `;

        this.tilesContainer.appendChild(el);
        this.tileElements[tile.id] = el;

        // Ayrıca class değişkenlerini güncelle
        this.tileSize = safeTileSize;
        this.gap = gap;

        if (isNew) {
            setTimeout(() => el.classList.remove('tile-new'), 200);
        }
    }

    updateTileElement(tile) {
        const el = this.tileElements[tile.id];
        if (!el) return;

        el.className = `tile tile-${tile.value <= 2048 ? tile.value : 'super'} tile-merged`;
        el.textContent = tile.value;
        const fs = tile.value < 100 ? this.tileSize * 0.5 : tile.value < 1000 ? this.tileSize * 0.4 : this.tileSize * 0.3;
        el.style.fontSize = fs + 'px';

        setTimeout(() => el.classList.remove('tile-merged'), 200);
    }

    canMove() {
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (!this.grid[r][c]) return true;
                const v = this.grid[r][c].value;
                if (c < 3 && this.grid[r][c + 1]?.value === v) return true;
                if (r < 3 && this.grid[r + 1][c]?.value === v) return true;
            }
        }
        return false;
    }

    updateScore() {
        if (this.scoreElement) this.scoreElement.textContent = this.score;
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('bestScore2048', this.bestScore);
        }
        if (this.bestScoreElement) this.bestScoreElement.textContent = this.bestScore;
    }

    updateBestScore() {
        if (this.bestScoreElement) this.bestScoreElement.textContent = this.bestScore;
    }

    showGameOver() {
        // Skoru kaydet
        saveScore2048(this.score);

        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        overlay.innerHTML = `
            <h2>Oyun Bitti!</h2>
            <p>Skor: ${this.score}</p>
            <button class="new-game-btn" onclick="game.newGame()">Tekrar Oyna</button>
            <button class="secondary-btn" onclick="exitToMenu()">Ana Menü</button>
        `;
        document.querySelector('.board-container')?.appendChild(overlay);
    }
}

// ============================================
// LOGIN SCREEN FUNCTIONS
// ============================================
function initLoginScreen() {
    const loginScreen = document.getElementById('loginScreen2048');
    const gameContainer = document.getElementById('gameContainer');
    const startBtn = document.getElementById('startGameBtn');
    const nameInput = document.getElementById('playerNameInput');

    // Önceki ismi yükle
    if (playerName && nameInput) {
        nameInput.value = playerName;
    }

    // Start button
    startBtn?.addEventListener('click', () => startGame());

    // Enter tuşu ile başlat
    nameInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startGame();
    });

    // Leaderboard yükle
    loadLeaderboard2048();
}

function startGame() {
    const nameInput = document.getElementById('playerNameInput');
    const name = nameInput?.value.trim() || '';

    if (name.length < 2) {
        alert('Lütfen en az 2 karakterlik bir isim girin!');
        nameInput?.focus();
        return;
    }

    // İsmi kaydet
    playerName = name;
    localStorage.setItem('player2048Name', playerName);

    // Chat için de bu ismi kullan
    const chatUsernameInput = document.getElementById('usernameInput');
    if (chatUsernameInput && !chatUsernameInput.value) {
        chatUsernameInput.value = playerName;
    }

    // Ekranları değiştir
    document.getElementById('loginScreen2048')?.classList.add('hidden');
    document.getElementById('gameContainer')?.classList.remove('hidden');

    // Oyunu başlat - requestAnimationFrame ile boyutların doğru hesaplanmasını sağla
    if (typeof game !== 'undefined') {
        // DOM'un render edilmesini bekle
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                game.updateDimensions();
                game.newGame();
            });
        });
    }
}

function exitToMenu() {
    // Skoru kaydet
    if (typeof game !== 'undefined' && game.score > 0) {
        saveScore2048(game.score);
    }

    // Ekranları değiştir
    document.getElementById('gameContainer')?.classList.add('hidden');
    document.getElementById('loginScreen2048')?.classList.remove('hidden');

    // Leaderboard yenile
    loadLeaderboard2048();
}

// ============================================
// LEADERBOARD FUNCTIONS
// ============================================
async function loadLeaderboard2048() {
    const list = document.getElementById('leaderboard2048List');
    if (!list) return;

    list.innerHTML = '<li class="loading">Yükleniyor...</li>';

    try {
        const res = await fetch('/api/leaderboard?game=2048');
        const data = await res.json();

        list.innerHTML = '';
        if (!data || data.length === 0) {
            list.innerHTML = '<li class="loading">Henüz skor yok</li>';
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
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = '<li class="loading" style="color:#ef4444">Bağlantı hatası</li>';
    }
}

async function saveScore2048(score) {
    if (!playerName || score === 0) return;

    try {
        await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: playerName,
                score: score,
                game: '2048'
            })
        });
    } catch (e) {
        console.error('Skor kaydedilemedi:', e);
    }
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// ============================================
// SECRET CHAT
// ============================================
function openSecretChat() {
    const m = document.getElementById('chatModal');
    if (m) {
        m.classList.add('active');
        // Chat'e oyuncu ismini otomatik doldur
        const chatInput = document.getElementById('usernameInput');
        if (chatInput && playerName && !chatInput.value) {
            chatInput.value = playerName;
        }
    }
}

// ============================================
// INITIALIZATION
// ============================================
let game;
document.addEventListener('DOMContentLoaded', () => {
    initLoginScreen();
    game = new Game2048();
});
