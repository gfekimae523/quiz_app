const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ゲーム状態を管理
const gameState = {
    currentQuestionState: {
        firstPressed: null,
        disabledPlayers: [],
        isQuestionActive: false
    },
    clients: {
        participants: new Set(),
        admin: null
    }
};

// クライアント接続の管理
wss.on('connection', (ws, req) => {
    const urlPath = req.url;

    if (urlPath === '/quiz') {
        // 参加者用WebSocket
        handleParticipantConnection(ws);
    } else if (urlPath === '/admin') {
        // 管理者用WebSocket
        handleAdminConnection(ws);
    }

    // 接続解除時の処理
    ws.on('close', () => {
        gameState.clients.participants.delete(ws);
        if (ws === gameState.clients.admin) {
            gameState.clients.admin = null;
        }
    });
});

// 参加者接続処理
function handleParticipantConnection(ws) {
    gameState.clients.participants.add(ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'buttonPress':
                handleButtonPress(ws, data.player);
                break;
        }
    });
}

// 管理者接続処理
function handleAdminConnection(ws) {
    gameState.clients.admin = ws;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'correct':
                broadcastToParticipants({
                    type: 'correct',
                    player: gameState.currentQuestionState.firstPressed
                });
                resetQuestionState();
                break;

            case 'incorrect':
                if (gameState.currentQuestionState.firstPressed) {
                    gameState.currentQuestionState.disabledPlayers.push(
                        gameState.currentQuestionState.firstPressed
                    );
                }
                broadcastToParticipants({
                    type: 'incorrect',
                    player: gameState.currentQuestionState.firstPressed
                });
                break;

            case 'reset':
                gameStete.currentQuestionState.firstPressed = null;
                broadcastToParticipants({
                    type: 'reset',
                    disabledPlayers: gameState.currentQuestionState.disabledPlayers
                });
                break;

            case 'nextQuestion':
                gameState.currentQuestionState = {
                    firstPressed: null,
                    disabledPlayers: [],
                    isQuestionActive: true
                };
                broadcastToParticipants({
                    type: 'quizStart'
                });
                break;
        }
    });
}

// ボタン押下処理
function handleButtonPress(ws, player) {
    // 最初の人以外のボタン押下を防ぐ
    if (gameState.currentQuestionState.firstPressed || 
        gameState.currentQuestionState.disabledPlayers.includes(player)) {
        return;
    }

    gameState.currentQuestionState.firstPressed = player;

    // 全参加者にボタン押下を通知
    broadcastToParticipants({
        type: 'buttonPressed',
        player: player
    });

    // 管理者に状態を通知
    if (gameState.clients.admin) {
        gameState.clients.admin.send(JSON.stringify({
            type: 'playerStatus',
            player: player
        }));
    }
}

// 参加者への一斉送信
function broadcastToParticipants(message) {
    gameState.clients.participants.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// 問題状態のリセット
function resetQuestionState() {
    gameState.currentQuestionState = {
        firstPressed: null,
        disabledPlayers: [],
        isQuestionActive: false
    };
}

// 静的ファイル提供
app.use(express.static(path.join(__dirname, 'docs')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'admin.html'));
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`サーバーが${PORT}番ポートで起動しました`);
});
