import { Vec2, SeededRandom, clamp } from '../engine/math.js';

/**
 * Fish genome - normalized traits [0,1] mapped to behaviors
 */
export class Genome {
    /**
     * @param {SeededRandom} rng
     * @param {Genome} [parent1]
     * @param {Genome} [parent2]
     * @param {number} [mutationRate=0.1]
     */
    constructor(rng, parent1 = null, parent2 = null, mutationRate = 0.1) {
        if (parent1 && parent2) {
            // Reproduction with crossover
            this.speed = rng.next() < 0.5 ? parent1.speed : parent2.speed;
            this.visionRange = rng.next() < 0.5 ? parent1.visionRange : parent2.visionRange;
            this.agility = rng.next() < 0.5 ? parent1.agility : parent2.agility;
            this.schooling = rng.next() < 0.5 ? parent1.schooling : parent2.schooling;
            this.fear = rng.next() < 0.5 ? parent1.fear : parent2.fear;
            this.aggression = rng.next() < 0.5 ? parent1.aggression : parent2.aggression;
            this.camouflage = rng.next() < 0.5 ? parent1.camouflage : parent2.camouflage;
            this.metabolism = rng.next() < 0.5 ? parent1.metabolism : parent2.metabolism;
            this.size = rng.next() < 0.5 ? parent1.size : parent2.size;
        } else if (parent1) {
            // Asexual reproduction
            this.speed = parent1.speed;
            this.visionRange = parent1.visionRange;
            this.agility = parent1.agility;
            this.schooling = parent1.schooling;
            this.fear = parent1.fear;
            this.aggression = parent1.aggression;
            this.camouflage = parent1.camouflage;
            this.metabolism = parent1.metabolism;
            this.size = parent1.size;
        } else {
            // Random initialization
            this.speed = rng.next();
            this.visionRange = rng.next();
            this.agility = rng.next();
            this.schooling = rng.next();
            this.fear = rng.next();
            this.aggression = rng.next();
            this.camouflage = rng.next();
            this.metabolism = rng.next();
            this.size = rng.next();
        }
        
        // Apply mutations
        this._mutate(rng, mutationRate);
    }

    /**
     * @param {SeededRandom} rng
     * @param {number} rate
     */
    _mutate(rng, rate) {
        const mutate = (val) => {
            if (rng.next() < rate) {
                return clamp(val + rng.gaussian(0, 0.1), 0, 1);
            }
            return val;
        };
        
        this.speed = mutate(this.speed);
        this.visionRange = mutate(this.visionRange);
        this.agility = mutate(this.agility);
        this.schooling = mutate(this.schooling);
        this.fear = mutate(this.fear);
        this.aggression = mutate(this.aggression);
        this.camouflage = mutate(this.camouflage);
        this.metabolism = mutate(this.metabolism);
        this.size = mutate(this.size);
    }

    // Mapped trait getters (normalized -> actual values)
    getMaxSpeed() { return 1.5 + this.speed * 3; }
    getVisionRange() { return 0.5 + this.visionRange * 1.5; } // Multiplier for base vision
    getAgility() { return 0.05 + this.agility * 0.15; } // Max steering force
    getSchoolingWeight() { return 0.2 + this.schooling * 1.8; }
    getFearMultiplier() { return 0.5 + this.fear * 2; }
    getAggressionMultiplier() { return 0.5 + this.aggression * 2; }
    getCamouflageBonus() { return this.camouflage * 0.5; } // Detection probability reduction
    getMetabolismRate() { return 0.5 + this.metabolism * 1; } // Energy drain multiplier
    getBodySize() { return 6 + this.size * 8; } // Pixel size
}

/**
 * Fish entity with boids behavior and evolution
 */
export class Fish {
    static nextId = 0;

