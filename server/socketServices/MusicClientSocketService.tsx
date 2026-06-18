import { CanvasClientSocketService, ClientSocketService, DeviceInteractionPointerEvent, Position, SnapDevicesEvent, SnapEvent, VirtualRoom } from "simsnap-core";
import { Socket } from "socket.io";
// @ts-ignore: resolved .tsx module without jsx compiler option
import MusicDevice from "../entities/MusicDevice";
import MusicCanvas from "../entities/MusicCanvas";

export class MusicClientSocketService extends CanvasClientSocketService{
    constructor(clientSocket: Socket,
        virtualRoom: MusicCanvas,
        override device: MusicDevice = new MusicDevice()) {
        super(clientSocket, virtualRoom, device);
        this.device.client = this;
        console.log(`🔌 New client connected: ${clientSocket.id}`);
    }
   

    snapBorder(event: SnapEvent) {
        console.log(`📤 Sending snap border to ${this.clientSocket.id}: position=${event.position}, color=${event.color}`);
        this.clientSocket.emit('snapBorder', event.snapDevice.id.value, event.position, event.color);
    }

    unSnapBorder(event: SnapEvent) {
        console.log(`📤 Sending unsnap border to ${this.clientSocket.id}: position=${event.position}`);
        this.clientSocket.emit('unSnapBorder', event.snapDevice.id.value, event.position);
    }


}

export default MusicClientSocketService;