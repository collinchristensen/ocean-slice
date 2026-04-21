/**
 * Vec2 - 2D Vector class with common operations
 * Optimized for reuse to minimize allocations
 */
export class Vec2 {
    /**
     * @param {number} x
     * @param {number} y
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /** @param {Vec2} v */
    add(v) { this.x += v.x; this.y += v.y; return this; }
    
    /** @param {Vec2} v */
    sub(v) { this.x -= v.x; this.y -= v.y; return this; }
    
    /** @param {number} n */
    mult(n) { this.x *= n; this.y *= n; return this; }
    
    /** @param {number} n */
    div(n) { if (n !== 0) { this.x /= n; this.y /= n; } return this; }

    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    
    magSq() { return this.x * this.x + this.y * this.y; }

    normalize() {
        const m = this.mag();
        if (m > 0) this.div(m);
        return this;
    }

    /** @param {number} max */
    limit(max) {
        const mSq = this.magSq();
        if (mSq > max * max) {
            this.div(Math.sqrt(mSq)).mult(max);
        }
        return this;
    }

    /** @param {Vec2} v */
    dist(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /** @param {Vec2} v */
    distSq(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return dx * dx + dy * dy;
    }

    clone() { return new Vec2(this.x, this.y); }
    
    /**
     * @param {number} x
     * @param {number} y
     */
    set(x, y) { this.x = x; this.y = y; return this; }

    /** @param {Vec2} v */
    copy(v) { this.x = v.x; this.y = v.y; return this; }

    angle() { return Math.atan2(this.y, this.x); }

    /**
     * @param {Vec2} v1
     * @param {Vec2} v2
     */
    static add(v1, v2) { return new Vec2(v1.x + v2.x, v1.y + v2.y); }
    
    /**
     * @param {Vec2} v1
     * @param {Vec2} v2
     */
    static sub(v1, v2) { return new Vec2(v1.x - v2.x, v1.y - v2.y); }

    /**
     * @param {number} angle
     * @param {number} [mag=1]
     */
    static fromAngle(angle, mag = 1) {
        return new Vec2(Math.cos(angle) * mag, Math.sin(angle) * mag);
    }
}

/**
 * Seeded random number generator (Mulberry32)
 */
export class SeededRandom {
    /** @param {number} seed */
    constructor(seed = 12345) {
        this.seed = seed;
        this.state = seed;
    }

    /** @param {number} seed */
    reset(seed) {
        this.seed = seed;
        this.state = seed;
    }

    /** Returns 0-1 */
    next() {
        let t = this.state += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    /**
     * @param {number} min
     * @param {number} max
     */
    range(min, max) {
        return min + this.next() * (max - min);
    }

    /**
     * @param {number} min
     * @param {number} max
     */
    rangeInt(min, max) {
        return Math.floor(this.range(min, max + 1));
    }

    /** Gaussian distribution with Box-Muller */
    gaussian(mean = 0, stdDev = 1) {
        const u1 = this.next();
        const u2 = this.next();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * stdDev;
    }
}

/**
 * Simple 1D/2D noise function for procedural generation
 */
export class SimplexNoise {
    /** @param {SeededRandom} rng */
    constructor(rng) {
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 256; i++) {
            this.perm[i] = i;
        }
        // Shuffle
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rng.next() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
        }
        // Duplicate for overflow
        for (let i = 0; i < 256; i++) {
            this.perm[256 + i] = this.perm[i];
        }
    }

    /** @param {number} x */
    noise1D(x) {
        const i = Math.floor(x) & 255;
        const f = x - Math.floor(x);
        const u = f * f * (3 - 2 * f);
        
        const a = this.perm[i] / 255 * 2 - 1;
        const b = this.perm[i + 1] / 255 * 2 - 1;
        
        return a + u * (b - a);
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        
        const aa = this.perm[this.perm[X] + Y] / 255;
        const ab = this.perm[this.perm[X] + Y + 1] / 255;
        const ba = this.perm[this.perm[X + 1] + Y] / 255;
        const bb = this.perm[this.perm[X + 1] + Y + 1] / 255;
        
        const x1 = aa + u * (ba - aa);
        const x2 = ab + u * (bb - ab);
        
        return x1 + v * (x2 - x1);
    }

    /**
     * Multi-octave noise
     * @param {number} x
     * @param {number} octaves
     * @param {number} persistence
     */
    fbm1D(x, octaves = 4, persistence = 0.5) {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            total += this.noise1D(x * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        
        return total / maxValue;
    }
}

/**
 * Clamp value between min and max
 * @param {number} val
 * @param {number} min
 * @param {number} max
 */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Linear interpolation
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Hash a string to a number for seeding
 * @param {string} str
 */
export function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}
