/**
 * Spatial hash grid for efficient neighbor queries
 * Uses cell-based bucketing to achieve O(n) neighbor lookups
 */
export class SpatialHash {
    /** @param {number} cellSize */
    constructor(cellSize = 50) {
        this.cellSize = cellSize;
        /** @type {Map<string, Array>} */
        this.grid = new Map();
        /** @type {Array} */
        this.neighborBuffer = [];
    }

    clear() {
        this.grid.clear();
    }

    /**
     * Get cell key for a position
     * @param {number} x
     * @param {number} y
     */
    getKey(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }

    /**
     * Insert an entity into the grid
     * @param {Object} entity - Must have pos.x and pos.y
     */
    insert(entity) {
        const key = this.getKey(entity.pos.x, entity.pos.y);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push(entity);
    }

    /**
     * Query neighbors within radius
     * Results written to internal buffer to avoid allocations
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @param {number} [maxResults=50]
     * @returns {Array}
     */
    queryRadius(x, y, radius, maxResults = 50) {
        this.neighborBuffer.length = 0;
        
        const minCx = Math.floor((x - radius) / this.cellSize);
        const maxCx = Math.floor((x + radius) / this.cellSize);
        const minCy = Math.floor((y - radius) / this.cellSize);
        const maxCy = Math.floor((y + radius) / this.cellSize);
        
        const radiusSq = radius * radius;
        
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const key = `${cx},${cy}`;
                const cell = this.grid.get(key);
                if (!cell) continue;
                
                for (const entity of cell) {
                    const dx = entity.pos.x - x;
                    const dy = entity.pos.y - y;
                    if (dx * dx + dy * dy <= radiusSq) {
                        this.neighborBuffer.push(entity);
                        if (this.neighborBuffer.length >= maxResults) {
                            return this.neighborBuffer;
                        }
                    }
                }
            }
        }
        
        return this.neighborBuffer;
    }

    /**
     * Query neighbors by type within radius
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @param {string} type - Entity type to filter
     * @param {number} [maxResults=20]
     * @returns {Array}
     */
    queryByType(x, y, radius, type, maxResults = 20) {
        this.neighborBuffer.length = 0;
        
        const minCx = Math.floor((x - radius) / this.cellSize);
        const maxCx = Math.floor((x + radius) / this.cellSize);
        const minCy = Math.floor((y - radius) / this.cellSize);
        const maxCy = Math.floor((y + radius) / this.cellSize);
        
        const radiusSq = radius * radius;
        
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const key = `${cx},${cy}`;
                const cell = this.grid.get(key);
                if (!cell) continue;
                
                for (const entity of cell) {
                    if (entity.type !== type) continue;
                    const dx = entity.pos.x - x;
                    const dy = entity.pos.y - y;
                    if (dx * dx + dy * dy <= radiusSq) {
                        this.neighborBuffer.push(entity);
                        if (this.neighborBuffer.length >= maxResults) {
                            return this.neighborBuffer;
                        }
                    }
                }
            }
        }
        
        return this.neighborBuffer;
    }
}
