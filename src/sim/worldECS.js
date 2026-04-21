/**
 * World ECS - Main simulation world using Entity Component System
 * Uses SoA data layout for maximum performance with thousands of entities
 */

import { SeededRandom, SimplexNoise, hashString } from '../engine/math.js';
import { WorldData, ECS, EntityState, MAX_ENTITIES, RareTraitPool } from '../engine/ecs.js';
import { SpatialSystem } from '../engine/spatialECS.js';
import { BehaviorSystem, setWorldBounds } from './behavior.js';
import { invalidateTerrainCache } from '../engine/render.js';
import { Terrain } from './terrain.js';
import { KelpForest } from './kelp.js';

// Species configuration: ID mapping and base colors
// Prey species (IDs 0-99): Blue/cyan/green coloring for ocean camouflage
// Predator species (IDs 100+): Red/orange coloring for visibility/warning
const SPECIES_CONFIG = {
    // Prey species
    schooler: { id: 0, baseHue: 180 },  // Cyan - typical schooling fish
    darter: { id: 1, baseHue: 160 },    // Teal - quick darting fish
    grazer: { id: 2, baseHue: 140 },    // Green - bottom-feeding fish
    // Predator species
    hunter: { id: 100, baseHue: 0 },    // Red - active hunters
    ambusher: { id: 101, baseHue: 20 }  // Orange - ambush predators
};

/**
 * Spawn a fish entity into the ECS
 * @param {SeededRandom} rng
 * @param {number} x
 * @param {number} y
 * @param {boolean} isPredator
 * @param {string} species
 * @param {number} mutationRate
 * @returns {number} Entity ID
 */
function spawnFish(rng, x, y, isPredator, species, mutationRate) {
    const id = ECS.createEntity();
    if (id === -1) return -1;

    // Position and velocity
    WorldData.posX[id] = x;
    WorldData.posY[id] = y;
    const angle = rng.next() * Math.PI * 2;
    const speed = 1 + rng.next();
    WorldData.velX[id] = Math.cos(angle) * speed;
    WorldData.velY[id] = Math.sin(angle) * speed;
    WorldData.angle[id] = angle;

    // Random genome traits (normalized [0,1])
    const speedTrait = rng.next();
    const visionTrait = rng.next();
    const agilityTrait = rng.next();
    const sizeTrait = rng.next();
    const schoolingTrait = rng.next();
    const fearTrait = rng.next();
    const aggressionTrait = rng.next();
    const camouflageTrait = rng.next();
    const metabolismTrait = rng.next();

    // Mapped trait values
    WorldData.maxSpeed[id] = 1.5 + speedTrait * 3;
    WorldData.visionRange[id] = 0.5 + visionTrait * 1.5;
    WorldData.agility[id] = 0.05 + agilityTrait * 0.15;
    WorldData.scale[id] = 0.6 + sizeTrait * 0.8;

    // Genome traits (stored as normalized 0-1 for inheritance/mutation)
    WorldData.schoolingAffinity[id] = schoolingTrait;
    WorldData.fear[id] = fearTrait;
    WorldData.aggression[id] = aggressionTrait;
    WorldData.camouflage[id] = camouflageTrait;
    WorldData.metabolism[id] = metabolismTrait;

    // Boid weights (default)
    WorldData.separation[id] = 1.5;
    WorldData.alignment[id] = 1.0;
    WorldData.cohesion[id] = 1.0;

    // Type and species (using config lookup)
    WorldData.isPredator[id] = isPredator ? 1 : 0;
    const speciesConf = SPECIES_CONFIG[species] || (isPredator ? SPECIES_CONFIG.hunter : SPECIES_CONFIG.schooler);
    WorldData.speciesId[id] = speciesConf.id;

    // Energy and lifecycle
    WorldData.energy[id] = 50 + rng.next() * 50;
    WorldData.maxEnergy[id] = 100 + sizeTrait * 50;
    WorldData.age[id] = 0;
    WorldData.maxAge[id] = 60 + rng.next() * 60;
    WorldData.reproductionCooldown[id] = 0;

    // State - ambushers start in AMBUSH mode (from s08)
    if (isPredator && species === 'ambusher') {
        WorldData.state[id] = EntityState.AMBUSH;
        WorldData.stateTimer[id] = 0; // Timer for mode transitions
        
        // Register ambusher in RareTraitPool
        const rareIdx = RareTraitPool.register(id);
        if (rareIdx !== -1) {
            // Initialize rare ambush-specific traits
            RareTraitPool.ambushChargeLevel[rareIdx] = 1.0;
            RareTraitPool.patienceLevel[rareIdx] = 0.3 + rng.next() * 0.7;
        }
    } else {
        WorldData.state[id] = EntityState.IDLE;
        WorldData.stateTimer[id] = 0;
    }
    WorldData.targetId[id] = -1;

    // Color (HSL) - derived from species configuration
    let hue, sat, light;
    if (isPredator) {
        // Predators: Red/orange coloring with variation
        hue = speciesConf.baseHue + rng.next() * 30;
        sat = 60 + rng.next() * 20;
        light = 40 + rng.next() * 20;
    } else {
        // Prey: Blue/cyan/green based on species with variation
        hue = speciesConf.baseHue + rng.range(-20, 20);
        sat = 50 + rng.next() * 30;
        light = 45 + rng.next() * 25;
    }
    WorldData.colorHue[id] = hue;
    WorldData.colorSat[id] = sat;
    WorldData.colorLight[id] = light;

    return id;
}

