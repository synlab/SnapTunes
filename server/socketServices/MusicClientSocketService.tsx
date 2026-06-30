import { ClientSocketService, SnapEvent, VirtualRoom } from "simsnap-core";
import { Socket } from "socket.io";
// @ts-ignore: resolved .tsx module without jsx compiler option
import MusicDevice from "../entities/MusicDevice";
import { MovementManagerDeviceEvent } from "simsnap-core/src/entities/VirtualRoom/MovementManager";

export class MusicClientSocketService extends ClientSocketService {
    constructor(clientSocket: Socket,
        override virtualRoom: VirtualRoom,
        override device: MusicDevice = new MusicDevice()) {
        super(clientSocket, virtualRoom, device);
        this.device.client = this;
        console.log(`🔌 New client connected: ${clientSocket.id}`);
        this.device.addEventListener('shake', this.shake.bind(this));
        this.emitConnectedToServer(true);
    }

    emitConnectedToServer(isConnected: boolean) {
        this.clientSocket.emit('connectedToServer', isConnected);
    }

    snapBorder(event: SnapEvent) {
        console.log(`📤 Sending snap border to ${this.clientSocket.id}: position=${event.position}, color=${event.color}`);
        this.clientSocket.emit('snapBorder', event.snapDevice.id.value, event.position, event.color);
    }

    unSnapBorder(event: SnapEvent) {
        console.log(`📤 Sending unsnap border to ${this.clientSocket.id}: position=${event.position}`);
        this.clientSocket.emit('unSnapBorder', event.snapDevice.id.value, event.position);
    }

    shake(data: MovementManagerDeviceEvent) {
        console.log(`📤 Sending shake event to ${this.clientSocket.id}`);
        this.clientSocket.emit('shake', data);
    }
}

export default MusicClientSocketService;