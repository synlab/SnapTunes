import { InfiniteCanvas } from 'simsnap-core';
import MusicDevice from './MusicDevice';

/**
 * Simplified Canvas for snapping demonstration - removed all game logic
 */
export class MusicCanvas extends InfiniteCanvas {
    override devices: MusicDevice[] = [];

    constructor() { 
        // Initialize with empty scene objects - enable tilt manager for tilt together functionality
        super(undefined, [], true, true, true);
    }

    /**
     * Override to remove game-specific scene updates
     */
    protected override updateSceneObjects() {
        // Simplified - no scene objects to update, just handle snapping
        //console.log(`Canvas has ${this.devices.length} connected devices`);
    }
}

export default MusicCanvas;