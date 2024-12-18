const WebSocket = require('ws');

const server = new WebSocket.Server({ port: process.env.PORT || 3000 });
let participants = []; // 参加者ごとのWebSocket
let admin = null; // 管理者のWebSocket

server.on('connection', (ws, req) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // メッセージの種類で分岐
        switch (data.type) {
            case 'participant-register': {
                // 参加者を登録
                participants.push({ name: data.name, ws, locked: false });
                break;
            }
            case 'buzz': {
                // 早押し通知
                participants.forEach((p) => {
                    if (p.ws === ws) {
                        p.locked = true;
                        p.ws.send(JSON.stringify({ type: 'buzz-self' }));
                    } else {
                        p.ws.send(JSON.stringify({ type: 'buzz-other' }));
                    }
                });
                if (admin) {
                    admin.send(JSON.stringify({ type: 'buzz', name: data.name }));
                }
                break;
            }
            case 'admin-register': {
                // 管理者を登録
                admin = ws;
                break;
            }
            case 'correct': {
                // 正答通知
                participants.forEach((p) => {
                    p.ws.send(JSON.stringify({ type: 'correct' }));
                });
                break;
            }
            case 'incorrect': {
                // 誤答通知
                participants.forEach((p) => {
                    p.ws.send(JSON.stringify({ type: 'incorrect' }));
                });
                break;
            }
            case 'reset': {
                // ボタン状態をリセット
                participants.forEach((p) => {
                    p.locked = false;
                    p.ws.send(JSON.stringify({ type: 'reset' }));
                });
                break;
            }
            case 'next': {
                // 次の問題に進む
                participants.forEach((p) => {
                    p.locked = false;
                    p.ws.send(JSON.stringify({ type: 'next' }));
                });
                break;
            }
        }
    });

    ws.on('close', () => {
        participants = participants.filter((p) => p.ws !== ws);
        if (admin === ws) admin = null;
    });
});
