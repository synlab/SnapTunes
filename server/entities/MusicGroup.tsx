import { Position } from 'simsnap-core';
import MusicDevice from "./MusicDevice";

export interface GroupGridPosition {
    col: number;
    row: number;
}

export interface MusicGroupDeviceState {
    groupId: string | null;
    position: GroupGridPosition | null;
}

export interface MusicGroupStatePayload {
    selfDeviceId: string;
    updatedAt: string;
    groups: Array<{
        id: string;
        steps: string[][];
        sharedBpm: number;
        bpmEditOwnerDeviceId: string | null;
        playbackStatus: 'idle' | 'playing' | 'paused';
        loopEnabled: boolean;
        isOneColumnGroup: boolean;
    }>;
    devices: Record<string, MusicGroupDeviceState>;
}

// Shared group playback uses a fixed BPM for now so every device in a column
// computes the same transport duration even if their standalone BPM differs.
export const MUSIC_GROUP_SHARED_BPM = 120;

export type MusicGroupResetReason = 'stop' | 'naturalEnd' | 'topologyChange';

export interface MusicGroupClockSyncRequest {
    requestId: string;
    clientSentAtMs: number;
}

export interface MusicGroupClockSyncResponse {
    requestId: string;
    clientSentAtMs: number;
    serverTimeMs: number;
}

export interface MusicGroupPlaybackCommand {
    requestId: string;
}

export interface MusicGroupLoopSetRequest {
    requestId: string;
    enabled: boolean;
}

export interface MusicGroupBpmEditBeginRequest {
    requestId: string;
}

export interface MusicGroupBpmSetRequest {
    requestId: string;
    bpm: number;
}

export interface MusicGroupBpmEditEndRequest {
    requestId: string;
}

export interface MusicGroupBpmStatePayload {
    groupId: string;
    sharedBpm: number;
    bpmEditOwnerDeviceId: string | null;
    sequence: number;
}

export interface MusicGroupColumnScheduledPayload {
    groupId: string;
    columnIndex: number;
    resumePositionMs: number;
    scheduledStartTimeMs: number;
    scheduleToken: number;
    sharedBpm: number;
}

export interface MusicGroupColumnFinishedPayload {
    groupId: string;
    columnIndex: number;
    scheduleToken: number;
}

export interface MusicGroupPauseCapturePayload {
    groupId: string;
    columnIndex: number;
    requestId: string;
    scheduleToken: number;
}

export interface MusicGroupPauseReportPayload {
    groupId: string;
    requestId: string;
    scheduleToken: number;
    positionMs: number;
}

export interface MusicGroupPausedPayload {
    groupId: string;
    columnIndex: number;
    pausedPositionMs: number;
    scheduleToken: number;
}

export interface MusicGroupCancelScheduledStartPayload {
    groupId: string;
    columnIndex: number;
    scheduleToken: number;
    reason: Exclude<MusicGroupResetReason, 'naturalEnd'> | 'pause';
}

export interface MusicGroupResetPayload {
    groupId: string;
    reason: MusicGroupResetReason;
    sequence: number;
}

type DirectionalNeighbors = Partial<Record<Position, string>>;
type RawCoord = { col: number; row: number };

export class MusicGroup  {
    private static nextGroupNumber = 1;

    public readonly id: string;
    // Ordered composition representation: outer index is step/column, inner index is row (simultaneous devices).
    public devices: MusicDevice[][] = [];
    // Canonical membership map prevents duplicates and supports O(1) lookups by device id.
    private readonly members: Map<string, MusicDevice> = new Map<string, MusicDevice>();
    // Directional adjacency graph used to rebuild spatial layout after each topology mutation.
    private readonly adjacency: Map<string, DirectionalNeighbors> = new Map<string, DirectionalNeighbors>();
    // Fast lookup for client/debug coordinates once a layout has been reconstructed.
    private readonly gridByDeviceId: Map<string, GroupGridPosition> = new Map<string, GroupGridPosition>();

