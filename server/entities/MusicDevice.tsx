import { CanvasDevice, Device } from 'simsnap-core';
import MusicClientSocketService from '../socketServices/MusicClientSocketService';

export class MusicDevice extends CanvasDevice {
    public client!: MusicClientSocketService;

    constructor(anchorPriority: number | null = null){
        super(undefined, undefined, undefined, anchorPriority, 'musicDevice');
    }
}

export default MusicDevice;