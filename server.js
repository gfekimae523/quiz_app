const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Static files for public directory
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket communication
let isLocked = false;
let lockedUser = null;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle buzz event
    socket.on('buzz', () => {
        if (!isLocked) {
            isLocked = true;
            lockedUser = socket.id;
            io.emit('lockout');
            console.log(`Buzz received from ${socket.id}`);
        }
    });

    // Admin commands
    socket.on('admin-command', (data) => {
        switch (data.type) {
            case 'correct':
                console.log('Correct answer acknowledged.');
                break;
            case 'incorrect':
                console.log('Incorrect answer acknowledged.');
                break;
            case 'reset':
                isLocked = false;
                lockedUser = null;
                io.emit('reset');
                console.log('Reset command executed.');
                break;
            case 'next':
                isLocked = false;
                lockedUser = null;
                io.emit('next');
                console.log('Next question command executed.');
                break;
            default:
                console.log('Unknown admin command:', data.type);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (lockedUser === socket.id) {
            isLocked = false;
            lockedUser = null;
            io.emit('reset');
        }
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
