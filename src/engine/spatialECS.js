/**
 * Optimized Spatial Hash using flat arrays for allocation-free queries
 * Uses linked-list approach stored in Int32Arrays to avoid Map/object allocations
 * This eliminates garbage collection spikes during the game loop
 */

import { WorldData, MAX_ENTITIES } from './ecs.js';

// Increased cell size for fewer cells and faster queries
const CELL_SIZE = 80;
const GRID_WIDTH = 80;   // Supports worlds up to 6400px wide
const GRID_HEIGHT = 50;  // Supports worlds up to 4000px tall
const GRID_SIZE = GRID_WIDTH * GRID_HEIGHT;

// Flat arrays for the spatial grid
const gridHead = new Int32Array(GRID_SIZE).fill(-1);
const nextEntity = new Int32Array(MAX_ENTITIES).fill(-1);

// Track which cells are dirty for faster clearing
let dirtyCells = new Int32Array(GRID_SIZE);
let dirtyCellCount = 0;

// Reusable output buffer for queries
const queryBuffer = new Int32Array(200);

/**
 * Spatial Hash System using flat arrays (no allocations during queries)
 */
export const SpatialSystem = {
    /**
     * Update the spatial hash with current entity positions
     * Call once per physics frame before any spatial queries
     * Uses dirty cell tracking for O(n) clearing instead of O(gridSize)
     */
    update: () => {
        // 1. Clear only dirty cells (faster than full fill when entity count < grid size)
        for (let d = 0; d < dirtyCellCount; d++) {
            gridHead[dirtyCells[d]] = -1;
        }
        dirtyCellCount = 0;

        const { posX, posY, active, count } = WorldData;

        // 2. Populate Grid with linked list insertion
        for (let i = 0; i < count; i++) {
            if (active[i] === 0) continue;

            // Use Math.floor for correct handling of negative coordinates
            const cx = Math.floor(posX[i] / CELL_SIZE);
            const cy = Math.floor(posY[i] / CELL_SIZE);

            // Clamp to grid bounds (skip entities outside the grid)
            if (cx < 0 || cx >= GRID_WIDTH || cy < 0 || cy >= GRID_HEIGHT) continue;

            const idx = cx + cy * GRID_WIDTH;

            // Track dirty cells for next frame's clearing
            if (gridHead[idx] === -1) {
                dirtyCells[dirtyCellCount++] = idx;
            }

            // Linked list insertion (new entity becomes head)
            nextEntity[i] = gridHead[idx];
            gridHead[idx] = i;
        }
    },

    /**
     * Query neighbors within radius (allocation-free)
     * @param {number} x - Query center X
     * @param {number} y - Query center Y
     * @param {number} radius - Search radius
     * @param {Int32Array} outputArray - Pre-allocated array to write results
     * @param {number} [excludeId=-1] - Entity ID to exclude from results
     * @returns {number} Number of neighbors found
     */
    query: (x, y, radius, outputArray, excludeId = -1) => {
        let count = 0;
        const maxResults = outputArray.length;

        const cx = (x / CELL_SIZE) | 0;
        const cy = (y / CELL_SIZE) | 0;
        const range = Math.ceil(radius / CELL_SIZE);
        const rSq = radius * radius;

        const { posX, posY } = WorldData;

        for (let yy = cy - range; yy <= cy + range; yy++) {
            if (yy < 0 || yy >= GRID_HEIGHT) continue;

            for (let xx = cx - range; xx <= cx + range; xx++) {
                if (xx < 0 || xx >= GRID_WIDTH) continue;

                const cellIdx = xx + yy * GRID_WIDTH;
                let entityId = gridHead[cellIdx];

                while (entityId !== -1) {
                    if (entityId !== excludeId) {
                        const dx = posX[entityId] - x;
                        const dy = posY[entityId] - y;

                        if (dx * dx + dy * dy < rSq) {
                            outputArray[count++] = entityId;
                            if (count >= maxResults) return count;
                        }
                    }
                    entityId = nextEntity[entityId];
                }
            }
        }
        return count;
    },

    /**
     * Query neighbors by type (predator/prey) within radius
     * @param {number} x - Query center X
     * @param {number} y - Query center Y
     * @param {number} radius - Search radius
     * @param {boolean} isPredator - Filter by predator type
     * @param {Int32Array} outputArray - Pre-allocated array to write results
     * @param {number} [excludeId=-1] - Entity ID to exclude from results
     * @returns {number} Number of neighbors found
     */
    queryByType: (x, y, radius, isPredator, outputArray, excludeId = -1) => {
        let count = 0;
        const maxResults = outputArray.length;
        const typeFilter = isPredator ? 1 : 0;

        const cx = (x / CELL_SIZE) | 0;
        const cy = (y / CELL_SIZE) | 0;
        const range = Math.ceil(radius / CELL_SIZE);
        const rSq = radius * radius;

        const { posX, posY, isPredator: typeBuf } = WorldData;

        for (let yy = cy - range; yy <= cy + range; yy++) {
            if (yy < 0 || yy >= GRID_HEIGHT) continue;

            for (let xx = cx - range; xx <= cx + range; xx++) {
                if (xx < 0 || xx >= GRID_WIDTH) continue;

                const cellIdx = xx + yy * GRID_WIDTH;
                let entityId = gridHead[cellIdx];

                while (entityId !== -1) {
                    if (entityId !== excludeId && typeBuf[entityId] === typeFilter) {
                        const dx = posX[entityId] - x;
                        const dy = posY[entityId] - y;

                        if (dx * dx + dy * dy < rSq) {
                            outputArray[count++] = entityId;
                            if (count >= maxResults) return count;
                        }
                    }
                    entityId = nextEntity[entityId];
                }
            }
        }
        return count;
    },

    /**
     * Get the reusable query buffer
     * @returns {Int32Array}
     */
    getQueryBuffer: () => queryBuffer,

    /**
     * Constants for external reference
     */
    CELL_SIZE,
    GRID_WIDTH,
    GRID_HEIGHT
};

