const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// HTTPサーバーの設定
const server = http.createServer((req, res) => {
  const filePath = req.url === '/' ? '/index.html' : req.url;
  const fullPath = path.join(__dirname, filePath);
  const contentType = getContentType(filePath);

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

// コンテンツタイプを取得する関数
function getContentType(filePath) {
  const extname = path.extname(filePath);
  switch (extname) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    default:
      return 'text/plain';
  }
}

// WebSocketサーバーの設定
const wss = new WebSocket.Server({ server });

// ゲーム状態の管理
const gameState = {
  teams: {
    'A': { bingoSheet: generateBingoSheet(), eliminated: false },
    'B': { bingoSheet: generateBingoSheet(), eliminated: false },
    'C': { bingoSheet: generateBingoSheet(), eliminated: false },
    'D': { bingoSheet: generateBingoSheet(), eliminated: false }
  },
  quizState: 'waiting', // waiting, active, answered
  currentQuestion: '',
  answeredNumbers: [],
  lastAnsweredTeam: null,
  buzzerQueue: []
};

// ビンゴシートを生成する関数
function generateBingoSheet() {
  const numbers = [];
  for (let i = 1; i <= 75; i++) {
    numbers.push(i);
  }
  
  // 配列をシャッフル
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  
  // 5x5のシートを作成
  const sheet = [];
  for (let i = 0; i < 5; i++) {
    const row = [];
    for (let j = 0; j < 5; j++) {
      const index = i * 5 + j;
      if (index === 12) { // 中央はフリースペース
        row.push({ value: 'FREE', marked: true });
      } else {
        row.push({ value: numbers.pop(), marked: false });
      }
    }
    sheet.push(row);
  }
  
  return sheet;
}

// ビンゴかどうかチェックする関数
function checkBingo(sheet) {
  // 横方向
  for (let i = 0; i < 5; i++) {
    if (sheet[i].every(cell => cell.marked)) {
      return true;
    }
  }
  
  // 縦方向
  for (let j = 0; j < 5; j++) {
    let column = true;
    for (let i = 0; i < 5; i++) {
      if (!sheet[i][j].marked) {
        column = false;
        break;
      }
    }
    if (column) return true;
  }
  
  // 対角線
  let diagonal1 = true;
  let diagonal2 = true;
  for (let i = 0; i < 5; i++) {
    if (!sheet[i][i].marked) diagonal1 = false;
    if (!sheet[i][4-i].marked) diagonal2 = false;
  }
  
  return diagonal1 || diagonal2;
}

// 数字をマークする関数
function markNumber(number) {
  let bingoOccurred = false;
  const teamsWithBingo = [];
  
  for (const [teamId, team] of Object.entries(gameState.teams)) {
    if (team.eliminated) continue;
    
    // シート上の数字を探してマーク
    let found = false;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (team.bingoSheet[i][j].value === number) {
          team.bingoSheet[i][j].marked = true;
          found = true;
        }
      }
    }
    
    // ビンゴをチェック
    if (found && checkBingo(team.bingoSheet)) {
      team.eliminated = true;
      teamsWithBingo.push(teamId);
      bingoOccurred = true;
    }
  }
  
  return { bingoOccurred, teamsWithBingo };
}

