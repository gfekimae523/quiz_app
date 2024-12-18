// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let lockState = {
  buzzerLocked: false,
  firstResponder: null,
  excludedParticipants: new Set(),
};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle buzzer pressed
  socket.on('buzzer-pressed', (participantId) => {
    if (!lockState.buzzerLocked) {
      lockState.buzzerLocked = true;
      lockState.firstResponder = participantId;
      io.emit('buzzer-locked', participantId);
    } else {
      socket.emit('buzzer-disabled');
    }
  });

  // Handle admin commands
  socket.on('admin-command', (command) => {
    switch (command.type) {
      case 'correct':
        io.emit('correct-answer');
        break;
      case 'incorrect':
        io.emit('incorrect-answer');
        if (lockState.firstResponder) {
          lockState.excludedParticipants.add(lockState.firstResponder);
        }
        break;
      case 'reset':
        lockState.buzzerLocked = false;
        lockState.firstResponder = null;
        io.emit('reset', Array.from(lockState.excludedParticipants));
        break;
      case 'next':
        lockState = {
          buzzerLocked: false,
          firstResponder: null,
          excludedParticipants: new Set(),
        };
        io.emit('next');
        break;
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
