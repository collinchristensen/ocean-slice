import { SeededRandom, SimplexNoise, hashString } from '../engine/math.js';
import { SpatialHash } from '../engine/spatial.js';
import { Fish } from './fish.js';
import { Terrain } from './terrain.js';
import { KelpForest } from './kelp.js';

/**
 * Main simulation world
 */
export class World {
    /**
     * @param {Object} options
     * @param {number} options.width
     * @param {number} options.height
     * @param {string} options.seed
     * @param {number} [options.fishScale=1]
     * @param {boolean} [options.lowQuality=false]
     */
    constructor({ width, height, seed, fishScale = 1, lowQuality = false }) {
        this.width = width;
        this.height = height;
        this.seed = seed;
        this.fishScale = fishScale;
        this.lowQuality = lowQuality;
        
        // Initialize RNG
        this.rng = new SeededRandom(hashString(seed));
        this.noise = new SimplexNoise(this.rng);
        
        // Config
        this.config = {
            separationWeight: 1.5,
            alignmentWeight: 1.0,
            cohesionWeight: 1.0,
            mutationRate: 0.1
        };
        
        // Stats
        this.stats = {
            births: 0,
            deaths: 0,
            birthsPerMinute: 0,
            deathsPerMinute: 0,
            lastStatsTime: 0
        };
        
        // Time tracking
        this.time = 0;
        
        // Initialize world
        this._initWorld();
    }

