import { Device } from 'simsnap-core';
import { ClientSocketService } from 'simsnap-core';
import MusicClientSocketService from '../socketServices/MusicClientSocketService';

export class MusicDevice extends Device {
    public client!: MusicClientSocketService;

    constructor(anchorPriority: number | null = null){
        super(undefined, undefined, undefined, 'musicDevice');
    }
}

export default MusicDevice;