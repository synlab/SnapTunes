import { CanvasDevice } from 'simsnap-core';
import MusicClientSocketService from '../socketServices/MusicClientSocketService';
import { GroupGridPosition, MusicGroup } from './MusicGroup';

export class MusicDevice extends CanvasDevice {
    public client!: MusicClientSocketService;
    // A device belongs to at most one group at any time.
    public musicGroup: MusicGroup | null = null;
    // Cached coordinate in the group's [col,row] composition layout.
    public groupGridPosition: GroupGridPosition | null = null;

    constructor(anchorPriority: number | null = null) {
        super(undefined, undefined, undefined, anchorPriority, 'musicDevice');
    }
}

export default MusicDevice;