    /**
     * @param {Object} options
     * @param {number} options.x
     * @param {number} options.y
     * @param {SeededRandom} options.rng
     * @param {boolean} [options.isPredator=false]
     * @param {string} options.species
     * @param {Genome} [options.genome]
     * @param {number} [options.mutationRate=0.1]
     */
    constructor({ x, y, rng, isPredator = false, species, genome = null, mutationRate = 0.1 }) {
        this.id = Fish.nextId++;
        this.type = isPredator ? 'predator' : 'prey';
        this.isPredator = isPredator;
        this.species = species;
        
        this.pos = new Vec2(x, y);
        this.vel = Vec2.fromAngle(rng.next() * Math.PI * 2, 1 + rng.next());
        this.acc = new Vec2();
        
        // Genome
        this.genome = genome || new Genome(rng, null, null, mutationRate);
        this.size = this.genome.getBodySize();
        
        // Energy and lifecycle
        this.energy = 50 + rng.next() * 50;
        this.maxEnergy = 100 + this.genome.size * 50;
        this.age = 0;
        this.maxAge = 60 + rng.next() * 60; // 60-120 seconds
        this.reproductionCooldown = 0;
        this.alive = true;
        
        // Visual
        this.color = this._generateColor(rng, species, isPredator);
        
        // Reusable vectors to avoid allocations
        this._steer = new Vec2();
        this._diff = new Vec2();
    }

    /**
     * @param {SeededRandom} rng
     * @param {string} species
     * @param {boolean} isPredator
     */
    _generateColor(rng, species, isPredator) {
        let hue, sat, light;
        
        if (isPredator) {
            // Red/orange predators
            hue = 0 + rng.next() * 30;
            sat = 60 + rng.next() * 20;
            light = 40 + rng.next() * 20;
        } else {
            // Blue/cyan/green prey based on species
            const speciesHues = { 'schooler': 180, 'darter': 160, 'grazer': 140 };
            hue = (speciesHues[species] || 180) + rng.range(-20, 20);
            sat = 50 + rng.next() * 30;
            light = 45 + rng.next() * 25;
        }
        
        return {
            main: `hsl(${hue}, ${sat}%, ${light}%)`,
            light: `hsl(${hue}, ${sat}%, ${light + 20}%)`,
            dark: `hsl(${hue}, ${sat}%, ${light - 15}%)`,
            fin: `hsl(${hue + 10}, ${sat - 10}%, ${light}%)`
        };
    }

    /**
     * Apply boids steering behaviors
     * @param {Array<Fish>} neighbors
     * @param {Object} config
     */
    applyBoids(neighbors, config) {
        if (neighbors.length === 0) return;
        
        const separation = new Vec2();
        const alignment = new Vec2();
        const cohesion = new Vec2();
        let sepCount = 0;
        let aliCount = 0;
        let cohCount = 0;
        
        // Boid radii scaled by vision range
        const visionMult = this.genome.getVisionRange();
        const sepRadius = 25 * visionMult;
        const aliRadius = 50 * visionMult;
        const cohRadius = 60 * visionMult;
        const maxForce = this.genome.getAgility();
        const maxSpeed = this.genome.getMaxSpeed();
        
        for (const other of neighbors) {
            if (other === this || other.type !== this.type) continue;
            
            const d = this.pos.dist(other.pos);
            if (d <= 0) continue;
            
            // Separation - repel within sepRadius
            if (d < sepRadius) {
                this._diff.copy(this.pos).sub(other.pos).normalize().div(d);
                separation.add(this._diff);
                sepCount++;
            }
            
            // Alignment - match average heading within aliRadius
            if (d < aliRadius) {
                alignment.add(other.vel);
                aliCount++;
            }
            
            // Cohesion - steer to center within cohRadius
            if (d < cohRadius) {
                cohesion.add(other.pos);
                cohCount++;
            }
        }
        
        const schoolingWeight = this.genome.getSchoolingWeight();
        
        // Apply separation with acceleration-limited steering
        if (sepCount > 0) {
            separation.div(sepCount).normalize().mult(maxSpeed);
            separation.sub(this.vel).limit(maxForce);
            this.acc.add(separation.mult(config.separationWeight * 1.5));
        }
        
        // Apply alignment with acceleration-limited steering
        if (aliCount > 0) {
            alignment.div(aliCount).normalize().mult(maxSpeed);
            alignment.sub(this.vel).limit(maxForce);
            this.acc.add(alignment.mult(config.alignmentWeight * schoolingWeight));
        }
        
        // Apply cohesion with acceleration-limited steering
        if (cohCount > 0) {
            cohesion.div(cohCount).sub(this.pos).normalize().mult(maxSpeed);
            cohesion.sub(this.vel).limit(maxForce);
            this.acc.add(cohesion.mult(config.cohesionWeight * schoolingWeight));
        }
    }

