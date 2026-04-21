/**
 * Behavior System - ECS-based behavior processing
 * Implements boids, target lock, and pre-avoidance steering
 * Uses flat arrays and allocation-free queries
 */

import { WorldData, EntityState, ECS } from '../engine/ecs.js';
import { SpatialSystem } from '../engine/spatialECS.js';

// Reusable scratch arrays to avoid per-frame allocations
const scratchNeighbors = new Int32Array(100);
const scratchPrey = new Int32Array(50);
const scratchPredators = new Int32Array(20);

// World bounds (set during init)
let WORLD_W = 1920;
let WORLD_H = 1080;

// Behavior constants
// Maximum lead time for pursuit prediction (in seconds)
const MAX_PURSUIT_LEAD_TIME = 1.5;

// Minimum closing speed factor (as fraction of max speed)
const MIN_CLOSING_SPEED_FACTOR = 0.3;

// High-level decisions (target selection, state changes) run every DECISION_INTERVAL frames
// to reduce computation without visual impact
const DECISION_INTERVAL = 6;
let frameCounter = 0;

/**
 * Set world bounds for boundary steering
 * @param {number} width
 * @param {number} height
 */
export function setWorldBounds(width, height) {
    WORLD_W = width;
    WORLD_H = height;
}

/**
 * Apply boids steering behaviors to an entity
 * @param {number} i - Entity ID
 * @param {Int32Array} neighbors - Array of neighbor IDs
 * @param {number} neighborCount - Number of valid neighbors
 * @param {Object} config - Boid weight configuration
 */
function applyBoids(i, neighbors, neighborCount, config) {
    if (neighborCount === 0) return;

    const { posX, posY, velX, velY, visionRange, maxSpeed, agility, isPredator, schoolingAffinity } = WorldData;

    // Accumulator vectors
    let sepX = 0, sepY = 0, sepCount = 0;
    let aliX = 0, aliY = 0, aliCount = 0;
    let cohX = 0, cohY = 0, cohCount = 0;

    const vision = visionRange[i];
    const sepRadius = 25 * vision;
    const aliRadius = 50 * vision;
    const cohRadius = 60 * vision;
    const myType = isPredator[i];

    for (let n = 0; n < neighborCount; n++) {
        const other = neighbors[n];
        if (other === i || isPredator[other] !== myType) continue;

        const dx = posX[other] - posX[i];
        const dy = posY[other] - posY[i];
        const distSq = dx * dx + dy * dy;
        if (distSq === 0) continue;
        const dist = Math.sqrt(distSq);

        // Separation - repel within sepRadius
        if (dist < sepRadius) {
            const factor = 1 / dist;
            sepX -= dx * factor;
            sepY -= dy * factor;
            sepCount++;
        }

        // Alignment - match average heading within aliRadius
        if (dist < aliRadius) {
            aliX += velX[other];
            aliY += velY[other];
            aliCount++;
        }

        // Cohesion - steer to center within cohRadius
        if (dist < cohRadius) {
            cohX += posX[other];
            cohY += posY[other];
            cohCount++;
        }
    }

    const speed = maxSpeed[i];
    const maxForce = agility[i];
    // schoolingAffinity scales boid weights from genome [0-1] -> [0.2-2.0]
    const schoolingWeight = 0.2 + schoolingAffinity[i] * 1.8;

    // Apply separation
    if (sepCount > 0) {
        sepX /= sepCount;
        sepY /= sepCount;
        const sepMag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (sepMag > 0) {
            sepX = (sepX / sepMag) * speed - velX[i];
            sepY = (sepY / sepMag) * speed - velY[i];
            const mag = Math.sqrt(sepX * sepX + sepY * sepY);
            if (mag > maxForce) {
                sepX = (sepX / mag) * maxForce;
                sepY = (sepY / mag) * maxForce;
            }
            velX[i] += sepX * config.separationWeight * 1.5;
            velY[i] += sepY * config.separationWeight * 1.5;
        }
    }

    // Apply alignment (scaled by schoolingAffinity)
    if (aliCount > 0) {
        aliX /= aliCount;
        aliY /= aliCount;
        const aliMag = Math.sqrt(aliX * aliX + aliY * aliY);
        if (aliMag > 0) {
            aliX = (aliX / aliMag) * speed - velX[i];
            aliY = (aliY / aliMag) * speed - velY[i];
            const mag = Math.sqrt(aliX * aliX + aliY * aliY);
            if (mag > maxForce) {
                aliX = (aliX / mag) * maxForce;
                aliY = (aliY / mag) * maxForce;
            }
            velX[i] += aliX * config.alignmentWeight * schoolingWeight;
            velY[i] += aliY * config.alignmentWeight * schoolingWeight;
        }
    }

    // Apply cohesion (scaled by schoolingAffinity)
    if (cohCount > 0) {
        cohX = cohX / cohCount - posX[i];
        cohY = cohY / cohCount - posY[i];
        const cohMag = Math.sqrt(cohX * cohX + cohY * cohY);
        if (cohMag > 0) {
            cohX = (cohX / cohMag) * speed - velX[i];
            cohY = (cohY / cohMag) * speed - velY[i];
            const mag = Math.sqrt(cohX * cohX + cohY * cohY);
            if (mag > maxForce) {
                cohX = (cohX / mag) * maxForce;
                cohY = (cohY / mag) * maxForce;
            }
            velX[i] += cohX * config.cohesionWeight * schoolingWeight;
            velY[i] += cohY * config.cohesionWeight * schoolingWeight;
        }
    }
}

