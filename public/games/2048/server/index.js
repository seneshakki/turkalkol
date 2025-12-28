/**
 * Gizli Sohbet Odası - Discord Tarzı WebSocket Sunucu
 * Roller: owner (kurucu), mod (yardımcı), member (üye)
 * Çevrimdışı kullanıcılar korunur, sadece "odadan ayrıl" ile çıkılır
 */

const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

// Bellekte tutulan odalar
const rooms = new Map();

// Kullanıcı-WebSocket eşleştirmesi
const clients = new Map();

function generateId() {
    return Math.random().toString(36).substring(2, 9);
}

wss.on('connection', (ws) => {
    const clientId = generateId();
    clients.set(ws, { id: clientId, username: null, roomId: null, role: 'member' });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (e) { }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        if (client && client.roomId) {
            // Çevrimdışı yap, odadan ATMA!
            setUserOffline(ws, client.roomId);
        }
        clients.delete(ws);
    });
});

function handleMessage(ws, data) {
    const client = clients.get(ws);

    switch (data.type) {
        case 'get_rooms':
            sendRoomList(ws);
            break;

        case 'create_room':
            createRoom(ws, data.name, data.password, data.username);
            break;

        case 'join_room':
            joinRoom(ws, data.roomId, data.password, data.username);
            break;

        case 'leave_room':
            // Sadece bu komutla odadan ayrılır
            if (client.roomId) leaveRoom(ws, client.roomId, true);
            break;

        case 'message':
            if (client.roomId) broadcastMessage(ws, data.text, data.replyTo, data.file);
            break;

        case 'typing':
            if (client.roomId) broadcastTyping(ws, data.isTyping);
            break;

        case 'kick_user':
            if (client.roomId) kickUser(ws, data.targetUsername);
            break;

        case 'promote_mod':
            if (client.roomId) promoteMod(ws, data.targetUsername);
            break;

        case 'demote_mod':
            if (client.roomId) demoteMod(ws, data.targetUsername);
            break;

        case 'change_password':
            if (client.roomId) changePassword(ws, data.newPassword);
            break;

        case 'get_users':
            if (client.roomId) sendUserList(ws, client.roomId);
            break;
    }
}

function sendRoomList(ws) {
    const roomList = [];
    rooms.forEach((room, id) => {
        const onlineCount = Array.from(room.users.values()).filter(u => u.online).length;
        roomList.push({
            id: id,
            name: room.name,
            userCount: onlineCount,
            hasPassword: !!room.password
        });
    });
    ws.send(JSON.stringify({ type: 'room_list', rooms: roomList }));
}

function createRoom(ws, name, password, username) {
    if (!name || !username) return;

    const client = clients.get(ws);
    client.username = username;
    client.role = 'owner';

    const roomId = generateId();
    const room = {
        id: roomId,
        name: name.substring(0, 30),
        password: password || null,
        users: new Map(), // username -> { ws, role, online }
        mods: new Set(),
        createdAt: Date.now()
    };

    room.users.set(username, { ws, role: 'owner', online: true });
    rooms.set(roomId, room);
    client.roomId = roomId;

    ws.send(JSON.stringify({
        type: 'room_created',
        room: { id: roomId, name: room.name, userCount: 1 },
        role: 'owner'
    }));

    sendUserListToRoom(roomId);
}

function joinRoom(ws, roomId, password, username) {
    const room = rooms.get(roomId);
    if (!room) {
        ws.send(JSON.stringify({ type: 'room_error', message: 'Oda bulunamadı!' }));
        return;
    }

    if (room.password && room.password !== password) {
        ws.send(JSON.stringify({ type: 'room_error', message: 'Yanlış şifre!' }));
        return;
    }

    const client = clients.get(ws);
    client.username = username;
    client.roomId = roomId;

    // Daha önce odadaydı mı?
    const existingUser = room.users.get(username);
    let role = 'member';

    if (existingUser) {
        // Geri döndü - rolünü koru, online yap
        role = existingUser.role;
        existingUser.ws = ws;
        existingUser.online = true;
        client.role = role;

        broadcastToRoom(roomId, {
            type: 'system_message',
            text: `${username} yeniden bağlandı.`
        }, ws);
    } else {
        // Yeni kullanıcı
        role = room.mods.has(username) ? 'mod' : 'member';
        client.role = role;
        room.users.set(username, { ws, role, online: true });

        broadcastToRoom(roomId, {
            type: 'user_joined',
            username: username,
            role: role
        }, ws);
    }

    ws.send(JSON.stringify({
        type: 'room_joined',
        room: { id: roomId, name: room.name },
        role: role
    }));

    sendUserListToRoom(roomId);
}

