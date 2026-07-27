import { Position, RoomSocketService, SnapDevicesEvent, SnapEvent, VirtualRoom } from 'simsnap-core';
import { Server, Socket } from 'socket.io';
import MusicDevice from '../entities/MusicDevice';
import {
    MUSIC_GROUP_SHARED_BPM,
    MusicGroup,
    MusicGroupCancelScheduledStartPayload,
    MusicGroupClockSyncRequest,
    MusicGroupClockSyncResponse,
    MusicGroupColumnFinishedPayload,
    MusicGroupColumnScheduledPayload,
    MusicGroupPauseCapturePayload,
    MusicGroupPauseReportPayload,
    MusicGroupPausedPayload,
    MusicGroupPlaybackCommand,
    MusicGroupResetPayload,
    MusicGroupResetReason,
    MusicGroupStatePayload,
} from '../entities/MusicGroup';
import MusicClientSocketService from './MusicClientSocketService';

type GroupPlaybackStatus = 'idle' | 'playing' | 'paused';

const GROUP_COMPOSITION_GRID_COLS = 16;

const getSharedCompositionDurationMs = (sharedBpm: number): number => {
    return (GROUP_COMPOSITION_GRID_COLS / sharedBpm) * 60 * 1000;
};

interface GroupPlaybackSession {
    sharedBpm: number;
    status: GroupPlaybackStatus;
    activeColumnIndex: number;
    activeScheduleToken: number;
    pausedPositionMs: number;
    scheduleToken: number;
    resetSequence: number;
    pauseRequestId: string | null;
    lastScheduledStartTimeMs: number | null;
    pendingNextColumnIndex: number | null;
    pendingNextScheduleToken: number | null;
    pendingNextStartTimeMs: number | null;
}

interface NoteTransferData {
    pitch: string;
    startTime: number;
    duration: number;
}

interface PourInteractionPayload {
    type: 'left' | 'right';
    startedAt: number;
    compositionType: 'melodic' | 'drums';
    melodicComposition: NoteTransferData[];
    drumsComposition: NoteTransferData[];
}

interface PourTransferResolvedPayload {
    giverDeviceId: string;
    receiverDeviceId: string;
    directionFromGiver: 'left' | 'right';
    startedAt: number;
    compositionType: 'melodic' | 'drums';
    incomingMelodicComposition: NoteTransferData[];
    incomingDrumsComposition: NoteTransferData[];
}

interface PendingPourIntent {
    deviceId: string;
    groupId: string;
    direction: 'left' | 'right';
    startedAt: number;
    receivedAt: number;
    positionCol: number;
    positionRow: number;
    compositionType: 'melodic' | 'drums';
    melodicComposition: NoteTransferData[];
    drumsComposition: NoteTransferData[];
}

interface PairExchangeLock {
    firstDeviceId: string;
    secondDeviceId: string;
    startedAtByDeviceId: Record<string, number>;
}

/*
Shared composition lifecycle (server authoritative):
1. Snap/unsnap/remove-device events mutate only the underlying pair relations on devices.
2. After each mutation, groups are rebuilt from the snap graph using connected components.
3. Each component becomes one MusicGroup; isolated devices stay ungrouped.
4. MusicGroup reconstructs deterministic [col,row] coordinates from directional edges.
5. If a new edge creates invalid directions or layout conflicts, the latest edge is rolled back.
6. The server emits a full `musicGroupState` snapshot so clients stay in sync and can recover after reconnects.
*/
export class MusicRoom extends RoomSocketService<MusicClientSocketService> {
    private clients: MusicClientSocketService[] = [];
    // Authoritative in-room shared-composition groups.
    private musicGroups: MusicGroup[] = [];
    // Shared playback state is tracked separately from group topology so the
    // existing snap/unsnap reconstruction flow stays unchanged.
    private readonly groupPlaybackSessions: Map<string, GroupPlaybackSession> = new Map<string, GroupPlaybackSession>();
    private readonly pendingPourIntentsByDeviceId: Map<string, PendingPourIntent> = new Map<string, PendingPourIntent>();
    private readonly pairExchangeLocksByKey: Map<string, PairExchangeLock> = new Map<string, PairExchangeLock>();
    private readonly scheduleBufferMs = 200;
    private readonly maxPourIntentAgeMs = 4000;

    constructor(ioServer: Server, override virtualRoom: VirtualRoom = new VirtualRoom()) {
        super('', ioServer, virtualRoom, (clientSocket) => new MusicClientSocketService(clientSocket, virtualRoom));
        this.virtualRoom.movementManager?.configure(
            800, // Timeout for movement events in milliseconds
            250, // Cooldown period for movement events in milliseconds
            4, // Strength threshold for movement events
        );

        this.virtualRoom.addEventListener('snapDevices', this.handleSnapDevices.bind(this));
        this.virtualRoom.addEventListener('unSnapDevices', this.handleUnSnapDevices.bind(this));
        this.virtualRoom.addEventListener('removeDevice', this.handleRemoveDevice.bind(this));
    
    }

