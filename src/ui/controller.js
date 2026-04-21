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
        this.statEls = {
            fps: document.getElementById('fps-stat'),
            avgFps: document.getElementById('avgfps-stat'),
            prey: document.getElementById('prey-stat'),
            predators: document.getElementById('pred-stat'),
            avgSpeed: document.getElementById('avgspeed-stat'),
            avgVision: document.getElementById('avgvision-stat')
        };
        
        this._bindControls();
        this._toggleFpsStats(this.showFps);
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
            this._toggleFpsStats(active);
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
     * @param {HTMLElement | null} el
     * @param {string | number} value
     */
    _setText(el, value) {
        if (el) {
            el.textContent = value;
        }
    }

    /**
     * @param {boolean} visible
     */
    _toggleFpsStats(visible) {
        const rows = [this.statEls.fps, this.statEls.avgFps];
        for (const el of rows) {
            if (el?.parentElement) {
                el.parentElement.hidden = !visible;
            }
        }
    }

    /**
     * Update stats display
     */
    updateStats() {
        const counts = this.world.getCounts();
        const traits = this.world.getAverageTraits();
        
        this._setText(this.statEls.fps, this.loop.fps);
        this._setText(this.statEls.avgFps, this.loop.avgFps);
        this._setText(this.statEls.prey, counts.prey);
        this._setText(this.statEls.predators, counts.predators);
        this._setText(this.statEls.avgSpeed, traits.speed);
        this._setText(this.statEls.avgVision, traits.vision);
    }
}
