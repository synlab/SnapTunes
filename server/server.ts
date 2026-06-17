import { Server } from 'socket.io';
import express from 'express';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import { MusicRoom } from './socketServices/MusicRoom';

const app = express();
app.use(cors());

const privateKey = fs.readFileSync('credentials/key.pem', 'utf8');
const certificate = fs.readFileSync('credentials/cert.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const server = https.createServer(credentials, app);
const ioServer = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const port = 4000;
const room = new MusicRoom(ioServer);

app.get('/', (_req, res) => {
  res.send('Server is working!');
});

server.listen(port, () => {
  console.log(`🚀 Simple Snap Server listening on https://localhost:${port}`);
});

ioServer.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  room.addNewClient(socket);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});