function setUserOffline(ws, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const client = clients.get(ws);
    const username = client.username;
    const user = room.users.get(username);

    if (user) {
        user.online = false;
        user.ws = null;

        broadcastToRoom(roomId, {
            type: 'system_message',
            text: `${username} çevrimdışı oldu.`
        });

        sendUserListToRoom(roomId);
    }

    client.roomId = null;
}

function leaveRoom(ws, roomId, explicit = false) {
    const room = rooms.get(roomId);
    if (!room) return;

    const client = clients.get(ws);
    const username = client.username;
    const user = room.users.get(username);
    const wasOwner = user?.role === 'owner';

    // Kullanıcıyı odadan tamamen sil
    room.users.delete(username);
    room.mods.delete(username);
    client.roomId = null;
    client.role = 'member';

    // Oda boş mu?
    if (room.users.size === 0) {
        rooms.delete(roomId);
        return;
    }

    // Kurucu ayrıldıysa yeni kurucu seç
    if (wasOwner) {
        transferOwnership(roomId);
    }

    broadcastToRoom(roomId, {
        type: 'user_left',
        username: username
    });

    broadcastToRoom(roomId, {
        type: 'system_message',
        text: `${username} odadan ayrıldı.`
    });

    sendUserListToRoom(roomId);
}

function transferOwnership(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.users.size === 0) return;

    // Önce mod'ları, sonra member'ları al, online olanları tercih et
    const users = Array.from(room.users.entries());

    // Sırala: role (mod > member), online (online > offline), isim
    users.sort((a, b) => {
        const roleOrder = { mod: 0, member: 1 };
        const aRole = roleOrder[a[1].role] ?? 1;
        const bRole = roleOrder[b[1].role] ?? 1;
        if (aRole !== bRole) return aRole - bRole;

        // Online tercih
        if (a[1].online !== b[1].online) return a[1].online ? -1 : 1;

        // Alfabetik
        return a[0].localeCompare(b[0]);
    });

    const newOwner = users[0];
    if (newOwner) {
        const [username, userData] = newOwner;
        userData.role = 'owner';
        room.mods.delete(username);

        // Client'ı da güncelle
        if (userData.ws && userData.online) {
            const client = clients.get(userData.ws);
            if (client) client.role = 'owner';
            userData.ws.send(JSON.stringify({ type: 'role_updated', role: 'owner' }));
        }

        broadcastToRoom(roomId, {
            type: 'system_message',
            text: `${username} yeni oda kurucusu oldu!`
        });

        sendUserListToRoom(roomId);
    }
}

function kickUser(ws, targetUsername) {
    const client = clients.get(ws);
    const room = rooms.get(client.roomId);
    if (!room) return;

    if (client.role !== 'owner' && client.role !== 'mod') {
        ws.send(JSON.stringify({ type: 'error', message: 'Bu işlem için yetkiniz yok!' }));
        return;
    }

    const targetUser = room.users.get(targetUsername);
    if (!targetUser) return;

    if (targetUser.role === 'owner') {
        ws.send(JSON.stringify({ type: 'error', message: 'Oda kurucusunu atamazsınız!' }));
        return;
    }

    if (client.role === 'mod' && targetUser.role === 'mod') {
        ws.send(JSON.stringify({ type: 'error', message: 'Başka bir yardımcıyı atamazsınız!' }));
        return;
    }

    // Kullanıcıyı at
    room.users.delete(targetUsername);
    room.mods.delete(targetUsername);

    if (targetUser.ws && targetUser.online) {
        const targetClient = clients.get(targetUser.ws);
        if (targetClient) {
            targetClient.roomId = null;
            targetClient.role = 'member';
        }
        targetUser.ws.send(JSON.stringify({ type: 'kicked', message: 'Odadan atıldınız!' }));
    }

    broadcastToRoom(client.roomId, {
        type: 'system_message',
        text: `${targetUsername} odadan atıldı.`
    });

    sendUserListToRoom(client.roomId);
}

