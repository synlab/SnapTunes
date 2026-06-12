import { Server } from 'socket.io';
import { 
  ServerMultiRoom, 
  RoomSocketService, 
  ClientSocketService, 
  VirtualRoom
} from 'simsnap-core';

import express from 'express';
import https from 'https';
import fs from 'fs';
import cors from 'cors';

const app = express();
app.use(cors()); // Enable CORS for all routes

// Read SSL certificates
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

// Simple route
app.get('/', (req, res) => {
    res.send('Server is working!');
});

const virtualRoom = new VirtualRoom();
// Create multi-room manager
const multiRoom = new ServerMultiRoom(
  ioServer,
  // Room factory function
  (roomCode: string) => new RoomSocketService(
    roomCode,
    ioServer,
    undefined, // Will create default VirtualRoom
    (socket) => new ClientSocketService(socket, virtualRoom)
  ),
  // Room code extractor
  (socket) => socket.handshake.query.room as string
);


server.listen(port, () => {
    console.log(`🚀 Simple Snap Server listening on https://localhost:${port}`);
});

// Optional: Handle server events
ioServer.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});