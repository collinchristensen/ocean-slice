/**
 * Fish Renderer - Procedural Atlas & Batched Instancing
 * Uses pre-rendered sprites for GPU-accelerated blitting instead of per-frame path drawing
 * Tail animation is procedural using a simple sine wave
 */

import { WorldData } from './ecs.js';

// Texture Atlas Cache: species hash -> OffscreenCanvas/Canvas
const Atlas = new Map();

// Sprite dimensions - pre-computed offsets
const SPRITE_WIDTH = 64;
const SPRITE_HEIGHT = 32;
const SPRITE_HALF_W = SPRITE_WIDTH / 2;
const SPRITE_HALF_H = SPRITE_HEIGHT / 2;

// Pre-built HSL color cache for tails (avoids string allocation per frame)
const hslCache = new Map();

function getHSL(h, s, l) {
    const key = (h << 16) | (s << 8) | l;
    if (!hslCache.has(key)) {
        hslCache.set(key, `hsl(${h},${s}%,${l}%)`);
    }
    return hslCache.get(key);
}

/**
 * Generate a unique sprite key based on color
 * @param {number} hue
 * @param {number} sat
 * @param {number} light
 * @param {boolean} isPredator
 * @returns {string}
 */
function getSpriteKey(hue, sat, light, isPredator) {
    // Quantize colors for efficient caching
    const qHue = Math.round(hue / 10) * 10;
    const qSat = Math.round(sat / 10) * 10;
    const qLight = Math.round(light / 10) * 10;
    return `${qHue}_${qSat}_${qLight}_${isPredator ? 1 : 0}`;
}

/**
 * Generate a fish sprite (body only, tail is procedural)
 * @param {number} hue - HSL hue (0-360)
 * @param {number} sat - HSL saturation (0-100)
 * @param {number} light - HSL lightness (0-100)
 * @param {boolean} isPredator - Whether this is a predator fish
 * @returns {HTMLCanvasElement}
 */