    override addNewClient(clientSocket: Socket): MusicClientSocketService {
        const client = super.addNewClient(clientSocket);
        this.clients.push(client);
        this.emitDeviceCount();

        this.registerClientSizingHandlers(client);
        this.registerGroupPlaybackHandlers(client);

        client.addEventListener('destroy', () => {
            this.clientQuit(client);

            if (this.virtualRoom.devices.length === 0) {
                this.handleDestroy();
            }
        }, -1);

        this.emitMusicGroupState();
        return client;
    }

    clientQuit(client: MusicClientSocketService): void {
        this.clients = this.clients.filter((currentClient) => currentClient.clientSocket.id !== client.clientSocket.id);
        this.pendingPourIntentsByDeviceId.delete(client.device.id.value);
        this.pruneExchangeLocksForDevice(client.device.id.value);
        this.emitDeviceCount();
        this.emitMusicGroupState();
    }

    private emitDeviceCount(): void {
        this.ioServer.to(this.roomCode).emit('deviceCount', this.clients.length);
    }

    private registerClientSizingHandlers(client: MusicClientSocketService): void {
        client.clientSocket.on('resize', (size: { width: number; height: number }) => {
            client.device.size = size;
        });

        client.device.addEventListener('sizeChanged', () => {
            if (!client.device.pos && client.device.size) {
                client.device.pos = { x: 0, y: 0 };
            }
        });
    }

    private registerGroupPlaybackHandlers(client: MusicClientSocketService): void {
        // Group playback uses explicit socket commands so any member can drive
        // the shared transport lifecycle for its whole group.
        client.clientSocket.on('musicGroupClockSyncRequest', (payload: MusicGroupClockSyncRequest) => {
            this.handleMusicGroupClockSyncRequest(client, payload);
        });
        client.clientSocket.on('musicGroupPlayRequest', (payload: MusicGroupPlaybackCommand) => {
            this.handleMusicGroupPlayRequest(client, payload);
        });
        client.clientSocket.on('musicGroupPauseRequest', (payload: MusicGroupPlaybackCommand) => {
            this.handleMusicGroupPauseRequest(client, payload);
        });
        client.clientSocket.on('musicGroupPauseReport', (payload: MusicGroupPauseReportPayload) => {
            this.handleMusicGroupPauseReport(client, payload);
        });
        client.clientSocket.on('musicGroupStopRequest', (payload: MusicGroupPlaybackCommand) => {
            this.handleMusicGroupStopRequest(client, payload);
        });
        client.clientSocket.on('musicGroupColumnFinished', (payload: MusicGroupColumnFinishedPayload) => {
            this.handleMusicGroupColumnFinished(client, payload);
        });
        client.clientSocket.on('pourInteraction', (payload: PourInteractionPayload) => {
            this.handlePourInteraction(client, payload);
        });
    }

    private handlePourInteraction(client: MusicClientSocketService, payload: PourInteractionPayload): void {
        if (
            (payload.type !== 'left' && payload.type !== 'right') ||
            (payload.compositionType !== 'melodic' && payload.compositionType !== 'drums') ||
            !Number.isFinite(payload.startedAt) ||
            !this.isValidNoteTransferDataArray(payload.melodicComposition) ||
            !this.isValidNoteTransferDataArray(payload.drumsComposition)
        ) {
            return;
        }

        const sourceDevice = client.device as MusicDevice;
        const sourceGroup = sourceDevice.musicGroup;
        const sourcePosition = sourceDevice.groupGridPosition;
        if (!sourceGroup || !sourcePosition) {
            return;
        }

        const nowMs = Date.now();
        this.pruneStalePourIntents(nowMs);

        const incomingIntent: PendingPourIntent = {
            deviceId: sourceDevice.id.value,
            groupId: sourceGroup.id,
            direction: payload.type,
            startedAt: payload.startedAt,
            receivedAt: nowMs,
            positionCol: sourcePosition.col,
            positionRow: sourcePosition.row,
            compositionType: payload.compositionType,
            melodicComposition: payload.melodicComposition,
            drumsComposition: payload.drumsComposition,
        };

        const giverIntent = this.findMatchingPendingGiverIntent(incomingIntent, sourceGroup);
        if (!giverIntent) {
            // Keep only the latest intent per device so stale repeats do not keep matching forever.
            this.pendingPourIntentsByDeviceId.set(incomingIntent.deviceId, incomingIntent);
            return;
        }

        // First server-detected intent is the giver by definition.
        const receiverIntent = incomingIntent;

        const exchangeLockKey = this.getExchangeLockKey(
            giverIntent.deviceId,
            receiverIntent.deviceId,
            giverIntent.compositionType
        );

        // If both devices are still in the same continuous hold sessions
        // (same startedAt values), block this repeated exchange.
        if (this.isExchangeStillLocked(exchangeLockKey, giverIntent, receiverIntent)) {
            this.clearResolvedPairIntents(giverIntent.deviceId, receiverIntent.deviceId);
            return;
        }

        this.clearResolvedPairIntents(giverIntent.deviceId, receiverIntent.deviceId);

        const transferPayload: PourTransferResolvedPayload = {
            giverDeviceId: giverIntent.deviceId,
            receiverDeviceId: receiverIntent.deviceId,
            directionFromGiver: giverIntent.direction,
            startedAt: giverIntent.startedAt,
            compositionType: giverIntent.compositionType,
            incomingMelodicComposition: giverIntent.melodicComposition,
            incomingDrumsComposition: giverIntent.drumsComposition,
        };

        this.upsertExchangeLock(exchangeLockKey, giverIntent, receiverIntent);
        this.emitToGroup(sourceGroup, 'pourTransferResolved', transferPayload);
    }

