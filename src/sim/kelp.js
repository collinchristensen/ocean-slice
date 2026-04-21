import { Vec2 } from '../engine/math.js';

/**
 * Single kelp blade with segment chain physics
 */
export class KelpBlade {
    /**
     * @param {Object} options
     * @param {number} options.x - Anchor x position
     * @param {number} options.y - Anchor y position (bottom)
     * @param {number} options.segmentCount
     * @param {number} options.segmentLength
     * @param {number} options.width
     * @param {import('../engine/math.js').SeededRandom} options.rng
     */
    constructor({ x, y, segmentCount, segmentLength, width, rng }) {
        this.anchorX = x;
        this.anchorY = y;
        this.segmentCount = segmentCount;
        this.segmentLength = segmentLength;
        this.width = width;
        
        // Phase offset for individual variation
        this.phaseOffset = rng.next() * Math.PI * 2;
        this.swayAmplitude = 0.3 + rng.next() * 0.4;
        
        // Color variation
        const hue = 120 + rng.range(-15, 15);
        const sat = 40 + rng.range(-10, 20);
        const light = 30 + rng.range(-5, 10);
        this.color = `hsl(${hue}, ${sat}%, ${light}%)`;
        
        // Initialize segments (simple chain, not full verlet)
        this.segments = [];
        for (let i = 0; i < segmentCount; i++) {
            this.segments.push({
                x: x,
                y: y - i * segmentLength,
                vx: 0,
                vy: 0
            });
        }
    }

    /**
     * Update kelp physics with current simulation
     * @param {number} dt
     * @param {number} time
     * @param {number} currentStrength
     * @param {number} turbulence
     */
    update(dt, time, currentStrength, turbulence) {
        // Global current with time variation
        const baseCurrentX = Math.sin(time * 0.5 + this.phaseOffset) * currentStrength * 20;
        const turbulenceX = Math.sin(time * 2 + this.phaseOffset * 3) * turbulence * 5;
        const totalCurrent = baseCurrentX + turbulenceX;
        const invSegCount = 1 / this.segments.length;
        const segLen = this.segmentLength;
        const swayAmp = this.swayAmplitude;
        
        // Update each segment
        for (let i = 1; i < this.segments.length; i++) {
            const seg = this.segments[i];
            const prev = this.segments[i - 1];
            
            // Apply current force (stronger at top)
            const heightFactor = i * invSegCount;
            const currentForce = totalCurrent * heightFactor * swayAmp;
            
            // Add to velocity
            seg.vx += currentForce * dt;
            
            // Gravity/buoyancy (slight upward)
            seg.vy -= 0.5 * dt;
            
            // Apply velocity
            seg.x += seg.vx;
            seg.y += seg.vy;
            
            // Constraint: maintain distance from previous segment
            const dx = seg.x - prev.x;
            const dy = seg.y - prev.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const diff = (dist - segLen) / dist;
                seg.x -= dx * diff * 0.5;
                seg.y -= dy * diff * 0.5;
            }
            
            // Damping
            seg.vx *= 0.9;
            seg.vy *= 0.9;
        }
        
        // Lock anchor
        this.segments[0].x = this.anchorX;
        this.segments[0].y = this.anchorY;
    }
}

/**
 * Kelp forest manager
 */
export class KelpForest {
    /**
     * @param {Object} options
     * @param {number} options.count
     * @param {number} options.worldWidth
     * @param {Object} options.terrain
     * @param {import('../engine/math.js').SeededRandom} options.rng
     * @param {boolean} [options.lowQuality=false]
     */
    constructor({ count, worldWidth, terrain, rng, lowQuality = false }) {
        this.blades = [];
        this.currentStrength = 0.5;
        this.turbulence = 1.0;
        
        const segmentCount = lowQuality ? 6 : 10;
        
        for (let i = 0; i < count; i++) {
            const x = rng.range(30, worldWidth - 30);
            const terrainHeight = terrain.heightAt(x);
            
            // Only place kelp where terrain is suitable
            if (terrainHeight > 50) {
                const height = 80 + rng.next() * 120;
                const blade = new KelpBlade({
                    x,
                    y: terrain.heightAt(x) > 0 ? window.innerHeight - terrainHeight + 10 : window.innerHeight - 50,
                    segmentCount,
                    segmentLength: height / segmentCount,
                    width: 2 + rng.next() * 3,
                    rng
                });
                this.blades.push(blade);
            }
        }
    }

    /**
     * @param {number} dt
     * @param {number} time
     */
    update(dt, time) {
        for (const blade of this.blades) {
            blade.update(dt, time, this.currentStrength, this.turbulence);
        }
    }

    /**
     * @param {number} strength
     */
    setCurrentStrength(strength) {
        this.currentStrength = strength;
    }

    /**
     * @param {number} turbulence
     */
    setTurbulence(turbulence) {
        this.turbulence = turbulence;
    }
}
