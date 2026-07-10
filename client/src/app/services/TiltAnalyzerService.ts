export interface DeviceOrientationRecord {
    alpha: number | null
    beta: number | null
    gamma: number | null
    timestamp: number
}

export interface CompletedInteraction {
    type: string
    startedAt: number
    completedAt: number
}

export interface TiltAnalyzerMachineDebugSnapshot {
    type: 'octaveChangeUp' | 'octaveChangeDown'
    state: 'OUT_OF_SEQUENCE' | 'IDLE' | 'TILTING' | 'HOLDING' | 'AWAITING_RETURN'
    holdEnteredAt: number | null
    returnDeadline: number | null
}

export interface TiltAnalyzerDebugSnapshot {
    latestRecord: DeviceOrientationRecord | null
    machines: TiltAnalyzerMachineDebugSnapshot[]
}

export abstract class TiltAnalyzer {
    protected history: DeviceOrientationRecord[] = []
    protected completedInteractions: CompletedInteraction[] = []
    protected latestRecord: DeviceOrientationRecord | null = null
    public readonly onInteractionCompleted?: (interaction: CompletedInteraction) => void

    constructor(onInteractionCompleted?: (interaction: CompletedInteraction) => void) {
        this.onInteractionCompleted = onInteractionCompleted
    }

    public addARecord(record: DeviceOrientationEvent): void {
        const normalizedRecord: DeviceOrientationRecord = {
            alpha: record.alpha,
            beta: record.beta,
            gamma: record.gamma,
            timestamp: record.timeStamp ?? Date.now(),
        }

        this.latestRecord = normalizedRecord
        this.history.push(normalizedRecord)

        // Keep the working buffer small so a gesture only evaluates recent samples.
        // if (this.history.length > 32) {
        //   this.history.shift()
        // }

        this.manageRecord()
    }

    public getCompletedInteractions(): readonly CompletedInteraction[] {
        return this.completedInteractions
    }

    public getDebugSnapshot(): TiltAnalyzerDebugSnapshot {
        return {
            latestRecord: this.latestRecord,
            machines: [],
        }
    }

    protected isWithinTolerance(value: number | null, target: number, toleranceDeg: number): boolean {
        if (value === null) {
            return false
        }

        const delta = Math.abs(value - target) % 360
        const shortestDelta = delta > 180 ? 360 - delta : delta
        return shortestDelta <= toleranceDeg
    }

    protected resetCurrentGesture(): void {
        this.history = []
    }

    protected completeInteraction(type: string, startedAt: number, completedAt: number): void {
        const interaction: CompletedInteraction = { type, startedAt, completedAt }
        this.completedInteractions.push(interaction)
        this.onInteractionCompleted?.(interaction)
        this.resetCurrentGesture()
    }

    protected abstract manageRecord(): void
}

type GestureState = | 'OUT_OF_SEQUENCE' | 'IDLE' | 'TILTING' | 'HOLDING' | 'AWAITING_RETURN'

interface GestureMachine {
    type: 'octaveChangeUp' | 'octaveChangeDown'
    state: GestureState
    holdEnteredAt: number | null
    returnDeadline: number | null
}

export class OctaveChangeTiltAnalyzer extends TiltAnalyzer {
    private readonly machines: GestureMachine[] = [
        { type: 'octaveChangeUp', state: 'OUT_OF_SEQUENCE', holdEnteredAt: null, returnDeadline: null },
        { type: 'octaveChangeDown', state: 'OUT_OF_SEQUENCE', holdEnteredAt: null, returnDeadline: null },
    ]

    public override getDebugSnapshot(): TiltAnalyzerDebugSnapshot {
        return {
            latestRecord: this.latestRecord,
            machines: this.machines.map((machine) => ({
                type: machine.type,
                state: machine.state,
                holdEnteredAt: machine.holdEnteredAt,
                returnDeadline: machine.returnDeadline,
            })),
        }
    }

    protected manageRecord(): void {
        const latestRecord = this.history[this.history.length - 1]
        if (!latestRecord) {
            return
        }

        // A single missing orientation sample should not cancel an otherwise valid gesture.
        if (latestRecord.gamma === null) {
            return
        }

        for (const machine of this.machines) {
            this.stepMachine(machine, latestRecord)
        }
    }

    private stepMachine(machine: GestureMachine, record: DeviceOrientationRecord): void {
        const isNeutral = this.isNeutralSample(record, machine.type)
        const isTarget = this.isTargetSample(record, machine.type)

        if (machine.state === 'OUT_OF_SEQUENCE') {
            if (isNeutral){
                machine.state = 'IDLE'
            }
        }


        // The gesture progresses through a simple state machine: neutral -> tilting -> holding -> awaiting return.
        if (machine.state === 'IDLE') {
            if (!isNeutral && !isTarget) {
                machine.state = 'TILTING'
            } else if (isTarget) {
                machine.state = 'HOLDING'
                machine.holdEnteredAt = record.timestamp
                machine.returnDeadline = null
            }
            return
        }

        if (machine.state === 'TILTING') {
            if (isTarget) {
                machine.state = 'HOLDING'
                machine.holdEnteredAt = record.timestamp
                machine.returnDeadline = null
            } else if (isNeutral) {
                this.resetMachine(machine)
            }
            return
        }

        if (machine.state === 'HOLDING') {
            if (!isTarget) {
                this.resetMachine(machine)
                return
            }

            const actualHoldDurationMs = record.timestamp - (machine.holdEnteredAt ?? record.timestamp)
            const minimalHoldDuration = 2000 // 2 seconds

            // The checkpoint only validates after the target has been held long enough.
            if (actualHoldDurationMs >= minimalHoldDuration) {
                machine.state = 'AWAITING_RETURN'
                machine.returnDeadline = (machine.holdEnteredAt ?? record.timestamp) + 7000
            }
            return
        }

        if (machine.state === 'AWAITING_RETURN') {
            if (isNeutral) {
                this.completeInteraction(machine.type, machine.holdEnteredAt ?? record.timestamp, record.timestamp)
                this.resetMachine(machine)
                return
            }

            // The attempt expires if neutral is not reached before the deadline.
            if ((machine.returnDeadline ?? record.timestamp) <= record.timestamp) {
                this.resetMachine(machine)
            }
        }
    }

    private isNeutralSample(record: DeviceOrientationRecord, gestureType: GestureMachine['type']): boolean {
        const neutralGamma = gestureType === 'octaveChangeUp' ? 90 : -90

        return (
            this.isWithinTolerance(record.gamma, neutralGamma, 20) ||
            this.isWithinTolerance(record.gamma, -neutralGamma, 20)
        )
    }

    private isTargetSample(record: DeviceOrientationRecord, gestureType: GestureMachine['type']): boolean {
        const targetGamma = gestureType === 'octaveChangeUp' ? -45 : 45

        return this.isWithinTolerance(record.gamma, targetGamma, 20)
    }

    private resetMachine(machine: GestureMachine): void {
        machine.state = 'OUT_OF_SEQUENCE'
        machine.holdEnteredAt = null
        machine.returnDeadline = null
    }
}