    handleDestroy(): void {
        this.pendingPourIntentsByDeviceId.clear();
        this.pairExchangeLocksByKey.clear();
        this.virtualRoom.emit('destroy', undefined);
        this.emit('destroy', undefined);
    }

    handleSnapDevices({ event1, event2 }: SnapDevicesEvent): void {
        const device1 = event1.device as MusicDevice;
        const device2 = event2.device as MusicDevice;

        // Topology changes invalidate pending two-device pour handshakes.
        this.clearPourCoordinationState();

        // Joining two devices can merge or reshape groups, so shared playback is
        // interrupted before the topology mutation is applied.
        this.stopPlaybackForAffectedGroups(device1.musicGroup, device2.musicGroup);

        
        if (!this.isValidOppositePair(event1.position, event2.position)) {
            // Reject invalid directional pairs and roll the edge back immediately.
            this.removePairSnapRelation(device1, device2);
            this.rebuildGroupsFromCurrentSnaps();
            this.emitMusicGroupState();
            return;
        }

        // Upsert pair relation: if these two devices were already snapped on a
        // different edge pair, replace the old edge with the newly reported one.
        this.replacePairSnapRelation(device1, event1, device2, event2);

        const rebuildSuccess = this.rebuildGroupsFromCurrentSnaps();
        if (!rebuildSuccess) {
            // Conflict policy: reject latest edge and keep previously valid topology.
            this.removePairSnapRelation(device1, device2);
            console.log('MusicRoom: snapDevices rejected due to layout conflict, rolling back edge');
            this.rebuildGroupsFromCurrentSnaps();
            this.emitMusicGroupState();
            return;
        }

        //Send visual indications to clients that the snap was successful
        device1.client.snapBorder(event1);
        device2.client.snapBorder(event2);


        this.emitMusicGroupState();
    }
    
    handleUnSnapDevices({ event1, event2 }: SnapDevicesEvent): void {
        const device1 = event1.device as MusicDevice;
        const device2 = event2.device as MusicDevice;

        // Topology changes invalidate pending two-device pour handshakes.
        this.clearPourCoordinationState();

        // Topology changes must stop shared playback before the group graph is rebuilt.
        this.stopPlaybackForAffectedGroups(device1.musicGroup, device2.musicGroup);

        // Edge-based unsnap: only remove the broken relation between this pair.
        this.removePairSnapRelation(device1, device2);

        device1.client.unSnapBorder(event1);
        device2.client.unSnapBorder(event2);

        const rebuildSuccess = this.rebuildGroupsFromCurrentSnaps();
        if (!rebuildSuccess) {
            // Keep state safe if graph data is inconsistent after mutation.
            this.clearAllDeviceGroupState();
        }
        this.emitMusicGroupState();
    }

    private handleRemoveDevice(device: unknown): void {
        const musicDevice = device as MusicDevice;
        if (!musicDevice || !musicDevice.id) {
            return;
        }

        this.pendingPourIntentsByDeviceId.delete(musicDevice.id.value);
        this.pruneExchangeLocksForDevice(musicDevice.id.value);

        // Removing a device invalidates the active composition layout, so shared
        // playback is stopped before the room rebuilds group membership.
        this.stopPlaybackForAffectedGroups(musicDevice.musicGroup);

        this.removeReferencesToDevice(musicDevice.id.value);
        const rebuildSuccess = this.rebuildGroupsFromCurrentSnaps();
        if (!rebuildSuccess) {
            this.clearAllDeviceGroupState();
        }
        this.emitMusicGroupState();
    }

    private getMusicDevices(): MusicDevice[] {
        return this.virtualRoom.devices.filter((device): device is MusicDevice => device instanceof MusicDevice);
    }

    private isValidOppositePair(positionA: Position, positionB: Position): boolean {
        return MusicGroup.opposite(positionA) === positionB;
    }

