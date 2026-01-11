import { EventBus } from './EventBus';

export interface ScoreEvent {
    playerId: number;
    amount: number;
    reason: string;
    position?: { x: number, y: number };
}

export class ScoreManager {
    private scores: Map<number, number> = new Map();
    private multipliers: Map<number, { value: number, timer: number }> = new Map();
    private readonly MULTIPLIER_DURATION = 5.0; // Seconds to keep multiplier alive

    constructor(playerCount: number) {
        for (let i = 0; i < playerCount; i++) {
            this.scores.set(i, 0);
            this.multipliers.set(i, { value: 1, timer: 0 });
        }
    }

    update(deltaTime: number): void {
        for (const [playerId, data] of this.multipliers) {
            if (data.timer > 0) {
                data.timer -= deltaTime;
                if (data.timer <= 0) {
                    data.value = 1; // Reset multiplier
                }
            }
        }
    }

    addPoints(playerId: number, amount: number, reason: string, position?: { x: number, y: number }): void {
        const currentScore = this.scores.get(playerId) || 0;
        const multiplierData = this.multipliers.get(playerId) || { value: 1, timer: 0 };

        // Apply multiplier
        const finalAmount = amount * multiplierData.value;
        this.scores.set(playerId, currentScore + finalAmount);

        // Emit event for UI/Effects
        EventBus.emit('score-changed', {
            playerId,
            amount: finalAmount,
            total: this.scores.get(playerId),
            reason,
            position,
            multiplier: multiplierData.value
        });
    }

    increaseMultiplier(playerId: number): void {
        const data = this.multipliers.get(playerId);
        if (data) {
            data.value = Math.min(data.value + 1, 5); // Max 5x multiplier
            data.timer = this.MULTIPLIER_DURATION;
        }
    }

    getScore(playerId: number): number {
        return this.scores.get(playerId) || 0;
    }

    getMultiplier(playerId: number): number {
        return this.multipliers.get(playerId)?.value || 1;
    }
}