/**
 * Apply flee behavior for prey
 * @param {number} i - Entity ID
 * @param {Int32Array} predators - Array of predator IDs
 * @param {number} predatorCount - Number of predators
 */
function applyFlee(i, predators, predatorCount) {
    if (predatorCount === 0) {
        WorldData.state[i] = EntityState.IDLE;
        return;
    }

    const { posX, posY, velX, velY, visionRange, maxSpeed, agility, fear } = WorldData;

    let fleeX = 0, fleeY = 0;
    let count = 0;
    const vision = visionRange[i] * 80;

    for (let n = 0; n < predatorCount; n++) {
        const pred = predators[n];
        const dx = posX[i] - posX[pred];
        const dy = posY[i] - posY[pred];
        const distSq = dx * dx + dy * dy;
        if (distSq > 0 && distSq < vision * vision) {
            const dist = Math.sqrt(distSq);
            fleeX += dx / dist / dist;
            fleeY += dy / dist / dist;
            count++;
        }
    }

    if (count > 0) {
        WorldData.state[i] = EntityState.FLEE;

        fleeX /= count;
        fleeY /= count;
        const mag = Math.sqrt(fleeX * fleeX + fleeY * fleeY);
        if (mag > 0) {
            const speed = maxSpeed[i] * 1.5;
            const maxForce = agility[i] * 1.5;
            fleeX = (fleeX / mag) * speed - velX[i];
            fleeY = (fleeY / mag) * speed - velY[i];
            const fMag = Math.sqrt(fleeX * fleeX + fleeY * fleeY);
            if (fMag > maxForce) {
                fleeX = (fleeX / fMag) * maxForce;
                fleeY = (fleeY / fMag) * maxForce;
            }
            // Fear trait multiplies flee strength [0-1] -> [0.5-2.5]
            const fearMultiplier = 0.5 + fear[i] * 2.0;
            velX[i] += fleeX * fearMultiplier;
            velY[i] += fleeY * fearMultiplier;
        }
    } else {
        WorldData.state[i] = EntityState.IDLE;
    }
}

/**
 * Find nearest prey for predator (with camouflage detection)
 * @param {number} i - Predator entity ID
 * @param {Int32Array} prey - Array of prey IDs
 * @param {number} preyCount - Number of prey
 * @returns {number} Target ID or -1
 */
