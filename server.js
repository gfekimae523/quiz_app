// server.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath = './';
  if (req.url === '/') filePath += 'index.html';
  else if (req.url === '/admin') filePath += 'admin.html';
  else filePath += req.url;

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.mp3': 'audio/mpeg',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading file');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
});

const wss = new WebSocket.Server({ server });

let state = {
  pressedBy: null, // participant_id of the first presser
  excluded: [], // participants excluded due to incorrect answers
};

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'button_press':
        if (!state.pressedBy && !state.excluded.includes(data.participant_id)) {
          state.pressedBy = data.participant_id;
          broadcast({ type: 'button_press', participant_id: data.participant_id });
        }
        break;

      case 'correct':
        broadcast({ type: 'correct' });
        break;

      case 'incorrect':
        state.excluded.push(state.pressedBy);
        broadcast({ type: 'incorrect', participant_id: state.pressedBy });
        break;

      case 'reset':
        state.pressedBy = null;
        broadcast({ type: 'reset', excluded: state.excluded });
        break;

      case 'next':
        state = { pressedBy: null, excluded: [] };
        broadcast({ type: 'next' });
        break;

      default:
        console.log('Unknown event:', data);
    }
  });
});

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