    private removePairSnapRelation(device1: MusicDevice, device2: MusicDevice): void {
        const device1Id = device1.id.value;
        const device2Id = device2.id.value;

        device1.snapDevices = device1.snapDevices.filter((event) => event.snapDevice.id.value !== device2Id);
        device2.snapDevices = device2.snapDevices.filter((event) => event.snapDevice.id.value !== device1Id);
    }

    private replacePairSnapRelation(
        device1: MusicDevice,
        event1: SnapEvent,
        device2: MusicDevice,
        event2: SnapEvent
    ): void {
        // Keep exactly one directional edge per device pair so re-snapping on a
        // new side pair cannot leave stale reverse-edge metadata behind.
        this.removePairSnapRelation(device1, device2);
        device1.snapDevices = [...device1.snapDevices, event1];
        device2.snapDevices = [...device2.snapDevices, event2];
    }

    private removeReferencesToDevice(deviceId: string): void {
        this.getMusicDevices().forEach((device) => {
            device.snapDevices = device.snapDevices.filter((event) => event.snapDevice.id.value !== deviceId);
        });
    }

    private clearGroupAssignments(): void {
        // Group objects are rebuilt from scratch after every accepted topology mutation.
        this.musicGroups.forEach((group) => {
            group.clear();
        });
        this.musicGroups = [];

        this.clearAllDeviceGroupState();
    }

    private clearAllDeviceGroupState(): void {
        this.getMusicDevices().forEach((device) => {
            device.musicGroup = null;
            device.groupGridPosition = null;
        });
    }

    private rebuildGroupsFromCurrentSnaps(): boolean {
        // Snapshot previous ids so stable components can reuse their old group identity.
        const previousGroupByDeviceId = new Map<string, string | null>(
            this.getMusicDevices().map((device) => [device.id.value, device.musicGroup?.id ?? null])
        );

        this.clearGroupAssignments();

        const devices = this.getMusicDevices();
        const deviceById = new Map<string, MusicDevice>(devices.map((device) => [device.id.value, device]));
        // Split into connected components; each component becomes one MusicGroup.
        const components = this.findConnectedComponents(devices);
        const groups: MusicGroup[] = [];
        const usedGroupIds = new Set<string>();

        for (const component of components) {
            if (component.length <= 1) {
                const single = component[0];
                if (single) {
                    single.musicGroup = null;
                    single.groupGridPosition = null;
                }
                continue;
            }

            const reusableGroupId = this.getReusableGroupId(component, previousGroupByDeviceId, usedGroupIds);
            const group = new MusicGroup(component, reusableGroupId);
            if (reusableGroupId) {
                usedGroupIds.add(reusableGroupId);
            }
            const componentIds = new Set(component.map((device) => device.id.value));
            const linkedPairKeys = new Set<string>();

            for (const device of component) {
                for (const event of device.snapDevices) {
                    const neighbor = deviceById.get(event.snapDevice.id.value);
                    if (!neighbor || !componentIds.has(neighbor.id.value)) continue;

                    const reverseEvent = this.findReverseEvent(device, neighbor);
                    if (!reverseEvent) continue;

                    // Pair key avoids duplicating the same undirected edge when traversing both devices.
                    const pairKey = this.getPairKey(device.id.value, neighbor.id.value);
                    if (linkedPairKeys.has(pairKey)) continue;

                    if (!this.isValidOppositePair(event.position, reverseEvent.position)) {
                        // Defensive guard for malformed bidirectional snap metadata.
                        this.clearAllDeviceGroupState();
                        return false;
                    }

                    if (!group.linkDevices(device, event.position, neighbor, reverseEvent.position)) {
                        this.clearAllDeviceGroupState();
                        return false;
                    }

                    linkedPairKeys.add(pairKey);
                }
            }

            if (!group.rebuildLayout()) {
                // Fail-fast on layout conflicts (overlap/inconsistent coordinate constraints).
                this.clearAllDeviceGroupState();
                return false;
            }

            groups.push(group);
        }

        this.musicGroups = groups;
        this.prunePlaybackSessions();
        return true;
    }

    private handleMusicGroupClockSyncRequest(
        client: MusicClientSocketService,
        payload: MusicGroupClockSyncRequest
    ): void {
        const response: MusicGroupClockSyncResponse = {
            requestId: payload.requestId,
            clientSentAtMs: payload.clientSentAtMs,
            serverTimeMs: Date.now(),
        };

        client.clientSocket.emit('musicGroupClockSyncResponse', response);
    }

    private handleMusicGroupPlayRequest(
        client: MusicClientSocketService,
        _payload: MusicGroupPlaybackCommand
    ): void {
        const group = client.device.musicGroup;
        if (!group) {
            return;
        }

        const session = this.getOrCreateGroupPlaybackSession(group);
        if (session.status === 'playing') {
            return;
        }

        const resumePositionMs = session.status === 'paused' ? session.pausedPositionMs : 0;
        const columnIndex = session.status === 'paused' ? session.activeColumnIndex : 0;
        this.scheduleGroupColumn(group, session, columnIndex, resumePositionMs);
    }

