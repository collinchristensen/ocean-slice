/**
 * Ocean Slice - Main Entry Point
 * Evolutionary fish simulation with boids, predator-prey dynamics, and procedural generation
 * 
 * Architecture: Entity Component System (ECS) with Structure-of-Arrays (SoA)
 * - Maximizes CPU cache locality for thousands of agents at high FPS
 * - Uses flat TypedArrays for zero-GC physics/behavior loops
 * - Batched sprite rendering with procedural texture atlas
 */

import { GameLoop } from './engine/loop.js';
import { drawOceanBackground, drawParticles, drawTerrain, drawKelp, invalidateTerrainCache } from './engine/render.js';
import { RenderSystem } from './engine/fishRenderer.js';
import { WorldECS } from './sim/worldECS.js';
import { setWorldBounds } from './sim/behavior.js';
import { UIController } from './ui/controller.js';

// Get canvas and context
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Handle resize
let width, height;
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

// Initialize ECS-based world
const world = new WorldECS({
    width,
    height,
    seed: 'ocean-001',
    fishScale: 1.0,
    lowQuality: false
});

// Stats update interval
let lastStatsUpdate = 0;
const STATS_UPDATE_INTERVAL = 500; // ms

// Fixed timestep for physics (from s06)
const LOOP_DT = 1 / 60;

// Game loop with fixed timestep physics and interpolated rendering
const loop = new GameLoop({
    fixedDt: LOOP_DT,
    update: (dt) => {
        // Run AI, Physics & Lifecycle (spatial hash update happens inside world.update)
        world.update(dt);
    },
    render: (alpha) => {
        // Clear and draw background
        drawOceanBackground(ctx, width, height);
        
        // Draw particles (background layer)
        drawParticles(ctx, world.particles);
        
        // Draw kelp (behind fish)
        for (const blade of world.kelp.blades) {
            drawKelp(ctx, blade);
        }
        
        // Draw terrain
        drawTerrain(ctx, world.terrain, width, height);
        
        // Draw fish using ECS render system (batched sprite instancing)
        const time = performance.now() / 1000;
        RenderSystem.draw(ctx, width, height, time, ui.debugMode);
        
        // Update UI stats periodically
        const now = performance.now();
        if (now - lastStatsUpdate > STATS_UPDATE_INTERVAL) {
            ui.updateStats();
            lastStatsUpdate = now;
        }
    }
});

// Initialize UI
const ui = new UIController(world, loop);

// Start simulation
loop.start();

// Handle window resize for world
window.addEventListener('resize', () => {
    world.width = width;
    world.height = height;
    setWorldBounds(width, height);
    invalidateTerrainCache();
});
