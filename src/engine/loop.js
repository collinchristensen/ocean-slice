/**
 * Fixed timestep game loop with interpolation
 * Handles update/render cycle and timing
 */
export class GameLoop {
    /**
     * @param {Object} options
     * @param {function(number): void} options.update - Called with fixed dt
     * @param {function(number): void} options.render - Called with interpolation alpha
     * @param {number} [options.fixedDt=1/60] - Fixed timestep in seconds
     */
    constructor({ update, render, fixedDt = 1 / 60 }) {
        this.update = update;
        this.render = render;
        this.fixedDt = fixedDt;
        this.accumulator = 0;
        this.lastTime = 0;
        this.running = false;
        this.simSpeed = 1.0;
        
        // FPS tracking
        this.frameCount = 0;
        this.fpsTime = 0;
        this.fps = 60;
        
        // Average FPS tracking (5-second window)
        this.avgFpsFrameCount = 0;
        this.avgFpsTime = 0;
        this.avgFps = 60;
        
        this._loop = this._loop.bind(this);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this._loop);
    }

    stop() {
        this.running = false;
    }

    /** @param {number} speed */
    setSimSpeed(speed) {
        this.simSpeed = speed;
    }

    /** @param {number} timestamp */
    _loop(timestamp) {
        if (!this.running) return;

        // Calculate delta time in seconds
        let dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Clamp dt to prevent spiral of death
        if (dt > 0.25) dt = 0.25;

        // Apply simulation speed
        dt *= this.simSpeed;

        // FPS calculation
        this.frameCount++;
        this.fpsTime += dt / this.simSpeed; // Use real time for FPS
        if (this.fpsTime >= 1.0) {
            this.fps = Math.round(this.frameCount / this.fpsTime);
            this.frameCount = 0;
            this.fpsTime = 0;
        }

        // Average FPS calculation (5-second window)
        this.avgFpsFrameCount++;
        this.avgFpsTime += dt / this.simSpeed; // Use real time for FPS
        if (this.avgFpsTime >= 5.0) {
            this.avgFps = Math.round(this.avgFpsFrameCount / this.avgFpsTime);
            this.avgFpsFrameCount = 0;
            this.avgFpsTime = 0;
        }

        // Fixed timestep update
        this.accumulator += dt;
        while (this.accumulator >= this.fixedDt) {
            this.update(this.fixedDt);
            this.accumulator -= this.fixedDt;
        }

        // Render with interpolation factor
        const alpha = this.accumulator / this.fixedDt;
        this.render(alpha);

        requestAnimationFrame(this._loop);
    }
}