    private handleMusicGroupPauseRequest(
        client: MusicClientSocketService,
        payload: MusicGroupPlaybackCommand
    ): void {
        const group = client.device.musicGroup;
        if (!group) {
            return;
        }

        const session = this.groupPlaybackSessions.get(group.id);
        if (!session || session.status !== 'playing' || session.pauseRequestId) {
            return;
        }

        session.pauseRequestId = payload.requestId;
        this.cancelPendingNextSchedule(group, session, 'pause');

        // The server does not know note timing, so the currently active column
        // reports the authoritative paused cursor position back to the room.
        const pauseCapturePayload: MusicGroupPauseCapturePayload = {
            groupId: group.id,
            columnIndex: session.activeColumnIndex,
            requestId: payload.requestId,
            scheduleToken: session.activeScheduleToken,
        };
        this.emitToGroup(group, 'musicGroupPauseCapture', pauseCapturePayload);
    }

    private handleMusicGroupPauseReport(
        client: MusicClientSocketService,
        payload: MusicGroupPauseReportPayload
    ): void {
        const group = client.device.musicGroup;
        if (!group || group.id !== payload.groupId) {
            return;
        }

        const session = this.groupPlaybackSessions.get(group.id);
        if (
            !session ||
            session.status !== 'playing' ||
            session.pauseRequestId !== payload.requestId ||
            session.activeScheduleToken !== payload.scheduleToken
        ) {
            return;
        }

        const clientPosition = client.device.groupGridPosition;
        if (!clientPosition || clientPosition.col !== session.activeColumnIndex) {
            return;
        }

        session.status = 'paused';
        session.pausedPositionMs = payload.positionMs;
        session.pauseRequestId = null;

        const pausedPayload: MusicGroupPausedPayload = {
            groupId: group.id,
            columnIndex: session.activeColumnIndex,
            pausedPositionMs: payload.positionMs,
            scheduleToken: session.activeScheduleToken,
        };
        this.emitToGroup(group, 'musicGroupPaused', pausedPayload);
    }

    private handleMusicGroupStopRequest(
        client: MusicClientSocketService,
        _payload: MusicGroupPlaybackCommand
    ): void {
        const group = client.device.musicGroup;
        if (!group) {
            return;
        }

        this.stopGroupPlayback(group, 'stop');
    }

    private handleMusicGroupColumnFinished(
        client: MusicClientSocketService,
        payload: MusicGroupColumnFinishedPayload
    ): void {
        const group = client.device.musicGroup;
        if (!group || group.id !== payload.groupId) {
            return;
        }

        const session = this.groupPlaybackSessions.get(group.id);
        if (!session || session.status !== 'playing') {
            return;
        }

        const matchesActiveSchedule =
            session.activeColumnIndex === payload.columnIndex &&
            session.activeScheduleToken === payload.scheduleToken;

        const matchesPendingSchedule =
            session.pendingNextColumnIndex === payload.columnIndex &&
            session.pendingNextScheduleToken === payload.scheduleToken;

        if (!matchesActiveSchedule && !matchesPendingSchedule) {
            return;
        }

        if (matchesPendingSchedule) {
            // Recovery path: if a pre-armed column finished before the server
            // observed the prior column completion, treat this as authoritative
            // and reconcile active session pointers.
            session.activeColumnIndex = payload.columnIndex;
            session.activeScheduleToken = payload.scheduleToken;
            session.lastScheduledStartTimeMs = session.pendingNextStartTimeMs;
            session.pendingNextColumnIndex = null;
            session.pendingNextScheduleToken = null;
            session.pendingNextStartTimeMs = null;
        }

        const clientPosition = client.device.groupGridPosition;
        if (!clientPosition || clientPosition.col !== payload.columnIndex) {
            return;
        }

        const nextColumnIndex = payload.columnIndex + 1;
        if (nextColumnIndex >= group.devices.length) {
            this.stopGroupPlayback(group, 'naturalEnd');
            return;
        }

        if (
            session.pendingNextColumnIndex === nextColumnIndex &&
            session.pendingNextScheduleToken !== null &&
            session.pendingNextStartTimeMs !== null
        ) {
            session.activeColumnIndex = nextColumnIndex;
            session.activeScheduleToken = session.pendingNextScheduleToken;
            session.lastScheduledStartTimeMs = session.pendingNextStartTimeMs;
            session.pendingNextColumnIndex = null;
            session.pendingNextScheduleToken = null;
            session.pendingNextStartTimeMs = null;

            this.armFollowingColumn(group, session, nextColumnIndex, session.lastScheduledStartTimeMs);
            return;
        }

        this.scheduleGroupColumn(group, session, nextColumnIndex, 0);
    }