function findNearestPrey(i, prey, preyCount) {
    if (preyCount === 0) return -1;

    const { posX, posY, camouflage, age } = WorldData;
    let closestId = -1;
    let closestDistSq = Infinity;

    // Use entity ID and age as seed for deterministic pseudo-random detection
    // Age acts as a frame counter proxy, avoiding non-deterministic performance.now()
    // This gives consistent detection rolls across simulation runs with the same seed
    let seed = i * 1597 + ((age[i] * 60) | 0);

    for (let n = 0; n < preyCount; n++) {
        const p = prey[n];
        const dx = posX[p] - posX[i];
        const dy = posY[p] - posY[i];
        const distSq = dx * dx + dy * dy;
        
        // Camouflage reduces detection probability
        // Detection chance = 1 - (camouflage * 0.5), so camouflage [0-1] -> detection [1.0-0.5]
        const detectionChance = 1.0 - camouflage[p] * 0.5;
        
        // LCG pseudo-random (Numerical Recipes constants) - allocation-free
        // Multiplier: 1664525, Increment: 1013904223 are standard LCG parameters
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const roll = (seed >>> 0) / 4294967296;
        
        if (distSq < closestDistSq && roll < detectionChance) {
            closestDistSq = distSq;
            closestId = p;
        }
    }

    return closestId;
}

/**
 * Apply pursuit steering toward target
 * @param {number} i - Predator entity ID
 * @param {number} targetId - Target prey ID
 */
function applyPursuit(i, targetId) {
    const { posX, posY, velX, velY, maxSpeed, agility, aggression } = WorldData;

    // Predict target position
    const dx = posX[targetId] - posX[i];
    const dy = posY[targetId] - posY[i];
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    // Calculate closing speed for lead time prediction
    const toTargetX = dx / dist;
    const toTargetY = dy / dist;
    const preyAwaySpeed = velX[targetId] * toTargetX + velY[targetId] * toTargetY;
    const speed = maxSpeed[i];
    const closingSpeed = Math.max(speed - preyAwaySpeed, speed * MIN_CLOSING_SPEED_FACTOR);
    const leadTime = Math.min(dist / closingSpeed, MAX_PURSUIT_LEAD_TIME);

    // Target predicted position
    const targetX = posX[targetId] + velX[targetId] * leadTime;
    const targetY = posY[targetId] + velY[targetId] * leadTime;

    // Steering = desired - current, limited by maxForce
    let desiredX = targetX - posX[i];
    let desiredY = targetY - posY[i];
    const desiredMag = Math.sqrt(desiredX * desiredX + desiredY * desiredY);
    if (desiredMag > 0) {
        desiredX = (desiredX / desiredMag) * speed * 1.2 - velX[i];
        desiredY = (desiredY / desiredMag) * speed * 1.2 - velY[i];
        const steerMag = Math.sqrt(desiredX * desiredX + desiredY * desiredY);
        const maxForce = agility[i];
        if (steerMag > maxForce) {
            desiredX = (desiredX / steerMag) * maxForce;
            desiredY = (desiredY / steerMag) * maxForce;
        }
        // Aggression trait multiplies pursuit strength [0-1] -> [0.5-2.5]
        const aggressionMultiplier = 0.5 + aggression[i] * 2.0;
        velX[i] += desiredX * aggressionMultiplier;
        velY[i] += desiredY * aggressionMultiplier;
    }
}

/**
 * Apply soft boundary steering (pre-avoidance)
 * Steer fish away from boundaries before they hit them
 * @param {number} i - Entity ID
 * @param {number} margin - Distance from edge to start steering
 */
function applyBoundarySteering(i, margin) {
    const { posX, posY, velX, velY } = WorldData;

    const x = posX[i];
    const y = posY[i];
    let steerX = 0, steerY = 0;

    // Soft steer based on distance to edge (0..1)
    if (x < margin) steerX += (margin - x) * 0.1;
    if (x > WORLD_W - margin) steerX -= (x - (WORLD_W - margin)) * 0.1;
    if (y < margin) steerY += (margin - y) * 0.1;
    if (y > WORLD_H - margin) steerY -= (y - (WORLD_H - margin)) * 0.1;

    // Apply directly to velocity for smooth turn
    velX[i] += steerX;
    velY[i] += steerY;
}

