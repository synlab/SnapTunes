import { RoomSocketService, SnapDevicesEvent, VirtualRoom } from "simsnap-core";
import MusicClientSocketService from "./MusicClientSocketService";
import { Server, Socket } from "socket.io";
import MusicDevice from "../entities/MusicDevice";

export class MusicRoom extends RoomSocketService<MusicClientSocketService> {
    private clients: MusicClientSocketService[] = [];

    constructor(ioServer: Server, override virtualRoom: VirtualRoom = new VirtualRoom()) {
        super('', ioServer, virtualRoom, (clientSocket) => new MusicClientSocketService(clientSocket, virtualRoom));

        this.virtualRoom.addEventListener('snapDevices', this.handleSnapDevices.bind(this));
        this.virtualRoom.addEventListener('unSnapDevices', this.handleUnSnapDevices.bind(this));
    }

    override addNewClient(clientSocket: Socket): MusicClientSocketService {
        const client = super.addNewClient(clientSocket);
        this.clients.push(client);

       
        // Send device count to all clients
        const deviceCount = this.clients.length;
        console.log(`📊 Broadcasting deviceCount=${deviceCount} to all clients in room ${this.roomCode}`);
        this.ioServer.to(this.roomCode).emit('deviceCount', deviceCount);

        client.clientSocket.on('resize', (size: { width: number, height: number }) => {
            client.device.size = size;
        });


        // Initialize device position for snapping to work
        client.device.addEventListener('sizeChanged', () => {
            if (!client.device.pos && client.device.size) {
                client.device.pos = { x: 0, y: 0 };
                console.log(`Device ${client.clientSocket.id} positioned at (0,0) with size ${client.device.size.width}x${client.device.size.height}`);
            }
        });

        client.addEventListener('destroy', () => {
            this.clientQuit(client);

            if(this.virtualRoom.devices.length === 0){
                this.handleDestroy();
            }
        }, -1);

        console.log(`Client ${client.clientSocket.id} joined room ${this.roomCode}. Total devices: ${this.virtualRoom.devices.length}`);
        return client;
    }

    clientQuit(client: MusicClientSocketService) {
        this.clients = this.clients.filter(c => c.clientSocket.id !== client.clientSocket.id);
        
        // Update device count for all remaining clients
        const deviceCount = this.clients.length;
        console.log(`📊 Broadcasting deviceCount=${deviceCount} after client quit`);
        this.ioServer.to(this.roomCode).emit('deviceCount', deviceCount);

        console.log(`Client ${client.clientSocket.id} left room ${this.roomCode}. Remaining devices: ${this.virtualRoom.devices.length - 1}`);
    }

    handleDestroy(){
        this.virtualRoom.emit('destroy', undefined);
        this.emit('destroy', undefined);
    }

    handleUnSnapDevices({ event1, event2 }: SnapDevicesEvent) {
        const device1 = event1.device as MusicDevice;
        const device2 = event2.device as MusicDevice;

        console.log(device1.id.value);
        console.log(device2.id.value);

        console.log(`💔 Devices unsnapped: ${event1.device.id.value} and ${event2.device.id.value}`);

        device1.client.unSnapBorder(event1)
        device2.client.unSnapBorder(event2)
    }

    handleSnapDevices({ event1, event2 }: SnapDevicesEvent) {
        const device1 = event1.device as MusicDevice;
        const device2 = event2.device as MusicDevice;

        console.log(device1.id.value);
        console.log(device2.id.value);

        device1.client.snapBorder(event1)
        device2.client.snapBorder(event2)
    }



}