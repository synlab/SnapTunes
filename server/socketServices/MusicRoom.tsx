import { RoomSocketService, SnapDevicesEvent, SnapEvent, VirtualRoom } from "simsnap-core";
import MusicClientSocketService from "./MusicClientSocketService";
import { Server } from "socket.io";
import MusicDevice from "../entities/MusicDevice";

export class MusicRoom extends RoomSocketService<MusicClientSocketService> {
    private clients: MusicClientSocketService[] = [];

    constructor(ioServer: Server, override virtualRoom: VirtualRoom = new VirtualRoom()) {
        super('', ioServer, virtualRoom, (clientSocket) => new MusicClientSocketService(clientSocket, virtualRoom));
        
        // This class have no utility for now

        // this.virtualRoom.addEventListener('snapDevices', this.handleSnapDevices.bind(this));
        // this.virtualRoom.addEventListener('unSnapDevices', this.handleUnSnapDevices.bind(this));

        // Listen for device orientation changes and calculate combined tilt manually
        // this.virtualRoom.addEventListener('deviceOrientationChange', this.handleDeviceOrientationChange.bind(this));

    }

}