// クライアント接続の管理
const clients = {
  admin: [],
  players: [],
  screens: []
};

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  let clientType = null;
  let clientTeam = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'register':
          clientType = data.clientType;
          if (clientType === 'player') {
            clientTeam = data.team;
          }
          clients[clientType].push(ws);
          
          // 初期データを送信
          if (clientType === 'player') {
            ws.send(JSON.stringify({
              type: 'init',
              bingoSheet: gameState.teams[clientTeam].bingoSheet,
              quizState: gameState.quizState,
              answeredNumbers: gameState.answeredNumbers,
              eliminated: gameState.teams[clientTeam].eliminated
            }));
          } else if (clientType === 'screen') {
            ws.send(JSON.stringify({
              type: 'init',
              teams: gameState.teams,
              quizState: gameState.quizState,
              answeredNumbers: gameState.answeredNumbers
            }));
          } else if (clientType === 'admin') {
            ws.send(JSON.stringify({
              type: 'init',
              teams: gameState.teams,
              quizState: gameState.quizState,
              buzzerQueue: gameState.buzzerQueue,
              answeredNumbers: gameState.answeredNumbers
            }));
          }
          break;
          
        case 'startQuiz':
          gameState.quizState = 'active';
          gameState.currentQuestion = data.question || '';
          gameState.buzzerQueue = [];
          
          // 全プレイヤーに通知
          broadcastToAll({
            type: 'quizStarted',
            question: gameState.currentQuestion
          });
          break;
          
        case 'buzzer':
          if (gameState.quizState === 'active' && !gameState.teams[data.team].eliminated) {
            // 既にキューに入っていなければ追加
            if (!gameState.buzzerQueue.includes(data.team)) {
              gameState.buzzerQueue.push(data.team);
              
              // 管理者に通知
              broadcastToAdmin({
                type: 'buzzerUpdate',
                queue: gameState.buzzerQueue
              });
            }
          }
          break;
          
        case 'answerCorrect':
          if (gameState.buzzerQueue.length > 0) {
            gameState.quizState = 'answered';
            gameState.lastAnsweredTeam = gameState.buzzerQueue[0];
            
            // 正解チームに数字選択を促す
            broadcastToTeam(gameState.lastAnsweredTeam, {
              type: 'selectNumber'
            });
            
            // 他のクライアントに通知
            broadcastToAll({
              type: 'answerResult',
              result: 'correct',
              team: gameState.lastAnsweredTeam
            });
          }
          break;
          
        case 'answerIncorrect':
          if (gameState.buzzerQueue.length > 0) {
            // 不正解チームをキューから削除
            const incorrectTeam = gameState.buzzerQueue.shift();
            
            broadcastToAll({
              type: 'answerResult',
              result: 'incorrect',
              team: incorrectTeam
            });
            
            // 管理者に更新されたキューを通知
            broadcastToAdmin({
              type: 'buzzerUpdate',
              queue: gameState.buzzerQueue
            });
          }
          break;
          
        case 'selectNumber':
          if (gameState.quizState === 'answered' && data.team === gameState.lastAnsweredTeam) {
            const number = parseInt(data.number);
            
            // 既に選ばれた数字でないことを確認
            if (!gameState.answeredNumbers.includes(number)) {
              gameState.answeredNumbers.push(number);
              
              // 数字をマーク
              const { bingoOccurred, teamsWithBingo } = markNumber(number);
              
              // 全クライアントに通知
              broadcastToAll({
                type: 'numberSelected',
                number: number,
                team: data.team
              });
              
              // ビンゴの場合
              if (bingoOccurred) {
                broadcastToAll({
                  type: 'bingoOccurred',
                  teams: teamsWithBingo
                });
                
                // 残りのチーム数をチェック
                const remainingTeams = Object.entries(gameState.teams)
                  .filter(([_, team]) => !team.eliminated)
                  .map(([id, _]) => id);
                
                if (remainingTeams.length === 1) {
                  // ゲーム終了
                  broadcastToAll({
                    type: 'gameOver',
                    winner: remainingTeams[0]
                  });
                }
              }
              
              // 管理者に通知して次の問題に進む準備
              broadcastToAdmin({
                type: 'readyForNextQuestion'
              });
            }
          }
          break;
          
        case 'nextQuestion':
          gameState.quizState = 'waiting';
          gameState.buzzerQueue = [];
          
          broadcastToAll({
            type: 'waitingForNextQuestion'
          });
          break;
          
        case 'resetGame':
          // ゲームをリセット
          for (const team of Object.values(gameState.teams)) {
            team.bingoSheet = generateBingoSheet();
            team.eliminated = false;
          }
          gameState.quizState = 'waiting';
          gameState.answeredNumbers = [];
          gameState.buzzerQueue = [];
          
          broadcastToAll({
            type: 'gameReset'
          });
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    if (clientType) {
      const index = clients[clientType].indexOf(ws);
      if (index !== -1) {
        clients[clientType].splice(index, 1);
      }
    }
  });
});

// 特定のチームにメッセージを送信
function broadcastToTeam(teamId, message) {
  clients.players.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.teamId === teamId) {
      client.send(JSON.stringify(message));
    }
  });
}

// 管理者にメッセージを送信
function broadcastToAdmin(message) {
  clients.admin.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// すべてのクライアントにメッセージを送信
function broadcastToAll(message) {
  Object.values(clients).flat().forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// サーバーの起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});