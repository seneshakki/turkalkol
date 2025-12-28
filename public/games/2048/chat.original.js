const cryptoUtils = {
    async hashPassword(password) {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async deriveKey(password, roomId) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: enc.encode(roomId || 'default_salt'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async encrypt(data, key) {
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = typeof data === 'string' ? enc.encode(data) : data; // string or buffer

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoded
        );

        // Combine IV + ciphertext -> base64
        const buffer = new Uint8Array(iv.byteLength + ciphertext.byteLength);
        buffer.set(iv, 0);
        buffer.set(new Uint8Array(ciphertext), iv.byteLength);

        // Chunk'lı base64 dönüşümü (stack overflow olmadan)
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < buffer.length; i += chunkSize) {
            const chunk = buffer.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    },

    async decrypt(base64Data, key) {
        try {
            if (!base64Data || !key) return base64Data;

            // Şifreli değilse (data: URL veya düz metin) olduğu gibi dön
            if (base64Data.startsWith('data:') || base64Data.length < 20) {
                return base64Data;
            }

            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const iv = bytes.slice(0, 12);
            const data = bytes.slice(12);

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.warn('Decryption skipped (possibly unencrypted data):', e.message);
            // Şifreleme başarısız olursa orijinal veriyi dön
            return base64Data;
        }
    }
};

class SecretChat {
    constructor() {
        this.ws = null;
        this.username = '';
        this.currentRoom = null;
        this.pendingRoom = null;
        this.serverUrl = location.protocol === 'https:' ? 'wss://turkalkol.com/ws/chat' : 'ws://turkalkol.com/ws/chat';
        this.isOnlineMode = false;
        this.myRole = 'member';
        this.users = [];
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.replyingTo = null;
        this.messages = new Map(); // id -> message data
        this.notificationSound = null;
        this.cryptoKey = null; // AES-GCM key
        this.init();
    }

    init() {
        // Elements
        this.chatModal = document.getElementById('chatModal');
        this.chatOverlay = document.getElementById('chatOverlay');
        this.connectionStatus = document.getElementById('connectionStatus');

        // Screens
        this.loginScreen = document.getElementById('loginScreen');
        this.lobbyScreen = document.getElementById('lobbyScreen');
        this.chatRoomScreen = document.getElementById('chatRoomScreen');

        // Login
        this.usernameInput = document.getElementById('usernameInput');
        this.enterLobbyBtn = document.getElementById('enterLobbyBtn');
        this.usernameDisplay = document.getElementById('usernameDisplay');

        // Lobby
        this.roomsList = document.getElementById('roomsList');
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.refreshRoomsBtn = document.getElementById('refreshRoomsBtn');

        // Create Room Modal
        this.createRoomModal = document.getElementById('createRoomModal');
        this.roomNameInput = document.getElementById('roomNameInput');
        this.roomPasswordInput = document.getElementById('roomPasswordInput');
        this.cancelCreateBtn = document.getElementById('cancelCreateBtn');
        this.confirmCreateBtn = document.getElementById('confirmCreateBtn');

        // Password Modal
        this.passwordModal = document.getElementById('passwordModal');
        this.joinPasswordInput = document.getElementById('joinPasswordInput');
        this.cancelJoinBtn = document.getElementById('cancelJoinBtn');
        this.confirmJoinBtn = document.getElementById('confirmJoinBtn');

        // Chat Room
        this.roomTitle = document.getElementById('roomTitle');
        this.userCount = document.getElementById('userCount');
        this.myRoleDisplay = document.getElementById('myRoleDisplay');
        this.roomSettingsBtn = document.getElementById('roomSettingsBtn');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendMessageBtn = document.getElementById('sendMessageBtn');
        this.fileInput = document.getElementById('fileInput');
        this.fileBtn = document.getElementById('fileBtn');
        this.backToLobbyBtn = document.getElementById('backToLobbyBtn');
        this.leaveRoomBtn = document.getElementById('leaveRoomBtn');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.replyPreview = document.getElementById('replyPreview');

        // Tabs
        this.chatTabs = document.querySelectorAll('.chat-tab');
        this.messagesTab = document.getElementById('messagesTab');
        this.usersTab = document.getElementById('usersTab');
        this.usersList = document.getElementById('usersList');

        // Close buttons
        this.closeChatBtn = document.getElementById('closeChatBtn');
        this.closeLobbyBtn = document.getElementById('closeLobbyBtn');

        // Settings Modal
        this.settingsModal = document.getElementById('settingsModal');
        this.newPasswordInput = document.getElementById('newPasswordInput');
        this.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');

        // Init notification sound
        this.initNotificationSound();

        this.bindEvents();
    }

    initNotificationSound() {
        // Base64 notification sound (short ding)
        const soundData = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU9vT1+AgICAgICAgIB/f39/f39/f35+fn5+fn5+fX19fX19fX18fHx8fHx8fHt7e3t7e3t7enp6enp6eno=';
        this.notificationSound = new Audio(soundData);
        this.notificationSound.volume = 0.5;
    }

    playNotificationSound() {
        if (this.notificationSound) {
            this.notificationSound.currentTime = 0;
            this.notificationSound.play().catch(() => { });
        }
    }

    bindEvents() {
        // Close buttons
        this.chatOverlay?.addEventListener('click', () => this.closeChat());
        this.closeChatBtn?.addEventListener('click', () => this.closeChat());
        this.closeLobbyBtn?.addEventListener('click', () => this.closeChat());
        this.leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());

        // Login
        this.enterLobbyBtn?.addEventListener('click', () => this.enterLobby());
        this.usernameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.enterLobby(); });

        // Lobby
        this.createRoomBtn?.addEventListener('click', () => this.showModal(this.createRoomModal));
        this.refreshRoomsBtn?.addEventListener('click', () => this.refreshRooms());

        // Create Room Modal
        this.cancelCreateBtn?.addEventListener('click', () => this.hideModal(this.createRoomModal));
        this.confirmCreateBtn?.addEventListener('click', () => this.createRoom());

        // Password Modal
        this.cancelJoinBtn?.addEventListener('click', () => this.hideModal(this.passwordModal));
        this.confirmJoinBtn?.addEventListener('click', () => this.joinWithPassword());

        // Chat Room
        this.backToLobbyBtn?.addEventListener('click', () => this.leaveRoom());
        this.sendMessageBtn?.addEventListener('click', () => this.sendMessage());
        this.messageInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });
        this.messageInput?.addEventListener('input', () => this.handleTyping());

        // File upload
        this.fileBtn?.addEventListener('click', () => this.fileInput?.click());
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

        // Clipboard paste (Ctrl+V resim yapıştırma)
        document.addEventListener('paste', (e) => this.handlePaste(e));

        // Tabs
        this.chatTabs.forEach(tab => tab.addEventListener('click', () => this.switchTab(tab.dataset.tab)));

        // Settings
        this.roomSettingsBtn?.addEventListener('click', () => this.showModal(this.settingsModal));
        this.cancelSettingsBtn?.addEventListener('click', () => this.hideModal(this.settingsModal));
        this.saveSettingsBtn?.addEventListener('click', () => this.saveSettings());
    }

    showModal(modal) { modal?.classList.remove('hidden'); }
    hideModal(modal) { modal?.classList.add('hidden'); }

    switchTab(tabName) {
        this.chatTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        this.messagesTab?.classList.toggle('active', tabName === 'messages');
        this.usersTab?.classList.toggle('active', tabName === 'users');

        if (tabName === 'users' && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'get_users' }));
        }

        // Mesajlar tab'ına geçince bildirimleri temizle
        if (tabName === 'messages') {
            this.clearNotifications();
        }
    }

    // Typing indicator
    handleTyping() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Send typing start
        this.ws.send(JSON.stringify({ type: 'typing', isTyping: true }));

        // Clear previous timeout
        if (this.typingTimeout) clearTimeout(this.typingTimeout);

        // Stop typing after 2 seconds
        this.typingTimeout = setTimeout(() => {
            this.ws?.send(JSON.stringify({ type: 'typing', isTyping: false }));
        }, 2000);
    }

    updateTypingIndicator() {
        if (!this.typingIndicator) return;

        if (this.typingUsers.size === 0) {
            this.typingIndicator.classList.add('hidden');
            return;
        }

        const names = Array.from(this.typingUsers);
        let text = '';
        if (names.length === 1) {
            text = `${names[0]} yazıyor...`;
        } else if (names.length === 2) {
            text = `${names[0]} ve ${names[1]} yazıyor...`;
        } else {
            text = `${names.length} kişi yazıyor...`;
        }

        this.typingIndicator.textContent = text;
        this.typingIndicator.classList.remove('hidden');
    }

    // Reply
    setReplyTo(messageId, username, text) {
        this.replyingTo = { id: messageId, username, text };
        if (this.replyPreview) {
            this.replyPreview.innerHTML = `
                <div class="reply-content">
                    <span class="reply-user">${this.escapeHtml(username)}</span>
                    <span class="reply-text">${this.escapeHtml(text.substring(0, 50))}${text.length > 50 ? '...' : ''}</span>
                </div>
                <button class="cancel-reply" onclick="chat.cancelReply()">✕</button>
            `;
            this.replyPreview.classList.remove('hidden');
        }
        this.messageInput?.focus();
    }

    cancelReply() {
        this.replyingTo = null;
        if (this.replyPreview) {
            this.replyPreview.classList.add('hidden');
        }
    }

    // Connection
    async connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return true;
        this.showConnectionStatus('Sunucuya bağlanılıyor...');

        return new Promise((resolve) => {
            try {
                this.ws = new WebSocket(this.serverUrl);
                const timeout = setTimeout(() => {
                    this.ws.close();
                    this.showConnectionStatus('Bağlantı başarısız!', 'disconnected');
                    resolve(false);
                }, 5000);

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.isOnlineMode = true;
                    this.showConnectionStatus('Bağlandı ✓', 'connected');
                    setTimeout(() => this.hideConnectionStatus(), 2000);
                    resolve(true);
                };

                this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
                this.ws.onclose = () => { this.isOnlineMode = false; };
                this.ws.onerror = () => { clearTimeout(timeout); resolve(false); };
            } catch (e) { resolve(false); }
        });
    }

    handleMessage(data) {
        switch (data.type) {
            case 'room_list':
                this.renderRoomList(data.rooms);
                break;
            case 'room_created':
            case 'room_joined':
                this.currentRoom = data.room;
                this.myRole = data.role || 'member';
                this.showChatRoom();
                break;
            case 'room_error':
            case 'error':
                alert(data.message);
                break;
            case 'message':
                this.displayMessage(data);
                // Notification for others' messages
                if (data.username !== this.username) {
                    this.showNotification(data.username, data.text);
                    this.playNotificationSound();
                }
                break;
            case 'typing':
                if (data.isTyping) {
                    this.typingUsers.add(data.username);
                } else {
                    this.typingUsers.delete(data.username);
                }
                this.updateTypingIndicator();
                break;
            case 'user_joined':
                this.addSystemMessage(`${data.username} odaya katıldı`);
                break;
            case 'user_left':
                this.addSystemMessage(`${data.username} odadan ayrıldı`);
                this.typingUsers.delete(data.username);
                this.updateTypingIndicator();
                break;
            case 'user_list':
                this.users = data.users || [];
                this.updateUserCount();
                this.renderUsersList();
                break;
            case 'system_message':
                this.addSystemMessage(data.text);
                break;
            case 'role_updated':
                this.myRole = data.role;
                this.updateRoleUI();
                this.addSystemMessage(`Rolünüz: ${this.getRoleName(data.role)}`);
                break;
            case 'kicked':
                alert(data.message);
                this.leaveRoom();
                break;
            case 'password_changed':
                this.addSystemMessage(data.message);
                this.hideModal(this.settingsModal);
                break;
        }
    }

    // Tab notification (sekme başlığında bildirim)
    showNotification(username, text) {
        this.unreadCount = (this.unreadCount || 0) + 1;
        this.updateTabTitle();

        // Sekme yanıp sönsün
        if (!this.titleFlashing) {
            this.titleFlashing = true;
            this.originalTitle = document.title;
            this.flashTitle();
        }
    }

    flashTitle() {
        if (!this.titleFlashing) return;

        const isOriginal = document.title === this.originalTitle || document.title === '2048';
        if (isOriginal) {
            document.title = `(${this.unreadCount}) Yeni Mesaj!`;
        } else {
            document.title = this.originalTitle || '2048';
        }

        setTimeout(() => this.flashTitle(), 1000);
    }

    updateTabTitle() {
        if (this.unreadCount > 0) {
            document.title = `(${this.unreadCount}) 2048`;
        } else {
            document.title = '2048';
        }
    }

    clearNotifications() {
        this.unreadCount = 0;
        this.titleFlashing = false;
        document.title = '2048';
    }

    // Login
    async enterLobby() {
        const username = this.usernameInput?.value.trim();
        if (!username) { alert('Kullanıcı adı girin!'); return; }
        this.username = username;

        const connected = await this.connect();
        if (!connected) { alert('Sunucuya bağlanılamadı!'); return; }

        this.loginScreen?.classList.add('hidden');
        this.lobbyScreen?.classList.remove('hidden');
        if (this.usernameDisplay) this.usernameDisplay.textContent = `@${username}`;
        this.refreshRooms();
    }

    // Rooms
    refreshRooms() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'get_rooms' }));
        }
    }

    renderRoomList(rooms) {
        if (!this.roomsList) return;
        if (!rooms || rooms.length === 0) {
            this.roomsList.innerHTML = '<div class="no-rooms">Henüz oda yok. İlk odayı sen oluştur!</div>';
            return;
        }
        this.roomsList.innerHTML = rooms.map(room => `
            <div class="room-item" data-room-id="${room.id}" data-room-name="${this.escapeHtml(room.name)}" data-has-password="${room.hasPassword}">
                <div class="room-info"><h4>${this.escapeHtml(room.name)}</h4><span>${room.userCount} kişi</span></div>
                <span class="room-icon">${room.hasPassword ? '🔒' : '🚪'}</span>
            </div>
        `).join('');

        this.roomsList.querySelectorAll('.room-item').forEach(item => {
            item.addEventListener('click', () => this.attemptJoinRoom(item.dataset.roomId, item.dataset.roomName, item.dataset.hasPassword === 'true'));
        });
    }

    async createRoom() {
        const name = this.roomNameInput?.value.trim();
        const password = this.roomPasswordInput?.value.trim();
        if (!name) { alert('Oda adı girin!'); return; }
        if (!password) { alert('Şifre girin! (Şifreleme için gereklidir)'); return; }

        if (this.ws?.readyState === WebSocket.OPEN) {
            // E2E Encryption Setup
            this.cryptoKey = await cryptoUtils.deriveKey(password, name);
            const passwordHash = await cryptoUtils.hashPassword(password);

            this.ws.send(JSON.stringify({
                type: 'create_room',
                name,
                password: passwordHash,
                username: this.username
            }));
        }
        this.hideModal(this.createRoomModal);
        if (this.roomNameInput) this.roomNameInput.value = '';
        if (this.roomPasswordInput) this.roomPasswordInput.value = '';
    }

    attemptJoinRoom(roomId, roomName, hasPassword) {
        if (hasPassword) {
            this.pendingRoom = { id: roomId, name: roomName };
            this.showModal(this.passwordModal);
        } else {
            alert('Bu odaya şifresiz girilemez (E2E için şifre gereklidir).');
        }
    }

    async joinWithPassword() {
        if (!this.pendingRoom) return;
        const password = this.joinPasswordInput?.value;
        if (!password) return;

        // E2E Encryption Setup
        this.cryptoKey = await cryptoUtils.deriveKey(password, this.pendingRoom.name);
        const passwordHash = await cryptoUtils.hashPassword(password);

        this.joinRoom(this.pendingRoom.id, passwordHash);

        this.hideModal(this.passwordModal);
        if (this.joinPasswordInput) this.joinPasswordInput.value = '';
        this.pendingRoom = null;
    }

    joinRoom(roomId, password) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'join_room', roomId, password, username: this.username }));
        }
    }

    // Chat Room
    showChatRoom() {
        this.lobbyScreen?.classList.add('hidden');
        this.chatRoomScreen?.classList.remove('hidden');
        if (this.roomTitle) this.roomTitle.textContent = this.currentRoom?.name || 'Oda';
        if (this.messagesContainer) this.messagesContainer.innerHTML = '';
        this.users = [];
        this.messages.clear();
        this.typingUsers.clear();
        this.updateTypingIndicator();
        this.switchTab('messages');
        this.updateRoleUI();
        this.addSystemMessage('Odaya hoş geldiniz!');
        this.messageInput?.focus();
    }

    leaveRoom() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'leave_room' }));
        }
        this.currentRoom = null;
        this.myRole = 'member';
        this.users = [];
        this.replyingTo = null;
        this.cancelReply();
        this.chatRoomScreen?.classList.add('hidden');
        this.lobbyScreen?.classList.remove('hidden');
        this.refreshRooms();
    }

    async sendMessage() {
        const text = this.messageInput?.value.trim();
        if (!text) return;

        const messageData = { type: 'message' };

        // Encrypt text
        if (this.cryptoKey) {
            messageData.text = await cryptoUtils.encrypt(text, this.cryptoKey);
        } else {
            messageData.text = text;
        }

        if (this.replyingTo) {
            let encryptedReplyText = this.replyingTo.text;
            if (this.cryptoKey) {
                // Not: replyingTo.text zaten decrypted (görüntülenen) veri. Onu tekrar şifreliyoruz.
                // Sunucuya gönderirken şifreli olmalı.
                encryptedReplyText = await cryptoUtils.encrypt(this.replyingTo.text, this.cryptoKey);
            }

            messageData.replyTo = {
                id: this.replyingTo.id,
                username: this.replyingTo.username,
                text: encryptedReplyText
            };
        }

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(messageData));
        }

        if (this.messageInput) this.messageInput.value = '';
        this.cancelReply();

        // Stop typing
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.ws?.send(JSON.stringify({ type: 'typing', isTyping: false }));
    }

    handleFileSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Max 5MB
        if (file.size > 5 * 1024 * 1024) {
            alert('Dosya çok büyük! Maksimum 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            let fileData = reader.result;

            // Encrypt file data
            if (this.cryptoKey) {
                fileData = await cryptoUtils.encrypt(fileData, this.cryptoKey);
            }

            const messageData = {
                type: 'message',
                text: '',
                file: {
                    name: file.name,
                    type: file.type,
                    data: fileData
                }
            };

            if (this.replyingTo) {
                let encryptedReplyText = this.replyingTo.text;
                if (this.cryptoKey) {
                    encryptedReplyText = await cryptoUtils.encrypt(this.replyingTo.text, this.cryptoKey);
                }
                messageData.replyTo = {
                    id: this.replyingTo.id,
                    username: this.replyingTo.username,
                    text: encryptedReplyText
                };
            }

            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(messageData));
            }

            this.cancelReply();
        };

        reader.readAsDataURL(file);
        this.fileInput.value = ''; // Reset
    }

    handlePaste(e) {
        // Sadece chat açıkken ve odadaysak
        if (!this.currentRoom || !this.chatModal?.classList.contains('active')) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;

                // Max 5MB
                if (file.size > 5 * 1024 * 1024) {
                    alert('Resim çok büyük! Maksimum 5MB.');
                    return;
                }

                const reader = new FileReader();
                reader.onload = () => {
                    const messageData = {
                        type: 'message',
                        text: '',
                        file: {
                            name: `resim_${Date.now()}.png`,
                            type: file.type,
                            data: reader.result
                        }
                    };

                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify(messageData));
                    }
                };
                reader.readAsDataURL(file);
                break;
            }
        }
    }

    async displayMessage(data) {
        if (!this.messagesContainer) return;

        // Decrypt content
        if (this.cryptoKey) {
            if (data.text) {
                data.text = await cryptoUtils.decrypt(data.text, this.cryptoKey);
            }
            if (data.file) {
                data.file.data = await cryptoUtils.decrypt(data.file.data, this.cryptoKey);
            }
            if (data.replyTo && data.replyTo.text) {
                data.replyTo.text = await cryptoUtils.decrypt(data.replyTo.text, this.cryptoKey);
            }
        }

        const isOwn = data.username === this.username;
        const roleIcon = data.role === 'owner' ? '👑' : data.role === 'mod' ? '⚔️' : '';

        // Store message
        if (data.id) this.messages.set(data.id, data);

        const msg = document.createElement('div');
        msg.className = `message ${isOwn ? 'own' : 'other'}`;
        msg.dataset.messageId = data.id || '';

        let replyHtml = '';
        if (data.replyTo) {
            replyHtml = `
                <div class="message-reply">
                    <span class="reply-icon">↩</span>
                    <span class="reply-user">${this.escapeHtml(data.replyTo.username)}</span>
                    <span class="reply-text">${this.escapeHtml(data.replyTo.text?.substring(0, 30) || '')}...</span>
                </div>
            `;
        }

        // Text with clickable links
        let textHtml = '';
        if (data.text) {
            textHtml = this.linkify(this.escapeHtml(data.text));
        }

        // File/Image content
        let fileHtml = '';
        if (data.file) {
            if (data.file.type?.startsWith('image/')) {
                fileHtml = `<img src="${data.file.data}" class="message-image" onclick="chat.openImageLightbox('${data.file.data}')" alt="${this.escapeHtml(data.file.name)}">`;
            } else {
                const icon = this.getFileIcon(data.file.name);
                fileHtml = `<a href="${data.file.data}" download="${this.escapeHtml(data.file.name)}" class="message-file">${icon} ${this.escapeHtml(data.file.name)}</a>`;
            }
        }

        msg.innerHTML = `
            ${replyHtml}
            <div class="message-header">
                <span class="message-username">${roleIcon} ${this.escapeHtml(data.username)}</span>
                <span class="message-time">${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${textHtml ? `<div class="message-text">${textHtml}</div>` : ''}
            ${fileHtml}
            <button class="reply-btn" onclick="chat.setReplyTo('${data.id}', '${this.escapeHtml(data.username)}', '${this.escapeHtml(data.text || '').replace(/'/g, "\\'")}')">↩</button>
        `;

        this.messagesContainer.appendChild(msg);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    linkify(text) {
        // URL'leri tıklanabilir link yap
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        const icons = {
            pdf: '📄',
            doc: '📝', docx: '📝',
            txt: '📃',
            zip: '📦', rar: '📦',
            default: '📎'
        };
        return icons[ext] || icons.default;
    }

    addSystemMessage(text) {
        if (!this.messagesContainer) return;
        const msg = document.createElement('div');
        msg.className = 'system-message';
        msg.textContent = text;
        this.messagesContainer.appendChild(msg);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // Users
    updateUserCount() {
        const onlineCount = this.users.filter(u => u.online !== false).length;
        if (this.userCount) this.userCount.textContent = onlineCount;
    }

    updateRoleUI() {
        const icon = this.myRole === 'owner' ? '👑' : this.myRole === 'mod' ? '⚔️' : '👤';
        if (this.myRoleDisplay) {
            this.myRoleDisplay.textContent = icon;
            this.myRoleDisplay.title = this.getRoleName(this.myRole);
        }
        if (this.roomSettingsBtn) {
            this.roomSettingsBtn.classList.toggle('hidden', this.myRole !== 'owner');
        }
    }

    getRoleName(role) {
        return { owner: 'Oda Kurucusu', mod: 'Yardımcı', member: 'Üye' }[role] || 'Üye';
    }

    renderUsersList() {
        if (!this.usersList) return;
        if (this.users.length === 0) {
            this.usersList.innerHTML = '<div class="no-users">Henüz kimse yok</div>';
            return;
        }

        this.usersList.innerHTML = this.users.map(user => {
            const isMe = user.username === this.username;
            const icon = user.role === 'owner' ? '👑' : user.role === 'mod' ? '⚔️' : '';
            const isOnline = user.online !== false;
            const offlineClass = isOnline ? '' : 'offline';
            const statusText = isOnline ? this.getRoleName(user.role) : 'Çevrimdışı';
            const canKick = (this.myRole === 'owner' || this.myRole === 'mod') && !isMe && user.role !== 'owner';
            const canPromote = this.myRole === 'owner' && user.role === 'member';
            const canDemote = this.myRole === 'owner' && user.role === 'mod';

            return `
                <div class="user-item ${isMe ? 'self' : ''} role-${user.role} ${offlineClass}">
                    <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                    <div class="user-details">
                        <div class="user-name">${icon} ${this.escapeHtml(user.username)} ${isMe ? '<span class="you-badge">Sen</span>' : ''}</div>
                        <div class="user-role-text ${offlineClass}">${statusText}</div>
                    </div>
                    <div class="user-actions">
                        ${canPromote ? `<button class="action-icon-btn" onclick="chat.promoteMod('${user.username}')" title="Yardımcı Yap">⬆️</button>` : ''}
                        ${canDemote ? `<button class="action-icon-btn" onclick="chat.demoteMod('${user.username}')" title="Yetkiyi Al">⬇️</button>` : ''}
                        ${canKick ? `<button class="action-icon-btn kick" onclick="chat.kickUser('${user.username}')" title="At">🚫</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Actions
    kickUser(username) {
        if (!confirm(`${username} kullanıcısını atmak istiyor musunuz?`)) return;
        this.ws?.send(JSON.stringify({ type: 'kick_user', targetUsername: username }));
    }

    promoteMod(username) {
        if (!confirm(`${username} kullanıcısını yardımcı yapmak istiyor musunuz?`)) return;
        this.ws?.send(JSON.stringify({ type: 'promote_mod', targetUsername: username }));
    }

    demoteMod(username) {
        if (!confirm(`${username} kullanıcısının yetkisini almak istiyor musunuz?`)) return;
        this.ws?.send(JSON.stringify({ type: 'demote_mod', targetUsername: username }));
    }

    saveSettings() {
        const newPassword = this.newPasswordInput?.value || null;
        this.ws?.send(JSON.stringify({ type: 'change_password', newPassword }));
        if (this.newPasswordInput) this.newPasswordInput.value = '';
    }

    // Utils
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showConnectionStatus(text, state = '') {
        if (!this.connectionStatus) return;
        this.connectionStatus.classList.remove('hidden', 'connected', 'disconnected');
        if (state) this.connectionStatus.classList.add(state);
        const statusText = this.connectionStatus.querySelector('.status-text');
        if (statusText) statusText.textContent = text;
    }

    hideConnectionStatus() {
        this.connectionStatus?.classList.add('hidden');
    }

    // Image Lightbox
    openImageLightbox(imageSrc) {
        // Lightbox yoksa oluştur
        let lightbox = document.getElementById('imageLightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.id = 'imageLightbox';
            lightbox.className = 'image-lightbox';
            lightbox.innerHTML = `
                <div class="lightbox-content">
                    <img src="" alt="Büyütülmüş Resim">
                    <button class="lightbox-close">&times;</button>
                </div>
            `;
            document.body.appendChild(lightbox);

            // Kapatma olayları
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
                    this.closeLightbox();
                }
            });
        }

        const img = lightbox.querySelector('img');
        img.src = imageSrc;
        lightbox.classList.add('active');
    }

    closeLightbox() {
        const lightbox = document.getElementById('imageLightbox');
        if (lightbox) lightbox.classList.remove('active');
    }

    closeChat() {
        this.chatModal?.classList.remove('active');
        if (this.currentRoom) this.leaveRoom();
        this.chatRoomScreen?.classList.add('hidden');
        this.lobbyScreen?.classList.add('hidden');
        this.loginScreen?.classList.remove('hidden');
    }
}

let chat;
document.addEventListener('DOMContentLoaded', () => { chat = new SecretChat(); });
