
import { TiltAnalyzer, GestureMachine, TiltAnalyzerDebugSnapshot, DeviceOrientationRecord } from "./TiltAnalyzerService"

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
        const isDeviceHeldInLandscapeMode = record.beta !== null && (this.isWithinTolerance(record.beta, 0, 10) || this.isWithinTolerance(record.beta, 180, 10))
        if(!isDeviceHeldInLandscapeMode) {
            this.resetMachine(machine)
            return
        }

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
            const maximalDurationToReturn = 4000 // 3 seconds

            // The checkpoint only validates after the target has been held long enough.
            if (actualHoldDurationMs >= minimalHoldDuration) {
                machine.state = 'AWAITING_RETURN'
                machine.returnDeadline = (machine.holdEnteredAt ?? record.timestamp) + minimalHoldDuration + maximalDurationToReturn
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
            this.isWithinTolerance(record.gamma, neutralGamma, 15) ||
            this.isWithinTolerance(record.gamma, -neutralGamma, 15)
        )
    }

    private isTargetSample(record: DeviceOrientationRecord, gestureType: GestureMachine['type']): boolean {
        const targetGamma = gestureType === 'octaveChangeUp' ? -35 : 40
        return this.isWithinTolerance(record.gamma, targetGamma, 15)
    }

    private resetMachine(machine: GestureMachine): void {
        machine.state = 'OUT_OF_SEQUENCE'
        machine.holdEnteredAt = null
        machine.returnDeadline = null
    }

    public isAwaitingReturnOctaveChangeUp(): boolean {
        const machine = this.machines.find(m => m.type === 'octaveChangeUp')
        if (!machine) {
            return false
        }
        return machine.state === 'AWAITING_RETURN'
    }
}