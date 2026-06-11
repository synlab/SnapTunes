import express from 'express';
import https from 'https';
import fs from 'fs';
import { Server } from 'socket.io';
import os from 'os';
import cors from 'cors';

const app = express();
app.use(cors()); // Enable CORS for all routes

// // Read SSL certificates
const privateKey = fs.readFileSync('credentials/key.pem', 'utf8');
const certificate = fs.readFileSync('credentials/cert.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const server = https.createServer(credentials, app);
const ioServer = new Server(server, {
    cors: {
        origin: "*", // Allow requests from any origin
        methods: ["GET", "POST"]
    }
});

const port = 4000;

// Initialize the game server
// const gameServer = new SimpleServerMultiRoom(ioServer);
console.log('🎮 Game server initialized');

// Simple route
app.get('/', (req, res) => {
    res.send('Server is working!');
});

server.listen(port, () => {
    console.log(`🚀 Simple Snap Server listening on https://localhost:${port}`);

    const interfaces = os.networkInterfaces();
    Object.values(interfaces).forEach((iface) => {
        iface?.forEach((info) => {
            if (info.family === 'IPv4' && !info.internal) {
                console.log(`🔌 Socket.io via: wss://${info.address}:${port}`);
            }
        });
    });
});