/**
 * Create a offspring entity from parent
 * @param {SeededRandom} rng
 * @param {number} parentId
 * @param {number} mutationRate
 * @returns {number} Offspring entity ID
 */
function reproduceEntity(rng, parentId, mutationRate) {
    const id = ECS.createEntity();
    if (id === -1) return -1;

    // Position near parent
    WorldData.posX[id] = WorldData.posX[parentId] + rng.range(-20, 20);
    WorldData.posY[id] = WorldData.posY[parentId] + rng.range(-20, 20);

    // Random initial velocity
    const angle = rng.next() * Math.PI * 2;
    const speed = 1 + rng.next();
    WorldData.velX[id] = Math.cos(angle) * speed;
    WorldData.velY[id] = Math.sin(angle) * speed;

    // Inherit and mutate traits (small gaussian + clamp)
    const mutate = (val) => {
        if (rng.next() < mutationRate) {
            return Math.max(0, Math.min(1, val + rng.gaussian(0, 0.1)));
        }
        return val;
    };

    // Trait inheritance with mutation
    const speedTrait = mutate((WorldData.maxSpeed[parentId] - 1.5) / 3);
    const visionTrait = mutate((WorldData.visionRange[parentId] - 0.5) / 1.5);
    const agilityTrait = mutate((WorldData.agility[parentId] - 0.05) / 0.15);
    const sizeTrait = mutate((WorldData.scale[parentId] - 0.6) / 0.8);

    WorldData.maxSpeed[id] = 1.5 + speedTrait * 3;
    WorldData.visionRange[id] = 0.5 + visionTrait * 1.5;
    WorldData.agility[id] = 0.05 + agilityTrait * 0.15;
    WorldData.scale[id] = 0.6 + sizeTrait * 0.8;

    // Inherit and mutate genome traits
    WorldData.schoolingAffinity[id] = mutate(WorldData.schoolingAffinity[parentId]);
    WorldData.fear[id] = mutate(WorldData.fear[parentId]);
    WorldData.aggression[id] = mutate(WorldData.aggression[parentId]);
    WorldData.camouflage[id] = mutate(WorldData.camouflage[parentId]);
    WorldData.metabolism[id] = mutate(WorldData.metabolism[parentId]);

    // Inherit boid weights
    WorldData.separation[id] = WorldData.separation[parentId];
    WorldData.alignment[id] = WorldData.alignment[parentId];
    WorldData.cohesion[id] = WorldData.cohesion[parentId];

    // Inherit type
    WorldData.isPredator[id] = WorldData.isPredator[parentId];
    WorldData.speciesId[id] = WorldData.speciesId[parentId];

    // Energy and lifecycle
    WorldData.energy[id] = 50 + rng.next() * 50;
    WorldData.maxEnergy[id] = 100 + sizeTrait * 50;
    WorldData.age[id] = 0;
    WorldData.maxAge[id] = 60 + rng.next() * 60;
    WorldData.reproductionCooldown[id] = 0;

    // State - ambushers start in AMBUSH mode
    const AMBUSHER_SPECIES_ID = 101;
    if (WorldData.isPredator[id] && WorldData.speciesId[id] === AMBUSHER_SPECIES_ID) {
        WorldData.state[id] = EntityState.AMBUSH;
        WorldData.stateTimer[id] = 0;
        
        // Register offspring ambusher in RareTraitPool
        const rareIdx = RareTraitPool.register(id);
        if (rareIdx !== -1) {
            // Inherit and mutate rare traits from parent
            const parentRareIdx = RareTraitPool.getRareIndex(parentId);
            if (parentRareIdx !== -1) {
                RareTraitPool.patienceLevel[rareIdx] = Math.max(0, Math.min(1, 
                    RareTraitPool.patienceLevel[parentRareIdx] + rng.gaussian(0, 0.1)
                ));
            } else {
                RareTraitPool.patienceLevel[rareIdx] = 0.3 + rng.next() * 0.7;
            }
            RareTraitPool.ambushChargeLevel[rareIdx] = 1.0;
        }
    } else {
        WorldData.state[id] = EntityState.IDLE;
        WorldData.stateTimer[id] = 0;
    }
    WorldData.targetId[id] = -1;

    // Inherit color with slight mutation
    WorldData.colorHue[id] = WorldData.colorHue[parentId] + rng.range(-5, 5);
    WorldData.colorSat[id] = WorldData.colorSat[parentId] + rng.range(-5, 5);
    WorldData.colorLight[id] = WorldData.colorLight[parentId] + rng.range(-5, 5);

    return id;
}

