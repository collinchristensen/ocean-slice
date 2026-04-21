/**
 * Rendering helpers for Canvas 2D
 * Performance: Static layers (ocean gradient, terrain) are cached to offscreen canvases
 * and only re-rendered on resize or world regeneration.
 */

// Offscreen canvas cache for static background (ocean gradient)
let bgCache = null;
let bgCacheW = 0;
let bgCacheH = 0;

// Offscreen canvas cache for terrain
let terrainCache = null;
let terrainCacheW = 0;
let terrainCacheH = 0;
let terrainCacheDirty = true;

// Pre-computed particle alpha colors to avoid per-frame string allocation
const particleColorCache = new Map();

function getParticleColor(alpha) {
    // Quantize alpha to 2 decimal places for caching
    const key = (alpha * 100) | 0;
    if (!particleColorCache.has(key)) {
        particleColorCache.set(key, `rgba(180, 200, 220, ${(key / 100).toFixed(2)})`);
    }
    return particleColorCache.get(key);
}

/**
 * Mark terrain cache as dirty (call on regenerate/resize)
 */
export function invalidateTerrainCache() {
    terrainCacheDirty = true;
}

/**
 * Draw ocean background gradient (cached to offscreen canvas)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
export function drawOceanBackground(ctx, width, height) {
    if (!bgCache || bgCacheW !== width || bgCacheH !== height) {
        bgCache = document.createElement('canvas');
        bgCache.width = width;
        bgCache.height = height;
        bgCacheW = width;
        bgCacheH = height;
        const bctx = bgCache.getContext('2d');
        const gradient = bctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#0a1628');
        gradient.addColorStop(0.3, '#0f2847');
        gradient.addColorStop(0.7, '#1a3a5c');
        gradient.addColorStop(1, '#0d2540');
        bctx.fillStyle = gradient;
        bctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bgCache, 0, 0);
}

/**
 * Draw suspended particles (ocean matter) - optimized with color caching and fillRect for small particles
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x: number, y: number, size: number, alpha: number}>} particles
 */
export function drawParticles(ctx, particles) {
    for (const p of particles) {
        ctx.fillStyle = getParticleColor(p.alpha);
        if (p.size <= 1.5) {
            // Use fillRect for tiny particles - faster than arc path
            const d = p.size * 2;
            ctx.fillRect(p.x - p.size, p.y - p.size, d, d);
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/**
 * Draw a fish shape
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} fish
 * @param {boolean} debug
 */
export function drawFish(ctx, fish, debug = false) {
    const { pos, vel, size, color, isPredator } = fish;
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
    if (debug && fish.genome) {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        ctx.strokeStyle = isPredator ? 'rgba(255, 100, 100, 0.3)' : 'rgba(100, 200, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, fish.genome.visionRange * 50, -0.5, 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * Draw terrain heightfield (cached to offscreen canvas, re-rendered only when dirty)
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} terrain
 * @param {number} width
 * @param {number} height
 */
export function drawTerrain(ctx, terrain, width, height) {
    if (terrainCacheDirty || !terrainCache || terrainCacheW !== width || terrainCacheH !== height) {
        terrainCache = document.createElement('canvas');
        terrainCache.width = width;
        terrainCache.height = height;
        terrainCacheW = width;
        terrainCacheH = height;
        const tctx = terrainCache.getContext('2d');

        const gradient = tctx.createLinearGradient(0, height * 0.7, 0, height);
        gradient.addColorStop(0, '#2d4a3e');
        gradient.addColorStop(0.5, '#1a3328');
        gradient.addColorStop(1, '#0f1f18');

        tctx.fillStyle = gradient;
        tctx.beginPath();
        tctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 4) {
            const h = terrain.heightAt(x);
            tctx.lineTo(x, height - h);
        }

        tctx.lineTo(width, height);
        tctx.closePath();
        tctx.fill();

        // Add texture/shading
        tctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        tctx.lineWidth = 1;
        for (let x = 0; x <= width; x += 20) {
            const h = terrain.heightAt(x);
            const slope = terrain.slopeAt(x);
            if (Math.abs(slope) > 0.3) {
                tctx.beginPath();
                tctx.moveTo(x, height - h);
                tctx.lineTo(x + slope * 10, height - h + 15);
                tctx.stroke();
            }
        }

        terrainCacheDirty = false;
    }
    ctx.drawImage(terrainCache, 0, 0);
}

/**
 * Draw kelp blade - optimized to avoid per-leaf save/restore
 * Uses manual trigonometry instead of canvas transform stack
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} kelp
 */
export function drawKelp(ctx, kelp) {
    const { segments, width, color } = kelp;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(segments[0].x, segments[0].y);
    
    for (let i = 1; i < segments.length; i++) {
        ctx.lineTo(segments[i].x, segments[i].y);
    }
    ctx.stroke();
    
    // Blade leaves - drawn without save/restore using manual offset math
    ctx.fillStyle = color;
    const leafRadiusX = width * 3;
    const leafRadiusY = width;
    const leafOffset = width * 2;
    
    for (let i = 2; i < segments.length; i += 2) {
        const seg = segments[i];
        const prev = segments[i - 1];
        const angle = Math.atan2(seg.y - prev.y, seg.x - prev.x) + Math.PI / 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        
        // Right leaf
        const rx = seg.x + cosA * leafOffset;
        const ry = seg.y + sinA * leafOffset;
        ctx.beginPath();
        ctx.ellipse(rx, ry, leafRadiusX, leafRadiusY, angle, 0, Math.PI * 2);
        ctx.fill();
        
        // Left leaf
        const lx = seg.x - cosA * leafOffset;
        const ly = seg.y - sinA * leafOffset;
        ctx.beginPath();
        ctx.ellipse(lx, ly, leafRadiusX, leafRadiusY, angle, 0, Math.PI * 2);
        ctx.fill();
    }
}