    constructor(devices: MusicDevice[] = [], groupId?: string){
        this.id = groupId ?? `music-group-${MusicGroup.nextGroupNumber++}`;
        devices.forEach((device) => {
            this.addDevice(device);
        });
    }

    get size(): number {
        return this.members.size;
    }

    hasDevice(device: MusicDevice): boolean {
        return this.members.has(device.id.value);
    }

    getPosition(deviceId: string): GroupGridPosition | null {
        return this.gridByDeviceId.get(deviceId) ?? null;
    }

    getMembers(): MusicDevice[] {
        return Array.from(this.members.values());
    }

    getNeighbors(deviceId: string): DirectionalNeighbors {
        return { ...(this.adjacency.get(deviceId) ?? {}) };
    }

    addDevice(device: MusicDevice): boolean {
        // Enforce the single-group invariant across the whole room.
        if (device.musicGroup && device.musicGroup !== this) return false;
        if (this.members.has(device.id.value)) return true;

        this.members.set(device.id.value, device);
        this.adjacency.set(device.id.value, this.adjacency.get(device.id.value) ?? {});
        device.musicGroup = this;
        return true;
    }

    removeDevice(device: MusicDevice): void {
        const deviceId = device.id.value;
        if (!this.members.has(deviceId)) return;

        const neighbors = this.adjacency.get(deviceId) ?? {};
        (Object.keys(neighbors) as Position[]).forEach((position) => {
            const neighborId = neighbors[position];
            if (!neighborId) return;

            const reverseNeighbor = this.adjacency.get(neighborId);
            if (!reverseNeighbor) return;

            const opposite = MusicGroup.opposite(position);
            if (reverseNeighbor[opposite] !== deviceId) return;
            delete reverseNeighbor[opposite];
        });

        this.adjacency.delete(deviceId);
        this.members.delete(deviceId);
        this.gridByDeviceId.delete(deviceId);
        device.musicGroup = null;
        device.groupGridPosition = null;
    }

    clear(): void {
        this.getMembers().forEach((device) => {
            device.musicGroup = null;
            device.groupGridPosition = null;
        });
        this.members.clear();
        this.adjacency.clear();
        this.gridByDeviceId.clear();
        this.devices = [];
    }

    linkDevices(deviceA: MusicDevice, directionFromA: Position, deviceB: MusicDevice, directionFromB: Position): boolean {
        // Snap directions must be opposite on both devices (e.g. left<->right).
        if (MusicGroup.opposite(directionFromA) !== directionFromB) return false;
        if (!this.hasDevice(deviceA) || !this.hasDevice(deviceB)) return false;
        if (deviceA.id.value === deviceB.id.value) return false;

        const neighborsA = this.adjacency.get(deviceA.id.value) ?? {};
        const neighborsB = this.adjacency.get(deviceB.id.value) ?? {};
        const existingA = neighborsA[directionFromA];
        const existingB = neighborsB[directionFromB];

        // Reject if either side already uses this direction for a different neighbor.
        if (existingA && existingA !== deviceB.id.value) return false;
        if (existingB && existingB !== deviceA.id.value) return false;

        neighborsA[directionFromA] = deviceB.id.value;
        neighborsB[directionFromB] = deviceA.id.value;
        this.adjacency.set(deviceA.id.value, neighborsA);
        this.adjacency.set(deviceB.id.value, neighborsB);
        return true;
    }

