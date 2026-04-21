/**
 * UI Controller - binds DOM elements to simulation config
 */
export class UIController {
    /**
     * @param {Object} world
     * @param {Object} loop
     */
    constructor(world, loop) {
        this.world = world;
        this.loop = loop;
        
        this.debugMode = false;
        this.showFps = true;
        this.lowQuality = false;
        
        this._bindControls();
    }

    _bindControls() {
        // Seed and regenerate
        const seedInput = document.getElementById('seed-input');
        const regenBtn = document.getElementById('regen-btn');
        
        regenBtn.addEventListener('click', () => {
            this.world.regenerate(seedInput.value);
        });
        
        // Boid weights
        this._bindSlider('sep-weight', 'sep-val', (val) => {
            this.world.config.separationWeight = val;
        });
        
        this._bindSlider('ali-weight', 'ali-val', (val) => {
            this.world.config.alignmentWeight = val;
        });
        
        this._bindSlider('coh-weight', 'coh-val', (val) => {
            this.world.config.cohesionWeight = val;
        });
        
        // Simulation controls
        this._bindSlider('sim-speed', 'speed-val', (val) => {
            this.loop.setSimSpeed(val);
        });
        
        this._bindSlider('mutation-rate', 'mut-val', (val) => {
            this.world.config.mutationRate = val;
        }, 2);
        
        this._bindSlider('fish-scale', 'scale-val', (val) => {
            this.world.fishScale = val;
            // Note: Requires clicking "Regen" to apply new scale
        });
        
        // Toggles
        this._bindToggle('debug-toggle', (active) => {
            this.debugMode = active;
        });
        
        this._bindToggle('fps-toggle', (active) => {
            this.showFps = active;
        }, true);
        
        this._bindToggle('lowq-toggle', (active) => {
            this.lowQuality = active;
            this.world.lowQuality = active;
        });
    }

    /**
     * @param {string} sliderId
     * @param {string} displayId
     * @param {function(number): void} callback
     * @param {number} [decimals=1]
     */
    _bindSlider(sliderId, displayId, callback, decimals = 1) {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(displayId);
        
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            display.textContent = val.toFixed(decimals);
            callback(val);
        });
    }

    /**
     * @param {string} btnId
     * @param {function(boolean): void} callback
     * @param {boolean} [initialActive=false]
     */
    _bindToggle(btnId, callback, initialActive = false) {
        const btn = document.getElementById(btnId);
        let active = initialActive;
        
        if (active) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', () => {
            active = !active;
            btn.classList.toggle('active', active);
            callback(active);
        });
    }

    /**
     * Update stats display
     */
    updateStats() {
        const counts = this.world.getCounts();
        const traits = this.world.getAverageTraits();
        
        document.getElementById('fps-stat').textContent = this.loop.fps;
        document.getElementById('avgfps-stat').textContent = this.loop.avgFps;
        document.getElementById('prey-stat').textContent = counts.prey;
        document.getElementById('pred-stat').textContent = counts.predators;
        document.getElementById('birth-stat').textContent = this.world.stats.birthsPerMinute;
        document.getElementById('death-stat').textContent = this.world.stats.deathsPerMinute;
        document.getElementById('avgspeed-stat').textContent = traits.speed;
        document.getElementById('avgvision-stat').textContent = traits.vision;
    }
}
