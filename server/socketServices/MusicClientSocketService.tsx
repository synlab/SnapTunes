import { ClientSocketService, DeviceInteractionPointerEvent, Position, SnapDevicesEvent, SnapEvent, VirtualRoom } from "simsnap-core";
import { Socket } from "socket.io";
// @ts-ignore: resolved .tsx module without jsx compiler option
import MusicDevice from "../entities/MusicDevice";

export class MusicClientSocketService extends ClientSocketService {
    constructor(clientSocket: Socket,
        virtualRoom: VirtualRoom,
        override device: MusicDevice = new MusicDevice()) {
        super(clientSocket, virtualRoom, device);
        this.device.client = this;
        console.log(`🔌 New client connected: ${clientSocket.id}`);
        this.device.addEventListener("pointerPress", (event: DeviceInteractionPointerEvent)=>{
            console.log(this.device.id.value+ " (" + event.device.id.value+ ") has pressed at " + event.x + ":" + event.y)
        });
        //Listen for events fired by the SnapManager
        this.device.addEventListener("snap", this.snapBorder.bind(this))
        this.device.addEventListener("unSnap", this.unSnapBorder.bind(this))
    }

    snapBorder(event: SnapEvent) {
        console.log(`📤 Sending snap border to ${this.clientSocket.id}: position=${event.position}, color=${event.color}`);
        this.clientSocket.emit('snapBorder', event.snapDevice.id.value, event.position, event.color);
    }

    unSnapBorder(event: SnapEvent) {
        //This method is called twice but with a same device id
        console.log(`📤 Sending unsnap border to ${this.clientSocket.id}: position=${event.position}`);
        this.clientSocket.emit('unSnapBorder', event.snapDevice.id.value, event.position);
    }


}

export default MusicClientSocketService;