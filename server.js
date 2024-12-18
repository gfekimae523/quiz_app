const WebSocket = require('ws');
const http = require('http');

// サーバーの設定
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// クライアント情報
let clients = [];
let admin = null;

wss.on('connection', (ws, req) => {
    const clientType = req.url.split('?')[1]; // 'participant' または 'admin'

    if (clientType === 'admin') {
        admin = ws;
    } else {
        clients.push(ws);
    }

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // メッセージ処理
        if (clientType === 'admin') {
            if (data.type === 'correct' || data.type === 'incorrect') {
                clients.forEach((client) => {
                    client.send(JSON.stringify({ type: data.type }));
                });
            } else if (data.type === 'reset') {
                clients.forEach((client) => {
                    client.send(JSON.stringify({ type: 'reset', excluded: data.excluded }));
                });
            } else if (data.type === 'next') {
                clients.forEach((client) => {
                    client.send(JSON.stringify({ type: 'next' }));
                });
            }
        } else {
            if (data.type === 'buzz') {
                if (admin) {
                    admin.send(JSON.stringify({ type: 'buzz', participant: data.participant }));
                }
                clients.forEach((client) => {
                    if (client !== ws) {
                        client.send(JSON.stringify({ type: 'buzzed' }));
                    }
                });
                ws.send(JSON.stringify({ type: 'you_buzzed' }));
            }
        }
    });

    ws.on('close', () => {
        if (clientType === 'admin') {
            admin = null;
        } else {
            clients = clients.filter((client) => client !== ws);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