    private getOrCreateGroupPlaybackSession(group: MusicGroup): GroupPlaybackSession {
        const existingSession = this.groupPlaybackSessions.get(group.id);
        if (existingSession) {
            return existingSession;
        }

        const nextSession: GroupPlaybackSession = {
            sharedBpm: MUSIC_GROUP_SHARED_BPM,
            status: 'idle',
            activeColumnIndex: 0,
            activeScheduleToken: 0,
            pausedPositionMs: 0,
            scheduleToken: 0,
            resetSequence: 0,
            pauseRequestId: null,
            lastScheduledStartTimeMs: null,
            pendingNextColumnIndex: null,
            pendingNextScheduleToken: null,
            pendingNextStartTimeMs: null,
        };

        this.groupPlaybackSessions.set(group.id, nextSession);
        return nextSession;
    }

    private scheduleGroupColumn(
        group: MusicGroup,
        session: GroupPlaybackSession,
        columnIndex: number,
        resumePositionMs: number
    ): void {
        const scheduledColumn = group.devices[columnIndex];
        if (!scheduledColumn || scheduledColumn.length === 0) {
            this.stopGroupPlayback(group, 'naturalEnd');
            return;
        }

        session.status = 'playing';
        session.activeColumnIndex = columnIndex;
        session.activeScheduleToken = ++session.scheduleToken;
        session.pausedPositionMs = resumePositionMs;
        session.pauseRequestId = null;
        session.lastScheduledStartTimeMs = Date.now() + this.scheduleBufferMs;
        session.pendingNextColumnIndex = null;
        session.pendingNextScheduleToken = null;
        session.pendingNextStartTimeMs = null;

        const schedulePayload: MusicGroupColumnScheduledPayload = {
            groupId: group.id,
            columnIndex,
            resumePositionMs,
            scheduledStartTimeMs: session.lastScheduledStartTimeMs,
            scheduleToken: session.activeScheduleToken,
            sharedBpm: session.sharedBpm,
        };

        // Every group member receives the shared schedule metadata so controls
        // stay in sync, while only the active column actually starts audio.
        this.emitToGroup(group, 'musicGroupColumnScheduled', schedulePayload);

        this.armFollowingColumn(group, session, columnIndex, session.lastScheduledStartTimeMs);
    }

    private stopGroupPlayback(group: MusicGroup, reason: MusicGroupResetReason): void {
        const session = this.getOrCreateGroupPlaybackSession(group);

        this.cancelPendingNextSchedule(group, session, reason === 'naturalEnd' ? 'stop' : reason);

        if (this.hasPendingScheduledStart(session)) {
            const cancelPayload: MusicGroupCancelScheduledStartPayload = {
                groupId: group.id,
                columnIndex: session.activeColumnIndex,
                scheduleToken: session.activeScheduleToken,
                reason: reason === 'naturalEnd' ? 'stop' : reason,
            };
            this.emitToGroup(group, 'musicGroupCancelScheduledStart', cancelPayload);
        }

        session.status = 'idle';
        session.activeColumnIndex = 0;
        session.activeScheduleToken = 0;
        session.pausedPositionMs = 0;
        session.pauseRequestId = null;
        session.lastScheduledStartTimeMs = null;
        session.resetSequence += 1;
        session.pendingNextColumnIndex = null;
        session.pendingNextScheduleToken = null;
        session.pendingNextStartTimeMs = null;

        const resetPayload: MusicGroupResetPayload = {
            groupId: group.id,
            reason,
            sequence: session.resetSequence,
        };
        this.emitToGroup(group, 'musicGroupReset', resetPayload);
    }

    private stopPlaybackForAffectedGroups(...groups: Array<MusicGroup | null>): void {
        const uniqueGroups = new Map<string, MusicGroup>();
        groups.forEach((group) => {
            if (!group) {
                return;
            }

            uniqueGroups.set(group.id, group);
        });

        uniqueGroups.forEach((group) => {
            const session = this.groupPlaybackSessions.get(group.id);
            if (!session || session.status === 'idle') {
                return;
            }

            this.stopGroupPlayback(group, 'topologyChange');
        });
    }

    private hasPendingScheduledStart(session: GroupPlaybackSession): boolean {
        return session.lastScheduledStartTimeMs !== null && session.lastScheduledStartTimeMs > Date.now();
    }

    private cancelPendingNextSchedule(
        group: MusicGroup,
        session: GroupPlaybackSession,
        reason: Exclude<MusicGroupResetReason, 'naturalEnd'> | 'pause'
    ): void {
        if (
            session.pendingNextColumnIndex === null ||
            session.pendingNextScheduleToken === null ||
            session.pendingNextStartTimeMs === null ||
            session.pendingNextStartTimeMs <= Date.now()
        ) {
            return;
        }

        const cancelPayload: MusicGroupCancelScheduledStartPayload = {
            groupId: group.id,
            columnIndex: session.pendingNextColumnIndex,
            scheduleToken: session.pendingNextScheduleToken,
            reason,
        };
        this.emitToGroup(group, 'musicGroupCancelScheduledStart', cancelPayload);

        session.pendingNextColumnIndex = null;
        session.pendingNextScheduleToken = null;
        session.pendingNextStartTimeMs = null;
    }