    /**
     * Flee from predators (for prey)
     * @param {Array<Fish>} predators
     */
    flee(predators) {
        if (predators.length === 0) return;
        
        const fleeForce = new Vec2();
        const visionRange = 80 * this.genome.getVisionRange();
        let count = 0;
        
        for (const pred of predators) {
            const d = this.pos.dist(pred.pos);
            if (d < visionRange && d > 0) {
                this._diff.copy(this.pos).sub(pred.pos).normalize().div(d);
                fleeForce.add(this._diff);
                count++;
            }
        }
        
        if (count > 0) {
            fleeForce.div(count).normalize().mult(this.genome.getMaxSpeed() * 1.5);
            fleeForce.sub(this.vel).limit(this.genome.getAgility() * 1.5);
            this.acc.add(fleeForce.mult(this.genome.getFearMultiplier()));
        }
    }

    /**
     * Chase prey (for predators)
     * @param {Array<Fish>} prey
     * @param {import('../engine/math.js').SeededRandom} [rng]
     * @returns {Fish|null} Target being chased
     */
    chase(prey, rng = null) {
        if (prey.length === 0) return null;
        
        const visionRange = 100 * this.genome.getVisionRange();
        const maxSpeed = this.genome.getMaxSpeed();
        const maxForce = this.genome.getAgility();
        let closest = null;
        let closestDist = Infinity;
        
        for (const p of prey) {
            const d = this.pos.dist(p.pos);
            // Apply camouflage - harder to detect (use seeded RNG if available)
            const detectionChance = 1 - p.genome.getCamouflageBonus();
            const roll = rng ? rng.next() : Math.random();
            if (d < visionRange && d < closestDist && roll < detectionChance) {
                closest = p;
                closestDist = d;
            }
        }
        
        if (closest) {
            // Predict target position with velocity-based lead time
            // Use relative velocity projected onto pursuit direction for closing speed
            const toTarget = Vec2.sub(closest.pos, this.pos);
            const toTargetNorm = toTarget.clone().normalize();
            // Closing speed = predator's approach speed - component of prey velocity moving away
            const preyAwaySpeed = closest.vel.x * toTargetNorm.x + closest.vel.y * toTargetNorm.y;
            const closingSpeed = Math.max(maxSpeed - preyAwaySpeed, maxSpeed * 0.3);
            const leadTime = Math.min(closestDist / closingSpeed, 1.5);
            const targetPos = Vec2.add(closest.pos, closest.vel.clone().mult(leadTime));
            
            // Steering = desired velocity - current velocity, limited by maxForce
            const desired = Vec2.sub(targetPos, this.pos).normalize().mult(maxSpeed * 1.2);
            const steer = desired.sub(this.vel).limit(maxForce);
            this.acc.add(steer.mult(this.genome.getAggressionMultiplier()));
            
            return closest;
        }
        return null;
    }

