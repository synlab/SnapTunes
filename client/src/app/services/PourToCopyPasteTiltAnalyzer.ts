
import { TiltAnalyzer, DeviceOrientationRecord } from "./TiltAnalyzerService"

export class PourToCopyPasteTiltAnalyzer extends TiltAnalyzer {
    private readonly minHoldMs = 2000
    private readonly repeatIntervalMs = 300

    private readonly machines: DirectionMachine[] = [
        { type: 'pourLeft', state: 'IDLE', enteredAt: null, nextFireAt: null },
        { type: 'pourRight', state: 'IDLE', enteredAt: null, nextFireAt: null },
    ]

    protected manageRecord(): void {
        const latestRecord = this.history[this.history.length - 1]
        if (!latestRecord) {
            return
        }

        // A null beta/gamma sample resets this gesture family immediately.
        if (latestRecord.beta === null || latestRecord.gamma === null) {
            for (const machine of this.machines) {
                this.resetMachine(machine)
            }
            return
        }

        for (const machine of this.machines) {
            this.stepMachine(machine, latestRecord)
        }
    }

    private stepMachine(machine: DirectionMachine, record: DeviceOrientationRecord): void {
        const isInsidePourZone = this.isTargetSample(record, machine.type)

        // Lean pour state machine per direction:
        // IDLE -> HOLDING when entering zone, HOLDING -> IDLE when leaving zone.
        if (machine.state === 'IDLE') {
            if (!isInsidePourZone) {
                return
            }

            machine.state = 'HOLDING'
            machine.enteredAt = record.timestamp
            machine.nextFireAt = record.timestamp + this.minHoldMs
            return
        }

        if (machine.state === 'HOLDING') {
            if (!isInsidePourZone) {
                this.resetMachine(machine)
                return
            }

            const startedAt = machine.enteredAt ?? record.timestamp
            let nextFireAt = machine.nextFireAt ?? (startedAt + this.minHoldMs)

            while (record.timestamp >= nextFireAt) {
                this.completeInteraction(machine.type, startedAt, record.timestamp)
                nextFireAt += this.repeatIntervalMs
            }

            machine.enteredAt = startedAt
            machine.nextFireAt = nextFireAt
            return
        }
    }

    private resetMachine(machine: DirectionMachine): void {
        machine.state = 'IDLE'
        machine.enteredAt = null
        machine.nextFireAt = null
    }

    private isTargetSample(record: DeviceOrientationRecord, gestureType: DirectionMachine['type']): boolean {
        // Converted from min/max specs into target ± tolerance checks:
        // - Right beta 25..55  => 40 ± 15, Left beta -55..-25 => -40 ± 15
        // - Shared gamma -5..5 => 0 ± 5
        const betaTarget = gestureType === 'pourLeft' ? -40 : 40
        const isWithinBetaRange = this.isWithinTolerance(record.beta, betaTarget, 15)
        const isWithinGammaRange = this.isWithinTolerance(record.gamma, 0, 5)

        return isWithinBetaRange && isWithinGammaRange
    }

    public isPouringLeft(): boolean {
        const machine = this.machines.find(m => m.type === 'pourLeft')
        if (!machine) {
            return false
        }
        return machine.state === 'HOLDING'
    }

    public isPouringRight(): boolean {
        const machine = this.machines.find(m => m.type === 'pourRight')
        if (!machine) {
            return false
        }
        return machine.state === 'HOLDING'
    }
}

type DirectionMachineState = 'IDLE' | 'HOLDING'

interface DirectionMachine {
    type: 'pourLeft' | 'pourRight'
    state: DirectionMachineState
    enteredAt: number | null
    nextFireAt: number | null
}