/**
 * Main ECS-based simulation world
 */
export class WorldECS {
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

        // Set world bounds for behavior system
        setWorldBounds(width, height);

        // Initialize world
        this._initWorld();
    }

    _initWorld() {
        // Reset ECS
        ECS.reset();

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

        // Spawn prey
        const preyCount = Math.floor(250 * this.fishScale);
        const preySpecies = ['schooler', 'darter', 'grazer'];
        for (let i = 0; i < preyCount; i++) {
            const species = preySpecies[i % preySpecies.length];
            spawnFish(
                this.rng,
                this.rng.range(50, this.width - 50),
                this.rng.range(50, this.height - 150),
                false,
                species,
                this.config.mutationRate
            );
        }

        // Spawn predators
        const predatorCount = Math.floor(20 * this.fishScale);
        const predatorSpecies = ['hunter', 'ambusher'];
        for (let i = 0; i < predatorCount; i++) {
            const species = predatorSpecies[i % predatorSpecies.length];
            spawnFish(
                this.rng,
                this.rng.range(50, this.width - 50),
                this.rng.range(50, this.height - 150),
                true,
                species,
                this.config.mutationRate
            );
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
        this.time = 0;
        this.stats = {
            births: 0,
            deaths: 0,
            birthsPerMinute: 0,
            deathsPerMinute: 0,
            lastStatsTime: 0
        };
        setWorldBounds(this.width, this.height);
        invalidateTerrainCache();
        this._initWorld();
    }

    /**
     * Update simulation
     * @param {number} dt
     */
    update(dt) {
        this.time += dt;

        const { posX, posY, velX, velY, active, energy, maxEnergy, age, maxAge,
                reproductionCooldown, isPredator, scale, maxSpeed, metabolism } = WorldData;
        const count = WorldData.count;

        // 1. Update spatial hash
        SpatialSystem.update();

        // 2. Run behavior system
        BehaviorSystem.update(dt, this.config, this.terrain);

        // 3. Physics integration and lifecycle
        // Pre-compute constants outside loop
        const dtScaled = dt * 60;
        const newEntities = [];

        for (let i = 0; i < count; i++) {
            if (!active[i]) continue;

            // Limit velocity using squared magnitude (avoid sqrt when possible)
            const vx = velX[i];
            const vy = velY[i];
            const speedSq = vx * vx + vy * vy;
            const maxS = maxSpeed[i];
            const maxSSq = maxS * maxS;
            
            if (speedSq > maxSSq) {
                const invSpeed = maxS / Math.sqrt(speedSq);
                velX[i] = vx * invSpeed;
                velY[i] = vy * invSpeed;
            }

            // Apply drag
            velX[i] *= 0.98;
            velY[i] *= 0.98;

            // Update position
            posX[i] += velX[i] * dtScaled;
            posY[i] += velY[i] * dtScaled;

            // Energy drain (optimized: use speedSq instead of speed^2)
            const metabolismRate = 0.5 + metabolism[i];
            const speedCost = speedSq * 0.001;
            const baseCost = 0.02 * metabolismRate;
            energy[i] -= (baseCost + speedCost) * dtScaled;

            // Age
            age[i] += dt;
            reproductionCooldown[i] -= dt;
            if (reproductionCooldown[i] < 0) reproductionCooldown[i] = 0;

            // Death conditions
            if (energy[i] <= 0 || age[i] > maxAge[i]) {
                ECS.removeEntity(i);
                this.stats.deaths++;
                continue;
            }

            // Reproduction check
            if (energy[i] > maxEnergy[i] * 0.7 && age[i] > 5 && reproductionCooldown[i] <= 0) {
                energy[i] *= 0.5;
                reproductionCooldown[i] = isPredator[i] ? 15 : 10;
                newEntities.push(i);
            }

            // Check for predator eating prey (optimized: use squared distance)
            if (isPredator[i]) {
                const queryBuf = SpatialSystem.getQueryBuffer();
                const preyCount = SpatialSystem.queryByType(posX[i], posY[i], 25, false, queryBuf, i);

                for (let p = 0; p < preyCount; p++) {
                    const preyId = queryBuf[p];
                    if (!active[preyId]) continue;

                    const dx = posX[preyId] - posX[i];
                    const dy = posY[preyId] - posY[i];
                    const distSq = dx * dx + dy * dy;
                    const catchDist = scale[i] * 10 + scale[preyId] * 10;

                    if (distSq < catchDist * catchDist) {
                        const energyGain = 30 + scale[preyId] * 10;
                        energy[i] = Math.min(maxEnergy[i], energy[i] + energyGain);
                        ECS.removeEntity(preyId);
                        this.stats.deaths++;
                        break;
                    }
                }
            }
        }

        // Spawn new entities from reproduction
        for (const parentId of newEntities) {
            if (active[parentId]) { // Parent might have died
                reproduceEntity(this.rng, parentId, this.config.mutationRate);
                this.stats.births++;
            }
        }

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
        return ECS.getCounts();
    }

    /**
     * Get average traits (for prey only)
     */
    getAverageTraits() {
        let totalSpeed = 0;
        let totalVision = 0;
        let count = 0;

        const { active, isPredator, maxSpeed, visionRange } = WorldData;

        for (let i = 0; i < WorldData.count; i++) {
            if (active[i] && !isPredator[i]) {
                totalSpeed += (maxSpeed[i] - 1.5) / 3; // Normalize back to 0-1
                totalVision += (visionRange[i] - 0.5) / 1.5;
                count++;
            }
        }

        if (count === 0) return { speed: '0.00', vision: '0.00' };

        return {
            speed: (totalSpeed / count).toFixed(2),
            vision: (totalVision / count).toFixed(2)
        };
    }
}

// Re-export for backward compatibility
export { WorldData, ECS };