    _initWorld() {
        // Terrain
        this.terrain = new Terrain(this.width, this.noise, this.rng);
        
        // Kelp
        const kelpCount = Math.floor(200 * this.fishScale);
        this.kelp = new KelpForest({
            count: kelpCount,
            worldWidth: this.width,
            terrain: this.terrain,
            rng: this.rng,
            lowQuality: this.lowQuality
        });
        
        // Spatial hash for neighbor queries
        this.spatialHash = new SpatialHash(60);
        
        // Fish populations
        /** @type {Fish[]} */
        this.fish = [];
        
        // Spawn prey
        const preyCount = Math.floor(250 * this.fishScale);
        const preySpecies = ['schooler', 'darter', 'grazer'];
        for (let i = 0; i < preyCount; i++) {
            const species = preySpecies[i % preySpecies.length];
            this.fish.push(new Fish({
                x: this.rng.range(50, this.width - 50),
                y: this.rng.range(50, this.height - 150),
                rng: this.rng,
                isPredator: false,
                species,
                mutationRate: this.config.mutationRate
            }));
        }
        
        // Spawn predators
        const predatorCount = Math.floor(20 * this.fishScale);
        const predatorSpecies = ['hunter', 'ambusher'];
        for (let i = 0; i < predatorCount; i++) {
            const species = predatorSpecies[i % predatorSpecies.length];
            this.fish.push(new Fish({
                x: this.rng.range(50, this.width - 50),
                y: this.rng.range(50, this.height - 150),
                rng: this.rng,
                isPredator: true,
                species,
                mutationRate: this.config.mutationRate
            }));
        }
        
        // Particles
        this.particles = [];
        const particleCount = this.lowQuality ? 30 : 80;
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: this.rng.range(0, this.width),
                y: this.rng.range(0, this.height),
                size: this.rng.range(0.5, 2),
                alpha: this.rng.range(0.1, 0.3),
                vx: this.rng.range(-0.2, 0.2),
                vy: this.rng.range(-0.1, 0.1)
            });
        }
    }

    /**
     * @param {string} seed
     */
    regenerate(seed) {
        this.seed = seed;
        this.rng.reset(hashString(seed));
        this.noise = new SimplexNoise(this.rng);
        Fish.nextId = 0;
        this.time = 0;
        this.stats = {
            births: 0,
            deaths: 0,
            birthsPerMinute: 0,
            deathsPerMinute: 0,
            lastStatsTime: 0
        };
        this._initWorld();
    }

    /**
     * Update simulation
     * @param {number} dt
     */
    update(dt) {
        this.time += dt;
        
        // Update spatial hash
        this.spatialHash.clear();
        for (const f of this.fish) {
            if (f.alive) {
                this.spatialHash.insert(f);
            }
        }
        
        // Update fish
        const newFish = [];
        
        // Low quality mode: reduce neighbor search radius
        const qualityMult = this.lowQuality ? 0.6 : 1.0;
        const maxNeighbors = this.lowQuality ? 15 : 30;
        
        for (const f of this.fish) {
            if (!f.alive) continue;
            
            // Get neighbors using vision range from genome (clamped in low-q mode)
            const visionRadius = 60 * f.genome.getVisionRange() * qualityMult;
            const neighbors = this.spatialHash.queryRadius(f.pos.x, f.pos.y, visionRadius, maxNeighbors);
            
            // Apply boids
            f.applyBoids(neighbors, this.config);
            
            // Predator/prey behavior
            if (f.isPredator) {
                const prey = this.spatialHash.queryByType(f.pos.x, f.pos.y, 120 * qualityMult, 'prey', 10);
                const target = f.chase(prey, this.rng);
                
                // Check for catch
                if (target && f.pos.dist(target.pos) < f.size + target.size) {
                    f.eat(target);
                    this.stats.deaths++;
                }
            } else {
                const predators = this.spatialHash.queryByType(f.pos.x, f.pos.y, 100 * qualityMult, 'predator', 5);
                f.flee(predators);
            }
            
            // Boundary and terrain avoidance
            f.avoidBoundaries(this.width, this.height, this.terrain);
            
            // Kelp stalk avoidance (only for fish in lower 60% where kelp grows)
            if (f.pos.y > this.height * 0.4) {
                f.avoidKelp(this.kelp.blades);
            }
            
            // Physics update
            f.update(dt);
            
            // Reproduction
            if (f.canReproduce()) {
                const offspring = f.reproduce(this.rng, this.config.mutationRate);
                newFish.push(offspring);
                this.stats.births++;
            }
        }
        
        // Add new fish
        this.fish.push(...newFish);
        
        // Remove dead fish (deaths from energy/age, not counting predation already counted)
        const aliveCount = this.fish.filter(f => f.alive).length;
        const naturalDeaths = this.fish.length - aliveCount - newFish.length;
        if (naturalDeaths > 0) {
            this.stats.deaths += naturalDeaths;
        }
        this.fish = this.fish.filter(f => f.alive);
        
        // Update kelp
        this.kelp.update(dt, this.time);
        
        // Update particles
        for (const p of this.particles) {
            p.x += p.vx + Math.sin(this.time + p.y * 0.01) * 0.1;
            p.y += p.vy;
            
            if (p.x < 0) p.x = this.width;
            if (p.x > this.width) p.x = 0;
            if (p.y < 0) p.y = this.height;
            if (p.y > this.height) p.y = 0;
        }
        
        // Update stats per minute
        if (this.time - this.stats.lastStatsTime >= 60) {
            this.stats.birthsPerMinute = this.stats.births;
            this.stats.deathsPerMinute = this.stats.deaths;
            this.stats.births = 0;
            this.stats.deaths = 0;
            this.stats.lastStatsTime = this.time;
        }
    }

    /**
     * Get population counts
     */
    getCounts() {
        let prey = 0;
        let predators = 0;
        
        for (const f of this.fish) {
            if (f.alive) {
                if (f.isPredator) predators++;
                else prey++;
            }
        }
        
        return { prey, predators };
    }

    /**
     * Get average traits
     */
    getAverageTraits() {
        let totalSpeed = 0;
        let totalVision = 0;
        let count = 0;
        
        for (const f of this.fish) {
            if (f.alive && !f.isPredator) {
                totalSpeed += f.genome.speed;
                totalVision += f.genome.visionRange;
                count++;
            }
        }
        
        if (count === 0) return { speed: 0, vision: 0 };
        
        return {
            speed: (totalSpeed / count).toFixed(2),
            vision: (totalVision / count).toFixed(2)
        };
    }
}
