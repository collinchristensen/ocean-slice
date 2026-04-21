/**
 * Entity Component System Core
 * Structure-of-Arrays (SoA) layout for maximum CPU cache locality
 * Enables SIMD-like processing of thousands of entities at high FPS
 */

export const MAX_ENTITIES = 10000;

/**
 * World data using Structure of Arrays (SoA)
 * All component data stored in contiguous Float32Arrays for cache-friendly access
 */
export const WorldData = {
    // Transform & Physics
    posX: new Float32Array(MAX_ENTITIES),
    posY: new Float32Array(MAX_ENTITIES),
    velX: new Float32Array(MAX_ENTITIES),
    velY: new Float32Array(MAX_ENTITIES),
    angle: new Float32Array(MAX_ENTITIES),

    // Boids & Behavior weights
    separation: new Float32Array(MAX_ENTITIES),
    alignment: new Float32Array(MAX_ENTITIES),
    cohesion: new Float32Array(MAX_ENTITIES),

    // Genetics / State
    speciesId: new Uint8Array(MAX_ENTITIES),  // Maps to Texture Atlas
    scale: new Float32Array(MAX_ENTITIES),
    energy: new Float32Array(MAX_ENTITIES),
    maxEnergy: new Float32Array(MAX_ENTITIES),
    state: new Uint8Array(MAX_ENTITIES),       // 0: IDLE, 1: FLEE, 2: CHASE, 3: AMBUSH, 4: COOLDOWN
    targetId: new Int16Array(MAX_ENTITIES).fill(-1),  // For Target Lock
    stateTimer: new Float32Array(MAX_ENTITIES),  // Timer for mode transitions (ambush/cooldown)

    // Vision and behavior traits
    visionRange: new Float32Array(MAX_ENTITIES),
    maxSpeed: new Float32Array(MAX_ENTITIES),
    agility: new Float32Array(MAX_ENTITIES),

    // Genome traits
    schoolingAffinity: new Float32Array(MAX_ENTITIES), // Boid weight scaling [0-1]
    fear: new Float32Array(MAX_ENTITIES),              // Prey flee strength [0-1]
    aggression: new Float32Array(MAX_ENTITIES),        // Predator chase strength [0-1]
    camouflage: new Float32Array(MAX_ENTITIES),        // Detection probability reduction [0-1]
    metabolism: new Float32Array(MAX_ENTITIES),        // Energy drain multiplier [0-1]

    // Type flags
    isPredator: new Uint8Array(MAX_ENTITIES),

    // Lifecycle
    age: new Float32Array(MAX_ENTITIES),
    maxAge: new Float32Array(MAX_ENTITIES),
    reproductionCooldown: new Float32Array(MAX_ENTITIES),

    // Color data (stored as HSL values for procedural rendering)
    colorHue: new Float32Array(MAX_ENTITIES),
    colorSat: new Float32Array(MAX_ENTITIES),
    colorLight: new Float32Array(MAX_ENTITIES),

    // Management
    active: new Uint8Array(MAX_ENTITIES),
    count: 0
};

/**
 * Component Hygiene - RareTraitPool
 * Store rarely-used data (e.g., ambush-specific state, hormonal states, complex genomes)
 * in a separate pool to avoid array bloat in the main WorldData.
 * Only ~10-20% of entities (ambush predators) use this data.
 */
export const RareTraitPool = {
    // Maximum rare entities (ambush predators, special prey, etc.)
    maxRareEntities: 200,
    
    // Map entity ID -> rare trait index (sparse lookup)
    entityToRareIndex: new Int16Array(MAX_ENTITIES).fill(-1),
    
    // Rare trait data arrays (indexed by rare trait index, not entity ID)
    ambushChargeLevel: new Float32Array(200),    // Burst energy for ambush attack
    lastPounceTime: new Float32Array(200),       // Time of last pounce
    patienceLevel: new Float32Array(200),        // How long ambusher waits
    
    // Counter for active rare traits
    rareCount: 0,
    
    /**
     * Register an entity for rare traits
     * @param {number} entityId
     * @returns {number} Rare trait index, or -1 if pool full
     */
    register: (entityId) => {
        if (RareTraitPool.rareCount >= RareTraitPool.maxRareEntities) return -1;
        const rareIdx = RareTraitPool.rareCount++;
        RareTraitPool.entityToRareIndex[entityId] = rareIdx;
        
        // Initialize defaults
        RareTraitPool.ambushChargeLevel[rareIdx] = 1.0;
        RareTraitPool.lastPounceTime[rareIdx] = 0;
        RareTraitPool.patienceLevel[rareIdx] = 0.5;
        
        return rareIdx;
    },
    
    /**
     * Get rare trait index for an entity
     * @param {number} entityId
     * @returns {number} Rare trait index, or -1 if not registered
     */
    getRareIndex: (entityId) => {
        return RareTraitPool.entityToRareIndex[entityId];
    },
    
    /**
     * Reset rare trait pool
     */
    reset: () => {
        RareTraitPool.entityToRareIndex.fill(-1);
        RareTraitPool.rareCount = 0;
        // Clear rare trait data arrays to prevent stale data
        RareTraitPool.ambushChargeLevel.fill(0);
        RareTraitPool.lastPounceTime.fill(0);
        RareTraitPool.patienceLevel.fill(0);
    }
};

/**
 * Entity state constants
 */
export const EntityState = {
    IDLE: 0,
    FLEE: 1,
    CHASE: 2,
    AMBUSH: 3,    // Hiding/waiting mode for ambush predators
    COOLDOWN: 4   // Recovery period after chase
};

/**
 * ECS management functions
 */
export const ECS = {
    /**
     * Create a new entity
     * @returns {number} Entity ID, or -1 if max entities reached
     */
    createEntity: () => {
        if (WorldData.count >= MAX_ENTITIES) return -1;
        const id = WorldData.count++;
        WorldData.active[id] = 1;
        WorldData.targetId[id] = -1;
        WorldData.state[id] = EntityState.IDLE;
        return id;
    },

    /**
     * Remove an entity by marking it inactive
     * @param {number} id - Entity ID to remove
     */
    removeEntity: (id) => {
        if (id < 0 || id >= WorldData.count) return;
        WorldData.active[id] = 0;
        WorldData.targetId[id] = -1;
    },

    /**
     * Check if an entity is valid and active
     * @param {number} id - Entity ID to check
     * @returns {boolean}
     */
    isValid: (id) => {
        return id >= 0 && id < WorldData.count && WorldData.active[id] === 1;
    },

    /**
     * Reset all entity data (for world regeneration)
     */
    reset: () => {
        WorldData.count = 0;
        // Reset all active flags
        WorldData.active.fill(0);
        WorldData.targetId.fill(-1);
        // Also reset RareTraitPool
        RareTraitPool.reset();
    },

    /**
     * Get count of active entities
     * @returns {number}
     */
    getActiveCount: () => {
        let count = 0;
        for (let i = 0; i < WorldData.count; i++) {
            if (WorldData.active[i]) count++;
        }
        return count;
    },

    /**
     * Get counts by type
     * @returns {{prey: number, predators: number}}
     */
    getCounts: () => {
        let prey = 0;
        let predators = 0;
        for (let i = 0; i < WorldData.count; i++) {
            if (WorldData.active[i]) {
                if (WorldData.isPredator[i]) predators++;
                else prey++;
            }
        }
        return { prey, predators };
    }
};
