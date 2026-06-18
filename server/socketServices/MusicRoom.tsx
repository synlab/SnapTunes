import { RoomSocketService, SnapDevicesEvent, VirtualRoom } from "simsnap-core";
import MusicClientSocketService from "./MusicClientSocketService";
import { Server } from "socket.io";
import MusicDevice from "../entities/MusicDevice";
import MusicCanvas from "../entities/MusicCanvas";

export class MusicRoom extends RoomSocketService<MusicClientSocketService> {
    private clients: MusicClientSocketService[] = [];

    constructor(ioServer: Server, override virtualRoom: MusicCanvas = new MusicCanvas()) {
        super('', ioServer, virtualRoom, (clientSocket) => new MusicClientSocketService(clientSocket, virtualRoom));

        this.virtualRoom.addEventListener('snapDevices', this.handleSnapDevices.bind(this));
        this.virtualRoom.addEventListener('unSnapDevices', this.handleUnSnapDevices.bind(this));
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