// Legacy compatibility: Export a class wrapper that uses the new system
export class SpatialHash {
    constructor(cellSize = 50) {
        // Cell size is fixed in the new system, ignore parameter
        this.neighborBuffer = [];
    }

    clear() {
        // SpatialSystem.update handles this
    }

    getKey(x, y) {
        const cx = Math.floor(x / CELL_SIZE);
        const cy = Math.floor(y / CELL_SIZE);
        return `${cx},${cy}`;
    }

    insert(entity) {
        // Legacy method - entities are now inserted via SpatialSystem.update
        // This is a no-op for backward compatibility
    }

    /**
     * Legacy query method - maintains API compatibility with old Fish class
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @param {number} [maxResults=50]
     * @returns {Array} Array of entity objects with pos property
     */
    queryRadius(x, y, radius, maxResults = 50) {
        this.neighborBuffer.length = 0;
        
        const count = SpatialSystem.query(x, y, radius, queryBuffer, -1);
        const { posX, posY, velX, velY, active, isPredator, scale } = WorldData;
        
        for (let i = 0; i < Math.min(count, maxResults); i++) {
            const id = queryBuffer[i];
            if (active[id]) {
                // Create a lightweight proxy object for backward compatibility
                this.neighborBuffer.push({
                    id,
                    type: isPredator[id] ? 'predator' : 'prey',
                    pos: { x: posX[id], y: posY[id] },
                    vel: { x: velX[id], y: velY[id] },
                    size: scale[id] * 10,
                    genome: {
                        getVisionRange: () => WorldData.visionRange[id],
                        getMaxSpeed: () => WorldData.maxSpeed[id],
                        getAgility: () => WorldData.agility[id]
                    }
                });
            }
        }
        
        return this.neighborBuffer;
    }

    queryByType(x, y, radius, type, maxResults = 20) {
        this.neighborBuffer.length = 0;
        
        const isPredatorFilter = type === 'predator';
        const count = SpatialSystem.queryByType(x, y, radius, isPredatorFilter, queryBuffer, -1);
        const { posX, posY, velX, velY, active, isPredator, scale, camouflage } = WorldData;
        
        for (let i = 0; i < Math.min(count, maxResults); i++) {
            const id = queryBuffer[i];
            if (active[id]) {
                this.neighborBuffer.push({
                    id,
                    type: isPredator[id] ? 'predator' : 'prey',
                    pos: { x: posX[id], y: posY[id] },
                    vel: { x: velX[id], y: velY[id] },
                    size: scale[id] * 10,
                    genome: {
                        getVisionRange: () => WorldData.visionRange[id],
                        getMaxSpeed: () => WorldData.maxSpeed[id],
                        getAgility: () => WorldData.agility[id],
                        getCamouflageBonus: () => camouflage[id] * 0.5
                    }
                });
            }
        }
        
        return this.neighborBuffer;
    }
}