/**
 * Apply terrain avoidance
 * @param {number} i - Entity ID
 * @param {Object} terrain - Terrain object with heightAt method
 * @param {number} worldHeight - World height
 */
function applyTerrainAvoidance(i, terrain, worldHeight) {
    if (!terrain) return;

    const { posX, posY, velY, agility } = WorldData;

    const terrainHeight = terrain.heightAt(posX[i]);
    const groundY = worldHeight - terrainHeight;
    const terrainMargin = 40;

    if (posY[i] > groundY - terrainMargin) {
        const penetration = (posY[i] - (groundY - terrainMargin)) / terrainMargin;
        velY[i] -= agility[i] * 10 * Math.min(1, penetration);
    }
}

/**
 * Behavior System - main update function
 * 
 * Optimizations:
 * - Decision scheduling: Target selection runs every DECISION_INTERVAL frames
 */
export const BehaviorSystem = {
    /**
     * Update all entity behaviors
     * @param {number} dt - Delta time
     * @param {Object} config - Boid weight configuration
     * @param {Object} [terrain] - Optional terrain for avoidance
     */
    update: (dt, config, terrain = null) => {
        const { posX, posY, velX, velY, active, isPredator, visionRange, state, targetId, stateTimer, speciesId } = WorldData;
        const count = WorldData.count;

        // Decision scheduling optimization
        frameCounter++;
        const isDecisionFrame = (frameCounter % DECISION_INTERVAL) === 0;

        // Ambush predator constants (from s08)
        const AMBUSH_TRIGGER_RANGE = 150; // Range to trigger ambush attack
        const CHASE_DURATION = 5.0;       // Seconds before giving up chase
        const COOLDOWN_DURATION = 2.0;    // Seconds of rest after chase
        const AMBUSHER_SPECIES_ID = 101;  // speciesId for ambusher

        for (let i = 0; i < count; i++) {
            if (!active[i]) continue;

            const x = posX[i];
            const y = posY[i];
            const vision = visionRange[i] * 60;

            // 1. SPATIAL QUERY for neighbors
            const neighborCount = SpatialSystem.query(x, y, vision, scratchNeighbors, i);

            // 2. BEHAVIOR SWITCHING based on type
            if (isPredator[i]) {
                // Query for prey only on decision frames or when no target (invisible optimization)
                const needsPreyQuery = isDecisionFrame || targetId[i] === -1;
                let preyCount = 0;
                if (needsPreyQuery) {
                    preyCount = SpatialSystem.queryByType(x, y, 150, false, scratchPrey, i);
                }
                
                const isAmbusher = speciesId[i] === AMBUSHER_SPECIES_ID;

                // Ambush Predator State Machine (from s08 / SYNTHESIS.md)
                if (isAmbusher) {
                    const currentState = state[i];

                    if (currentState === EntityState.AMBUSH) {
                        // HIDING mode: slow drift, waiting for prey (high-frequency)
                        velX[i] *= 0.9;
                        velY[i] *= 0.9;

                        // LOW-FREQUENCY: Check for ambush trigger only on decision frames
                        if (isDecisionFrame) {
                            const preyCount = SpatialSystem.queryByType(x, y, 150, false, scratchPrey, i);
                            // Find nearest prey distance
                            let nearestDistSq = Infinity;
                            for (let n = 0; n < preyCount; n++) {
                                const preyId = scratchPrey[n];
                                const dx = posX[preyId] - x;
                                const dy = posY[preyId] - y;
                                const dSq = dx * dx + dy * dy;
                                if (dSq < nearestDistSq) nearestDistSq = dSq;
                            }

                            // Trigger: prey enters ambush range
                            if (nearestDistSq < AMBUSH_TRIGGER_RANGE * AMBUSH_TRIGGER_RANGE) {
                                state[i] = EntityState.CHASE;
                                stateTimer[i] = CHASE_DURATION;
                            }
                        }

                        // Slow wander while hiding (reduced frequency)
                        if (neighborCount > 0) {
                            applyBoids(i, scratchNeighbors, neighborCount, config);
                        }

                    } else if (currentState === EntityState.CHASE) {
                        stateTimer[i] -= dt;

                        // Target Lock validation (high-frequency - must always validate)
                        let currentTarget = targetId[i];
                        if (currentTarget !== -1 && !ECS.isValid(currentTarget)) {
                            targetId[i] = -1;
                            currentTarget = -1;
                        }

                        // LOW-FREQUENCY: Find new target only on decision frames
                        if (currentTarget === -1 && isDecisionFrame) {
                            const preyCount = SpatialSystem.queryByType(x, y, 150, false, scratchPrey, i);
                            currentTarget = findNearestPrey(i, scratchPrey, preyCount);
                            targetId[i] = currentTarget;
                        }

                        // High-frequency: Pursuit steering
                        if (currentTarget !== -1) {
                            applyPursuit(i, currentTarget);
                        }

                        // LOW-FREQUENCY: State transition check
                        if (isDecisionFrame) {
                            const preyCount = SpatialSystem.queryByType(x, y, 150, false, scratchPrey, i);
                            if (stateTimer[i] <= 0 || preyCount === 0) {
                                state[i] = EntityState.COOLDOWN;
                                stateTimer[i] = COOLDOWN_DURATION;
                                targetId[i] = -1;
                            }
                        }

                    } else if (currentState === EntityState.COOLDOWN) {
                        // COOLDOWN mode: rest period with slow movement (high-frequency)
                        stateTimer[i] -= dt;
                        velX[i] *= 0.96;
                        velY[i] *= 0.96;

                        // LOW-FREQUENCY: State transition check
                        if (isDecisionFrame && stateTimer[i] <= 0) {
                            state[i] = EntityState.AMBUSH;
                        }
                    } else {
                        state[i] = EntityState.AMBUSH;
                    }

                } else {
                    // Regular Hunter Predator behavior with Target Lock
                    state[i] = EntityState.CHASE;

                    // Target Lock validation (high-frequency - must always validate)
                    let currentTarget = targetId[i];

                    // Validate and find target on decision frames
                    if (currentTarget !== -1 && !ECS.isValid(currentTarget)) {
                        targetId[i] = -1;
                        currentTarget = -1;
                    }

                    if (currentTarget === -1 && preyCount > 0) {
                        currentTarget = findNearestPrey(i, scratchPrey, preyCount);
                        targetId[i] = currentTarget;
                    }

                    // High-frequency: Pursuit steering or wander
                    if (currentTarget !== -1) {
                        applyPursuit(i, currentTarget);
                    } else if (neighborCount > 0) {
                        applyBoids(i, scratchNeighbors, neighborCount, config);
                    }
                }
            } else {
                // Prey behavior
                // Query for predators (invisible optimization: only when needed)
                const needsPredatorQuery = isDecisionFrame || state[i] === EntityState.FLEE;
                let predatorCount = 0;
                if (needsPredatorQuery) {
                    predatorCount = SpatialSystem.queryByType(x, y, 100, true, scratchPredators, i);
                }

                if (predatorCount > 0) {
                    applyFlee(i, scratchPredators, predatorCount);
                } else if (state[i] === EntityState.FLEE && isDecisionFrame) {
                    state[i] = EntityState.IDLE;
                }

                // Standard Boids
                applyBoids(i, scratchNeighbors, neighborCount, config);
            }

            // 3. PRE-AVOIDANCE for boundaries (always runs - critical for correctness)
            applyBoundarySteering(i, 50);

            // 4. TERRAIN AVOIDANCE (always runs - critical for correctness)
            if (terrain) {
                applyTerrainAvoidance(i, terrain, WORLD_H);
            }
        }
    }
};