    private armFollowingColumn(
        group: MusicGroup,
        session: GroupPlaybackSession,
        currentColumnIndex: number,
        currentStartTimeMs: number | null
    ): void {
        const nextColumnIndex = currentColumnIndex + 1;
        const nextColumn = group.devices[nextColumnIndex];
        if (!currentStartTimeMs || !nextColumn || nextColumn.length === 0) {
            return;
        }

        const nextStartTimeMs = currentStartTimeMs + getSharedCompositionDurationMs(session.sharedBpm);
        const nextScheduleToken = ++session.scheduleToken;

        session.pendingNextColumnIndex = nextColumnIndex;
        session.pendingNextScheduleToken = nextScheduleToken;
        session.pendingNextStartTimeMs = nextStartTimeMs;

        const nextPayload: MusicGroupColumnScheduledPayload = {
            groupId: group.id,
            columnIndex: nextColumnIndex,
            resumePositionMs: 0,
            scheduledStartTimeMs: nextStartTimeMs,
            scheduleToken: nextScheduleToken,
            sharedBpm: session.sharedBpm,
        };

        this.emitToGroup(group, 'musicGroupColumnScheduled', nextPayload);
    }

    private emitToGroup(group: MusicGroup, eventName: string, payload: unknown): void {
        group.getMembers().forEach((device) => {
            device.client.clientSocket.emit(eventName, payload);
        });
    }

    private clearPourCoordinationState(): void {
        this.pendingPourIntentsByDeviceId.clear();
        this.pairExchangeLocksByKey.clear();
    }

    private clearResolvedPairIntents(firstDeviceId: string, secondDeviceId: string): void {
        this.pendingPourIntentsByDeviceId.delete(firstDeviceId);
        this.pendingPourIntentsByDeviceId.delete(secondDeviceId);
    }

    private pruneExchangeLocksForDevice(deviceId: string): void {
        Array.from(this.pairExchangeLocksByKey.entries()).forEach(([key, lock]) => {
            if (lock.firstDeviceId === deviceId || lock.secondDeviceId === deviceId) {
                this.pairExchangeLocksByKey.delete(key);
            }
        });
    }

    private getExchangeLockKey(
        firstDeviceId: string,
        secondDeviceId: string,
        compositionType: 'melodic' | 'drums'
    ): string {
        return `${this.getPairKey(firstDeviceId, secondDeviceId)}|${compositionType}`;
    }

    private isExchangeStillLocked(
        exchangeLockKey: string,
        giverIntent: PendingPourIntent,
        receiverIntent: PendingPourIntent
    ): boolean {
        const lock = this.pairExchangeLocksByKey.get(exchangeLockKey);
        if (!lock) {
            return false;
        }

        const giverStartedAt = lock.startedAtByDeviceId[giverIntent.deviceId];
        const receiverStartedAt = lock.startedAtByDeviceId[receiverIntent.deviceId];

        return giverStartedAt === giverIntent.startedAt && receiverStartedAt === receiverIntent.startedAt;
    }

    private upsertExchangeLock(
        exchangeLockKey: string,
        giverIntent: PendingPourIntent,
        receiverIntent: PendingPourIntent
    ): void {
        this.pairExchangeLocksByKey.set(exchangeLockKey, {
            firstDeviceId: giverIntent.deviceId,
            secondDeviceId: receiverIntent.deviceId,
            // startedAt acts as a hold-session identity for each device.
            startedAtByDeviceId: {
                [giverIntent.deviceId]: giverIntent.startedAt,
                [receiverIntent.deviceId]: receiverIntent.startedAt,
            },
        });
    }

    private isValidNoteTransferDataArray(notes: unknown): notes is NoteTransferData[] {
        if (!Array.isArray(notes)) {
            return false;
        }

        return notes.every((note) => {
            if (!note || typeof note !== 'object') {
                return false;
            }

            const maybeNote = note as Partial<NoteTransferData>;
            return (
                typeof maybeNote.pitch === 'string' &&
                Number.isFinite(maybeNote.startTime) &&
                Number.isFinite(maybeNote.duration)
            );
        });
    }

    private pruneStalePourIntents(nowMs: number): void {
        Array.from(this.pendingPourIntentsByDeviceId.entries()).forEach(([deviceId, intent]) => {
            if (nowMs - intent.receivedAt > this.maxPourIntentAgeMs) {
                this.pendingPourIntentsByDeviceId.delete(deviceId);
            }
        });
    }