function generateFishSprite(hue, sat, light, isPredator) {
    const c = document.createElement('canvas');
    c.width = SPRITE_WIDTH;
    c.height = SPRITE_HEIGHT;
    const ctx = c.getContext('2d');

    // Colors
    const mainColor = `hsl(${hue}, ${sat}%, ${light}%)`;
    const lightColor = `hsl(${hue}, ${sat}%, ${light + 20}%)`;
    const darkColor = `hsl(${hue}, ${sat}%, ${Math.max(0, light - 15)}%)`;
    const finColor = `hsl(${hue + 10}, ${Math.max(0, sat - 10)}%, ${light}%)`;

    // Body dimensions (centered in sprite)
    const centerX = SPRITE_WIDTH / 2;
    const centerY = SPRITE_HEIGHT / 2;
    const bodyLength = 20;
    const bodyHeight = 8;

    // Body gradient
    const bodyGrad = ctx.createLinearGradient(centerX, centerY - bodyHeight, centerX, centerY + bodyHeight);
    bodyGrad.addColorStop(0, lightColor);
    bodyGrad.addColorStop(0.5, mainColor);
    bodyGrad.addColorStop(1, darkColor);

    // Draw body ellipse
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, bodyLength, bodyHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dorsal fin
    ctx.fillStyle = finColor;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(centerX + bodyLength * 0.2, centerY - bodyHeight * 0.3);
    ctx.lineTo(centerX - bodyLength * 0.2, centerY - bodyHeight * 1.4);
    ctx.lineTo(centerX - bodyLength * 0.5, centerY - bodyHeight * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX + bodyLength * 0.5, centerY - bodyHeight * 0.2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(centerX + bodyLength * 0.55, centerY - bodyHeight * 0.2, 1, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(centerX + bodyLength * 0.2, centerY - bodyHeight * 0.4, bodyLength * 0.3, bodyHeight * 0.15, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Predator marking (red stripe)
    if (isPredator) {
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX - bodyLength * 0.6, centerY);
        ctx.lineTo(centerX + bodyLength * 0.3, centerY);
        ctx.stroke();
    }

    return c;
}

/**
 * Get or create a sprite from the atlas
 * @param {number} hue
 * @param {number} sat
 * @param {number} light
 * @param {boolean} isPredator
 * @returns {HTMLCanvasElement}
 */
function getSprite(hue, sat, light, isPredator) {
    const key = getSpriteKey(hue, sat, light, isPredator);
    if (!Atlas.has(key)) {
        Atlas.set(key, generateFishSprite(hue, sat, light, isPredator));
    }
    return Atlas.get(key);
}

/**
 * Render System - ECS-compatible fish rendering with batched sprites
 */
export const RenderSystem = {
    /**
     * Draw all active fish entities
     * Optimized rendering:
     * - Reduced context save/restore calls
     * - Pre-cached tail color strings
     * - Culling for off-screen entities
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {number} time - Current time in seconds for animation
     * @param {boolean} [debugMode=false] - Show debug overlays
     */
    draw: (ctx, width, height, time, debugMode = false) => {
        const {
            posX, posY, velX, velY, scale, active, count,
            colorHue, colorSat, colorLight, isPredator,
            visionRange, state, speciesId
        } = WorldData;

        // Ambush state constants for visual feedback
        const AMBUSH_STATE = 3;    // EntityState.AMBUSH
        const COOLDOWN_STATE = 4;  // EntityState.COOLDOWN
        const AMBUSHER_SPECIES_ID = 101;

        // Pre-compute time factor for tail animation
        const timeOffset = time * 10;
        
        // Padding for off-screen culling
        const cullPad = 50;

        for (let i = 0; i < count; i++) {
            if (!active[i]) continue;

            const x = posX[i];
            const y = posY[i];
            
            // Simple off-screen culling
            if (x < -cullPad || x > width + cullPad || y < -cullPad || y > height + cullPad) {
                continue;
            }
            
            let s = scale[i];

            // Calculate angle from velocity
            const angle = Math.atan2(velY[i], velX[i]);

            // Visual state adjustments for ambush predators (from s08)
            let hue = colorHue[i];
            let sat = colorSat[i];
            let light = colorLight[i];

            if (isPredator[i] && speciesId[i] === AMBUSHER_SPECIES_ID) {
                if (state[i] === AMBUSH_STATE) {
                    light = light - 25;
                    if (light < 15) light = 15;
                    sat = sat - 30;
                    if (sat < 10) sat = 10;
                    s *= 0.95;
                } else if (state[i] === COOLDOWN_STATE) {
                    light = light - 15;
                    if (light < 20) light = 20;
                }
            }

            // Get sprite from atlas
            const sprite = getSprite(hue, sat, light, isPredator[i] === 1);

            // Use setTransform instead of save/translate/rotate/scale/restore
            // setTransform(a, b, c, d, e, f) sets: [a c e; b d f; 0 0 1]
            // Equivalent to translate(x,y) * rotate(angle) * scale(s,s)
            const cosA = Math.cos(angle) * s;
            const sinA = Math.sin(angle) * s;
            ctx.setTransform(cosA, sinA, -sinA, cosA, x, y);

            // Draw Body (Static Blit) - use pre-computed offsets
            ctx.drawImage(sprite, -SPRITE_HALF_W, -SPRITE_HALF_H);

            // Draw Tail (Procedural Animation) - use cached HSL strings
            const tailWag = Math.sin(timeOffset + i * 0.3) * 0.5;

            // Manual translate + rotate for tail: compose with current transform
            // Matrix math: M_new = M_body * T(-20, 0) * R(tailWag)
            // where M_body = [cosA, sinA, -sinA, cosA, x, y] (translate+rotate+scale)
            // T(-20,0) shifts tail origin behind body, R(tailWag) adds wag rotation
            const cosTail = Math.cos(tailWag);
            const sinTail = Math.sin(tailWag);
            // Translation: apply body rotation to the (-20, 0) offset
            const tx = x + cosA * -20;
            const ty = y + sinA * -20;
            // Rotation composition: multiply 2x2 rotation sub-matrices
            const a2 = cosA * cosTail + (-sinA) * sinTail;
            const b2 = sinA * cosTail + cosA * sinTail;
            const c2 = cosA * (-sinTail) + (-sinA) * cosTail;
            const d2 = sinA * (-sinTail) + cosA * cosTail;
            ctx.setTransform(a2, b2, c2, d2, tx, ty);

            ctx.fillStyle = getHSL(colorHue[i] | 0, colorSat[i] | 0, colorLight[i] | 0);

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-15, -8);
            ctx.lineTo(-15, 8);
            ctx.closePath();
            ctx.fill();

            // Debug: vision cone and state
            if (debugMode) {
                ctx.setTransform(cosA, sinA, -sinA, cosA, x, y);

                const vision = visionRange[i] * 50;

                // Color based on state
                if (isPredator[i]) {
                    ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
                } else if (state[i] === 1) { // FLEE
                    ctx.strokeStyle = 'rgba(255, 255, 100, 0.4)';
                } else {
                    ctx.strokeStyle = 'rgba(100, 200, 255, 0.2)';
                }

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, vision, -0.5, 0.5);
                ctx.closePath();
                ctx.stroke();
            }
        }

        // Reset transform to identity after batch rendering
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    },

    /**
     * Clear the sprite atlas (call when regenerating world)
     */
    clearAtlas: () => {
        Atlas.clear();
    },

    /**
     * Get atlas stats
     * @returns {{size: number}}
     */
    getAtlasStats: () => {
        return { size: Atlas.size };
    }
};

/**
 * Legacy-compatible draw function for individual fish objects
 * Used during transition period for backward compatibility
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} fish
 * @param {boolean} debug
 */
export function drawFishLegacy(ctx, fish, debug = false) {
    const { pos, vel, size, color, isPredator, genome } = fish;
    const angle = Math.atan2(vel.y, vel.x);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    const bodyLength = size * 2;
    const bodyHeight = size * 0.6;

    // Body gradient
    const bodyGrad = ctx.createLinearGradient(0, -bodyHeight, 0, bodyHeight);
    bodyGrad.addColorStop(0, color.light);
    bodyGrad.addColorStop(0.5, color.main);
    bodyGrad.addColorStop(1, color.dark);

    // Body
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyLength, bodyHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    const tailOsc = Math.sin(performance.now() * 0.01 + fish.id) * 0.2;
    ctx.fillStyle = color.main;
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.8, 0);
    ctx.lineTo(-bodyLength * 1.5, -bodyHeight * 0.8 + tailOsc * size);
    ctx.lineTo(-bodyLength * 1.5, bodyHeight * 0.8 + tailOsc * size);
    ctx.closePath();
    ctx.fill();

    // Dorsal fin
    ctx.fillStyle = color.fin;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(bodyLength * 0.2, -bodyHeight * 0.3);
    ctx.lineTo(-bodyLength * 0.2, -bodyHeight * 1.2);
    ctx.lineTo(-bodyLength * 0.5, -bodyHeight * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.5, -bodyHeight * 0.2, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.55, -bodyHeight * 0.2, size * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(bodyLength * 0.2, -bodyHeight * 0.4, bodyLength * 0.3, bodyHeight * 0.15, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Debug: vision cone
    if (debug && genome) {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        ctx.strokeStyle = isPredator ? 'rgba(255, 100, 100, 0.3)' : 'rgba(100, 200, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, genome.getVisionRange() * 50, -0.5, 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }
}
