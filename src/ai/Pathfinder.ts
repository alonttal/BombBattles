import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

export interface PathNode {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: PathNode | null;
}

export interface GridCell {
    x: number;
    y: number;
    isWalkable: boolean;
    isDangerous: boolean;
}

export class Pathfinder {
    static findPath(
        startX: number,
        startY: number,
        targetX: number,
        targetY: number,
        grid: GridCell[][]
    ): { x: number; y: number }[] | null {

        // Validate start and end
        if (startX < 0 || startX >= GRID_WIDTH || startY < 0 || startY >= GRID_HEIGHT ||
            targetX < 0 || targetX >= GRID_WIDTH || targetY < 0 || targetY >= GRID_HEIGHT) {
            return null;
        }

        // If target is unreachable (wall), we can't path exactly there.
        // Ideally the AI decides a valid target, but we can check here too.
        const targetCell = grid[targetY][targetX];
        if (!targetCell.isWalkable) {
            return null;
        }

        const openList: PathNode[] = [];
        const closedList: Set<string> = new Set();

        const startNode: PathNode = {
            x: startX,
            y: startY,
            g: 0,
            h: this.heuristic(startX, startY, targetX, targetY),
            f: 0,
            parent: null
        };
        startNode.f = startNode.g + startNode.h;

        openList.push(startNode);

        while (openList.length > 0) {
            // Sort by F cost (lowest first)
            openList.sort((a, b) => a.f - b.f);
            const currentNode = openList.shift()!;
            const key = `${currentNode.x},${currentNode.y}`;

            if (currentNode.x === targetX && currentNode.y === targetY) {
                return this.reconstructPath(currentNode);
            }

            closedList.add(key);

            const neighbors = this.getNeighbors(currentNode);

            for (const neighborPos of neighbors) {
                const nKey = `${neighborPos.x},${neighborPos.y}`;
                if (closedList.has(nKey)) continue;

                const cell = grid[neighborPos.y][neighborPos.x];

                // Cannot walk through walls.
                // Dangerous cells are allowed BUT with a massive penalty, 
                // effectively making them a "last resort" or forcing the bot to wait.
                if (!cell.isWalkable) continue;

                let gCost = currentNode.g + 1;

                // Add penalty for dangerous cells to avoid them if possible
                if (cell.isDangerous) {
                    gCost += 50;
                }

                let neighborNode = openList.find(n => n.x === neighborPos.x && n.y === neighborPos.y);

                if (!neighborNode) {
                    neighborNode = {
                        x: neighborPos.x,
                        y: neighborPos.y,
                        g: gCost,
                        h: this.heuristic(neighborPos.x, neighborPos.y, targetX, targetY),
                        f: 0,
                        parent: currentNode
                    };
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    openList.push(neighborNode);
                } else if (gCost < neighborNode.g) {
                    neighborNode.g = gCost;
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    neighborNode.parent = currentNode;
                }
            }
        }

        return null; // No path found
    }

    private static getNeighbors(node: PathNode): { x: number; y: number }[] {
        const neighbors = [];
        const dirs = [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 }
        ];

        for (const dir of dirs) {
            const nx = node.x + dir.x;
            const ny = node.y + dir.y;

            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                neighbors.push({ x: nx, y: ny });
            }
        }

        return neighbors;
    }

    private static heuristic(x1: number, y1: number, x2: number, y2: number): number {
        // Manhattan distance
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    private static reconstructPath(node: PathNode): { x: number; y: number }[] {
        const path: { x: number; y: number }[] = [];
        let current: PathNode | null = node;

        while (current) {
            path.unshift({ x: current.x, y: current.y });
            current = current.parent;
        }

        // Remove start node as we're already there
        if (path.length > 0) {
            path.shift();
        }

        return path;
    }
}
