// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static('public'));

// WebSocket logic
let pressedBy = null; // Tracks who pressed the button first
let blockedParticipants = new Set(); // Tracks participants blocked from answering

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('button_press', (data) => {
        if (!pressedBy && !blockedParticipants.has(data.participant)) {
            pressedBy = data.participant;
            io.emit('update_buttons', { winner: data.participant });
        } else {
            socket.emit('button_locked');
        }
    });

    socket.on('admin_action', (action) => {
        if (action.type === 'correct') {
            io.emit('correct_answer');
        } else if (action.type === 'incorrect') {
            io.emit('incorrect_answer', { participant: pressedBy });
            blockedParticipants.add(pressedBy);
        } else if (action.type === 'reset') {
            blockedParticipants.add(pressedBy); // Keep the incorrect participant blocked
            pressedBy = null;
            io.emit('reset_buttons', { blocked: Array.from(blockedParticipants) });
        } else if (action.type === 'next_question') {
            pressedBy = null;
            blockedParticipants.clear();
            io.emit('reset_buttons', { blocked: [] });
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
