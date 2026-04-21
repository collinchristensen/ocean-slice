import { SimplexNoise } from '../engine/math.js';

/**
 * Procedural terrain heightfield
 */
export class Terrain {
    /**
     * @param {number} width
     * @param {SimplexNoise} noise
     * @param {import('../engine/math.js').SeededRandom} rng
     */
    constructor(width, noise, rng) {
        this.width = width;
        this.noise = noise;
        this.baseHeight = 80;
        this.amplitude = 60;
        
        // Pre-compute height cache for performance
        this.heightCache = new Float32Array(Math.ceil(width / 4) + 1);
        this._buildCache();
        
        // Generate rock features
        this.rocks = [];
        const numRocks = Math.floor(width / 200);
        for (let i = 0; i < numRocks; i++) {
            this.rocks.push({
                x: rng.range(50, width - 50),
                size: rng.range(10, 30),
                height: rng.range(15, 40)
            });
        }
    }

    _buildCache() {
        for (let i = 0; i < this.heightCache.length; i++) {
            const x = i * 4;
            this.heightCache[i] = this._computeHeight(x);
        }
    }

    /**
     * @param {number} x
     */
    _computeHeight(x) {
        // Multi-octave noise for natural terrain
        const freq1 = x * 0.002;
        const freq2 = x * 0.008;
        const freq3 = x * 0.02;
        
        let h = this.baseHeight;
        h += this.noise.noise1D(freq1) * this.amplitude;
        h += this.noise.noise1D(freq2) * this.amplitude * 0.4;
        h += this.noise.noise1D(freq3) * this.amplitude * 0.15;
        
        // Clamp to reasonable range
        return Math.max(30, Math.min(180, h));
    }

    /**
     * Get terrain height at x position
     * @param {number} x
     * @returns {number}
     */
    heightAt(x) {
        // Interpolate from cache
        const idx = x / 4;
        const i = Math.floor(idx);
        const t = idx - i;
        
        if (i < 0) return this.heightCache[0];
        if (i >= this.heightCache.length - 1) return this.heightCache[this.heightCache.length - 1];
        
        // Add rock height
        let rockAdd = 0;
        for (const rock of this.rocks) {
            const dx = Math.abs(x - rock.x);
            if (dx < rock.size) {
                rockAdd = Math.max(rockAdd, rock.height * (1 - dx / rock.size));
            }
        }
        
        return this.heightCache[i] * (1 - t) + this.heightCache[i + 1] * t + rockAdd;
    }

    /**
     * Get terrain slope at x position
     * @param {number} x
     * @returns {number}
     */
    slopeAt(x) {
        const h1 = this.heightAt(x - 2);
        const h2 = this.heightAt(x + 2);
        return (h2 - h1) / 4;
    }
}
