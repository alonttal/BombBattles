export interface FloatingTextParams {
    x: number;
    y: number;
    text: string;
    color: string;
    duration?: number;
    size?: number;
    velocity?: { x: number, y: number };
}

export class FloatingText {
    public x: number;
    public y: number;
    public text: string;
    public color: string;
    public life: number;
    public maxLife: number;
    public size: number;
    public velocity: { x: number, y: number };
    public active: boolean = true;

    constructor(params: FloatingTextParams) {
        this.x = params.x;
        this.y = params.y;
        this.text = params.text;
        this.color = params.color;
        this.maxLife = params.duration || 1.0;
        this.life = this.maxLife;
        this.size = params.size || 20;
        this.velocity = params.velocity || { x: 0, y: -30 }; // Default float up
    }

    update(deltaTime: number): void {
        this.life -= deltaTime;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        this.x += this.velocity.x * deltaTime;
        this.y += this.velocity.y * deltaTime;
    }

    render(ctx: CanvasRenderingContext2D): void {
        if (!this.active) return;

        const alpha = Math.max(0, this.life / this.maxLife);
        // Fade out and float up

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.size}px Arial`;

        // Text outline
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(this.text, this.x, this.y);

        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}