    /**
     * Avoid boundaries and terrain
     * @param {number} width
     * @param {number} height
     * @param {Object} terrain
     */
    avoidBoundaries(width, height, terrain) {
        const margin = 50;
        const turnForce = this.genome.getAgility() * 5; // Scale by agility
        
        // Screen boundaries with smooth steering
        if (this.pos.x < margin) this.acc.x += turnForce * (1 - this.pos.x / margin);
        if (this.pos.x > width - margin) this.acc.x -= turnForce * (1 - (width - this.pos.x) / margin);
        if (this.pos.y < margin) this.acc.y += turnForce * (1 - this.pos.y / margin);
        
        // Terrain avoidance (heightfield collision)
        if (terrain) {
            const terrainHeight = terrain.heightAt(this.pos.x);
            const groundY = height - terrainHeight;
            const terrainMargin = 40;
            if (this.pos.y > groundY - terrainMargin) {
                const penetration = (this.pos.y - (groundY - terrainMargin)) / terrainMargin;
                this.acc.y -= turnForce * 2 * Math.min(1, penetration);
            }
        }
    }

    /**
     * Avoid kelp stalk collision radius (optimized)
     * @param {Array} kelpBlades - Array of kelp blades
     */
    avoidKelp(kelpBlades) {
        if (!kelpBlades || kelpBlades.length === 0) return;
        
        const avoidRadius = 25; // Collision radius for kelp stalks
        const turnForce = this.genome.getAgility() * 3;
        const fishX = this.pos.x;
        const fishY = this.pos.y;
        
        // Only check nearby kelp (simple spatial filtering)
        let nearbyCount = 0;
        const maxChecks = 5; // Limit checks per fish for performance
        
        for (let i = 0; i < kelpBlades.length && nearbyCount < maxChecks; i++) {
            const blade = kelpBlades[i];
            const dx = fishX - blade.anchorX;
            const dist = Math.abs(dx);
            
            // Quick x-range check first (cheap)
            if (dist > avoidRadius || dist === 0) continue;
            
            const kelpTop = blade.anchorY - blade.segmentCount * blade.segmentLength;
            
            // Only avoid if fish is within kelp height range
            if (fishY > kelpTop && fishY < blade.anchorY + 20) {
                // Steer away from kelp stalk
                const force = (avoidRadius - dist) / avoidRadius * turnForce;
                this.acc.x += (dx > 0 ? force : -force);
                nearbyCount++;
            }
        }
    }

    /**
     * Update physics
     * @param {number} dt
     */
    update(dt) {
        // Apply acceleration
        this.vel.add(this.acc);
        this.vel.limit(this.genome.getMaxSpeed());
        
        // Apply drag
        this.vel.mult(0.98);
        
        // Update position
        this.pos.add(this.vel.clone().mult(dt * 60));
        
        // Reset acceleration
        this.acc.set(0, 0);
        
        // Energy drain
        const speedCost = this.vel.mag() * this.vel.mag() * 0.001;
        const baseCost = 0.02 * this.genome.getMetabolismRate();
        this.energy -= (baseCost + speedCost) * dt * 60;
        
        // Age
        this.age += dt;
        this.reproductionCooldown = Math.max(0, this.reproductionCooldown - dt);
        
        // Death conditions
        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
        }
    }

    /**
     * Check if can reproduce
     * @returns {boolean}
     */
    canReproduce() {
        return this.energy > this.maxEnergy * 0.7 && 
               this.age > 5 && 
               this.reproductionCooldown <= 0;
    }

    /**
     * Reproduce and create offspring
     * @param {SeededRandom} rng
     * @param {number} mutationRate
     * @returns {Fish}
     */
    reproduce(rng, mutationRate) {
        this.energy *= 0.5;
        // Predators have longer reproduction cooldown for balance
        this.reproductionCooldown = this.isPredator ? 15 : 10;
        
        const offspringGenome = new Genome(rng, this.genome, null, mutationRate);
        
        return new Fish({
            x: this.pos.x + rng.range(-20, 20),
            y: this.pos.y + rng.range(-20, 20),
            rng,
            isPredator: this.isPredator,
            species: this.species,
            genome: offspringGenome,
            mutationRate
        });
    }

    /**
     * Eat prey (for predators)
     * @param {Fish} prey
     */
    eat(prey) {
        const energyGain = 30 + prey.size;
        this.energy = Math.min(this.maxEnergy, this.energy + energyGain);
        prey.alive = false;
    }
}