    rebuildLayout(): boolean {
        this.gridByDeviceId.clear();
        this.devices = [];

        const members = this.getMembers();
        if (members.length === 0) return true;

        // Stable traversal root keeps coordinate assignment deterministic across rebuilds.
        const root = members.slice().sort((a, b) => {
            const ax = a.pos?.x ?? 0;
            const bx = b.pos?.x ?? 0;
            if (ax !== bx) return ax - bx;
            const ay = a.pos?.y ?? 0;
            const by = b.pos?.y ?? 0;
            if (ay !== by) return ay - by;
            return a.id.value.localeCompare(b.id.value);
        })[0];

        const queue: string[] = [root.id.value];
        const rawCoords: Map<string, RawCoord> = new Map<string, RawCoord>();
        rawCoords.set(root.id.value, { col: 0, row: 0 });
        let hasConflict = false;

        while (queue.length > 0) {
            const currentId = queue.shift();
            if (!currentId) continue;

            const currentCoord = rawCoords.get(currentId);
            if (!currentCoord) continue;

            const neighbors = this.adjacency.get(currentId) ?? {};
            (Object.keys(neighbors) as Position[]).forEach((position) => {
                const neighborId = neighbors[position];
                if (!neighborId || !this.members.has(neighborId)) return;

                // Position deltas are inferred from directional edges in the snap graph.
                const delta = MusicGroup.delta(position);
                const nextCoord: RawCoord = {
                    col: currentCoord.col + delta.col,
                    row: currentCoord.row + delta.row,
                };

                // If a device receives two different coordinates, the graph is inconsistent.
                const existing = rawCoords.get(neighborId);
                if (existing) {
                    if (existing.col !== nextCoord.col || existing.row !== nextCoord.row) {
                        hasConflict = true;
                    }
                    return;
                }

                rawCoords.set(neighborId, nextCoord);
                queue.push(neighborId);
            });

            if (hasConflict) {
                break;
            }
        }

        if (hasConflict) {
            return false;
        }

        // Every member must be reachable in this connected group.
        if (rawCoords.size !== this.members.size) {
            return false;
        }

        // Normalize to start from col 0 so the leftmost device column is always step index 0.
        const minCol = Math.min(...Array.from(rawCoords.values()).map((coord) => coord.col));
        const rowsByCol: Map<number, Array<{ device: MusicDevice; rawRow: number }>> = new Map<number, Array<{ device: MusicDevice; rawRow: number }>>();

        rawCoords.forEach((coord, deviceId) => {
            const normalizedCol = coord.col - minCol;
                const device = this.members.get(deviceId);
                if (!device) return;
            const list = rowsByCol.get(normalizedCol) ?? [];
            list.push({ device, rawRow: coord.row });
            rowsByCol.set(normalizedCol, list);
        });

        const maxCol = Math.max(...Array.from(rowsByCol.keys()));
        for (let col = 0; col <= maxCol; col++) {
            // Devices sharing a column play simultaneously; rows are ordered top-to-bottom.
            const items = (rowsByCol.get(col) ?? []).sort((a, b) => {
                if (a.rawRow !== b.rawRow) return a.rawRow - b.rawRow;
                const ay = a.device.pos?.y ?? 0;
                const by = b.device.pos?.y ?? 0;
                if (ay !== by) return ay - by;
                return a.device.id.value.localeCompare(b.device.id.value);
            });

            this.devices[col] = items.map((item, rowIndex) => {
                const position: GroupGridPosition = { col, row: rowIndex };
                this.gridByDeviceId.set(item.device.id.value, position);
                item.device.groupGridPosition = position;
                return item.device;
            });
        }

        this.members.forEach((device) => {
            if (!this.gridByDeviceId.has(device.id.value)) {
                device.groupGridPosition = null;
            }
        });

        return true;
    }

    static opposite(position: Position): Position {
        if (position === Position.left) return Position.right;
        if (position === Position.right) return Position.left;
        if (position === Position.top) return Position.bottom;
        return Position.top;
    }

    private static delta(position: Position): RawCoord {
        if (position === Position.left) return { col: -1, row: 0 };
        if (position === Position.right) return { col: 1, row: 0 };
        if (position === Position.top) return { col: 0, row: -1 };
        return { col: 0, row: 1 };
    }

}