import { Position, RoomSocketService, SnapDevicesEvent, SnapEvent, VirtualRoom } from 'simsnap-core';
import { Server, Socket } from 'socket.io';
import MusicDevice from '../entities/MusicDevice';
import { MusicGroup, MusicGroupStatePayload } from '../entities/MusicGroup';
import MusicClientSocketService from './MusicClientSocketService';

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

    constructor(ioServer: Server, override virtualRoom: VirtualRoom = new VirtualRoom()) {
        super('', ioServer, virtualRoom, (clientSocket) => new MusicClientSocketService(clientSocket, virtualRoom));
        this.virtualRoom.movementManager?.configure(
            1000,
            400,
            12
        );

        this.virtualRoom.addEventListener('snapDevices', this.handleSnapDevices.bind(this));
        this.virtualRoom.addEventListener('unSnapDevices', this.handleUnSnapDevices.bind(this));
        this.virtualRoom.addEventListener('removeDevice', this.handleRemoveDevice.bind(this));
    
    }

    override addNewClient(clientSocket: Socket): MusicClientSocketService {
        const client = super.addNewClient(clientSocket);
        this.clients.push(client);

        const deviceCount = this.clients.length;
        this.ioServer.to(this.roomCode).emit('deviceCount', deviceCount);

        client.clientSocket.on('resize', (size: { width: number; height: number }) => {
            client.device.size = size;
        });

        client.device.addEventListener('sizeChanged', () => {
            if (!client.device.pos && client.device.size) {
                client.device.pos = { x: 0, y: 0 };
            }
        });

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
        const deviceCount = this.clients.length;
        this.ioServer.to(this.roomCode).emit('deviceCount', deviceCount);
        this.emitMusicGroupState();
    }

    handleDestroy(): void {
        this.virtualRoom.emit('destroy', undefined);
        this.emit('destroy', undefined);
    }

    handleUnSnapDevices({ event1, event2 }: SnapDevicesEvent): void {
        const device1 = event1.device as MusicDevice;
        const device2 = event2.device as MusicDevice;

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

    handleSnapDevices({ event1, event2 }: SnapDevicesEvent): void {
        const device1 = event1.device as MusicDevice;
        const device2 = event2.device as MusicDevice;

        device1.client.snapBorder(event1);
        device2.client.snapBorder(event2);

        if (!this.isValidOppositePair(event1.position, event2.position)) {
            // Reject invalid directional pairs and roll the edge back immediately.
            this.removePairSnapRelation(device1, device2);
            device1.client.unSnapBorder(event1);
            device2.client.unSnapBorder(event2);
            this.rebuildGroupsFromCurrentSnaps();
            this.emitMusicGroupState();
            return;
        }

        const rebuildSuccess = this.rebuildGroupsFromCurrentSnaps();
        if (!rebuildSuccess) {
            // Conflict policy: reject latest edge and keep previously valid topology.
            this.removePairSnapRelation(device1, device2);
            device1.client.unSnapBorder(event1);
            device2.client.unSnapBorder(event2);
            this.rebuildGroupsFromCurrentSnaps();
        }

        this.emitMusicGroupState();
    }

    private handleRemoveDevice(device: unknown): void {
        const musicDevice = device as MusicDevice;
        if (!musicDevice || !musicDevice.id) {
            return;
        }

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
        return true;
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
