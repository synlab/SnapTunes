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
    type: 'octaveChangeUp' | 'octaveChangeDown' | 'pourToCopyTowardsLeft' | 'pourToCopyTowardsRight'
    state: 'OUT_OF_SEQUENCE' | 'IDLE' | 'TILTING' | 'HOLDING' | 'AWAITING_RETURN'
    holdEnteredAt: number | null
    returnDeadline: number | null
}

export interface TiltAnalyzerDebugSnapshot {
    latestRecord: DeviceOrientationRecord | null
    machines: TiltAnalyzerMachineDebugSnapshot[]
}

export abstract class TiltAnalyzer {
    private static readonly DEFAULT_MAX_HISTORY_RECORDS = 300

    protected history: DeviceOrientationRecord[] = []
    protected completedInteractions: CompletedInteraction[] = []
    protected latestRecord: DeviceOrientationRecord | null = null
    protected readonly maxHistoryRecords: number
    public readonly onInteractionCompleted?: (interaction: CompletedInteraction) => void

    constructor(
        onInteractionCompleted?: (interaction: CompletedInteraction) => void,
        maxHistoryRecords: number = TiltAnalyzer.DEFAULT_MAX_HISTORY_RECORDS,
    ) {
        this.onInteractionCompleted = onInteractionCompleted
        this.maxHistoryRecords = Math.max(1, Math.floor(maxHistoryRecords))
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
        if (this.history.length > this.maxHistoryRecords) {
            // Keep only the newest samples so memory usage stays bounded.
            this.history.splice(0, this.history.length - this.maxHistoryRecords)
        }

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

export interface GestureMachine {
    type: 'octaveChangeUp' | 'octaveChangeDown' | 'pourToCopyTowardsLeft' | 'pourToCopyTowardsRight'
    state: GestureState
    holdEnteredAt: number | null
    returnDeadline: number | null
}