function promoteMod(ws, targetUsername) {
    const client = clients.get(ws);
    const room = rooms.get(client.roomId);
    if (!room) return;

    if (client.role !== 'owner') {
        ws.send(JSON.stringify({ type: 'error', message: 'Sadece oda kurucusu yardımcı atayabilir!' }));
        return;
    }

    const targetUser = room.users.get(targetUsername);
    if (!targetUser || targetUser.role === 'owner') return;

    targetUser.role = 'mod';
    room.mods.add(targetUsername);

    if (targetUser.ws && targetUser.online) {
        const targetClient = clients.get(targetUser.ws);
        if (targetClient) targetClient.role = 'mod';
        targetUser.ws.send(JSON.stringify({ type: 'role_updated', role: 'mod' }));
    }

    broadcastToRoom(client.roomId, {
        type: 'system_message',
        text: `${targetUsername} artık yardımcı!`
    });

    sendUserListToRoom(client.roomId);
}

function demoteMod(ws, targetUsername) {
    const client = clients.get(ws);
    const room = rooms.get(client.roomId);
    if (!room) return;

    if (client.role !== 'owner') {
        ws.send(JSON.stringify({ type: 'error', message: 'Sadece oda kurucusu yardımcıyı indirebilir!' }));
        return;
    }

    const targetUser = room.users.get(targetUsername);
    if (!targetUser) return;

    targetUser.role = 'member';
    room.mods.delete(targetUsername);

    if (targetUser.ws && targetUser.online) {
        const targetClient = clients.get(targetUser.ws);
        if (targetClient) targetClient.role = 'member';
        targetUser.ws.send(JSON.stringify({ type: 'role_updated', role: 'member' }));
    }

    broadcastToRoom(client.roomId, {
        type: 'system_message',
        text: `${targetUsername} artık normal üye.`
    });

    sendUserListToRoom(client.roomId);
}

function changePassword(ws, newPassword) {
    const client = clients.get(ws);
    const room = rooms.get(client.roomId);
    if (!room) return;

    if (client.role !== 'owner') {
        ws.send(JSON.stringify({ type: 'error', message: 'Sadece oda kurucusu şifre değiştirebilir!' }));
        return;
    }

    room.password = newPassword || null;

    ws.send(JSON.stringify({
        type: 'password_changed',
        hasPassword: !!newPassword,
        message: newPassword ? 'Şifre güncellendi!' : 'Şifre kaldırıldı!'
    }));

    broadcastToRoom(client.roomId, {
        type: 'system_message',
        text: newPassword ? 'Oda şifresi değiştirildi.' : 'Oda şifresi kaldırıldı.'
    });
}

function sendUserList(ws, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const users = [];
    room.users.forEach((user, username) => {
        users.push({
            username,
            role: user.role,
            online: user.online
        });
    });

    // Sırala: rol -> alfabetik
    users.sort((a, b) => {
        const order = { owner: 0, mod: 1, member: 2 };
        if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
        return a.username.localeCompare(b.username);
    });

    ws.send(JSON.stringify({ type: 'user_list', users }));
}

function sendUserListToRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const users = [];
    room.users.forEach((user, username) => {
        users.push({
            username,
            role: user.role,
            online: user.online
        });
    });

    // Sırala: rol -> alfabetik
    users.sort((a, b) => {
        const order = { owner: 0, mod: 1, member: 2 };
        if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
        return a.username.localeCompare(b.username);
    });

    room.users.forEach((user) => {
        if (user.ws && user.online) {
            user.ws.send(JSON.stringify({ type: 'user_list', users }));
        }
    });
}

function broadcastMessage(ws, text, replyTo = null, file = null) {
    const client = clients.get(ws);
    const room = rooms.get(client.roomId);
    if (!room || (!text && !file)) return;

    const messageId = Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const message = {
        type: 'message',
        id: messageId,
        username: client.username,
        role: client.role,
        text: text ? text.substring(0, 500) : '',
        replyTo: replyTo || null,
        file: file || null
    };

    room.users.forEach((user) => {
        if (user.ws && user.online) {
            user.ws.send(JSON.stringify(message));
        }
    });
}

function broadcastTyping(ws, isTyping) {
    const client = clients.get(ws);
    const room = rooms.get(client.roomId);
    if (!room) return;

    const data = {
        type: 'typing',
        username: client.username,
        isTyping: isTyping
    };

    room.users.forEach((user) => {
        if (user.ws && user.online && user.ws !== ws) {
            user.ws.send(JSON.stringify(data));
        }
    });
}

function broadcastToRoom(roomId, data, excludeWs = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.users.forEach((user) => {
        if (user.ws && user.online && user.ws !== excludeWs) {
            user.ws.send(JSON.stringify(data));
        }
    });
}

console.log(`Gizli Sohbet Sunucusu çalışıyor: ws://localhost:${PORT}`);
console.log('Özellikler: Çevrimdışı durumu, rol korunması, kurucu transferi, yazıyor göstergesi');