    private findMatchingPendingGiverIntent(
        receiverIntent: PendingPourIntent,
        group: MusicGroup
    ): PendingPourIntent | null {
        let bestMatch: PendingPourIntent | null = null;

        this.pendingPourIntentsByDeviceId.forEach((candidateIntent) => {
            if (candidateIntent.groupId !== receiverIntent.groupId) {
                return;
            }

            if (!this.isCoherentHorizontalPair(candidateIntent, receiverIntent, group)) {
                return;
            }

            if (!bestMatch || candidateIntent.receivedAt < bestMatch.receivedAt) {
                bestMatch = candidateIntent;
            }
        });

        return bestMatch;
    }

    private isCoherentHorizontalPair(
        giverIntent: PendingPourIntent,
        receiverIntent: PendingPourIntent,
        group: MusicGroup
    ): boolean {
        if (giverIntent.compositionType !== receiverIntent.compositionType) {
            return false;
        }

        if (giverIntent.direction === receiverIntent.direction) {
            return false;
        }

        const expectedReceiverCol = giverIntent.positionCol + (giverIntent.direction === 'right' ? 1 : -1);
        const expectedReceiverRow = giverIntent.positionRow;

        if (
            receiverIntent.positionCol !== expectedReceiverCol ||
            receiverIntent.positionRow !== expectedReceiverRow
        ) {
            return false;
        }

        const giverNeighbors = group.getNeighbors(giverIntent.deviceId);
        const receiverNeighbors = group.getNeighbors(receiverIntent.deviceId);
        const expectedReceiverId = giverNeighbors[giverIntent.direction === 'right' ? Position.right : Position.left];
        const expectedGiverId = receiverNeighbors[giverIntent.direction === 'right' ? Position.left : Position.right];

        return expectedReceiverId === receiverIntent.deviceId && expectedGiverId === giverIntent.deviceId;
    }

    private prunePlaybackSessions(): void {
        const activeGroupIds = new Set(this.musicGroups.map((group) => group.id));

        Array.from(this.groupPlaybackSessions.keys()).forEach((groupId) => {
            if (!activeGroupIds.has(groupId)) {
                this.groupPlaybackSessions.delete(groupId);
            }
        });
    }

    private getReusableGroupId(
        component: MusicDevice[],
        previousGroupByDeviceId: Map<string, string | null>,
        usedGroupIds: Set<string>
    ): string | undefined {
        const counts = new Map<string, number>();
        component.forEach((device) => {
            const groupId = previousGroupByDeviceId.get(device.id.value);
            if (!groupId || usedGroupIds.has(groupId)) return;
            counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
        });

        const ranked = Array.from(counts.entries()).sort((a, b) => {
            if (a[1] !== b[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        });

        return ranked[0]?.[0];
    }

    private findConnectedComponents(devices: MusicDevice[]): MusicDevice[][] {
        const devicesById = new Map<string, MusicDevice>(devices.map((device) => [device.id.value, device]));
        const visited = new Set<string>();
        const components: MusicDevice[][] = [];

        // BFS over valid bidirectional edges only.
        for (const start of devices) {
            if (visited.has(start.id.value)) continue;

            const queue: string[] = [start.id.value];
            const component: MusicDevice[] = [];

            while (queue.length > 0) {
                const currentId = queue.shift();
                if (!currentId || visited.has(currentId)) continue;

                visited.add(currentId);
                const current = devicesById.get(currentId);
                if (!current) continue;

                component.push(current);

                current.snapDevices.forEach((event) => {
                    const neighborId = event.snapDevice.id.value;
                    const neighbor = devicesById.get(neighborId);
                    if (!neighbor || visited.has(neighborId)) return;

                    const reverseEvent = this.findReverseEvent(current, neighbor);
                    if (!reverseEvent) return;

                    queue.push(neighborId);
                });
            }

            components.push(component);
        }

        return components;
    }

    private findReverseEvent(source: MusicDevice, target: MusicDevice): SnapEvent | undefined {
        return target.snapDevices.find((event) => event.snapDevice.id.value === source.id.value);
    }

    private getPairKey(deviceIdA: string, deviceIdB: string): string {
        return [deviceIdA, deviceIdB].sort().join('|');
    }

    private emitMusicGroupState(): void {
        const devices = this.getMusicDevices();
        const deviceStates: MusicGroupStatePayload['devices'] = {};

        devices.forEach((device) => {
            deviceStates[device.id.value] = {
                groupId: device.musicGroup?.id ?? null,
                position: device.groupGridPosition,
            };
        });

        const groups = this.musicGroups.map((group) => ({
            id: group.id,
            steps: group.devices.map((step) => step.map((device) => device.id.value)),
            sharedBpm: MUSIC_GROUP_SHARED_BPM,
        }));

        // Full snapshot broadcast keeps client logic simple and resilient after reconnects.
        this.clients.forEach((client) => {
            const payload: MusicGroupStatePayload = {
                selfDeviceId: client.device.id.value,
                updatedAt: new Date().toISOString(),
                groups,
                devices: deviceStates,
            };
            client.clientSocket.emit('musicGroupState', payload);
        });
    }
}
