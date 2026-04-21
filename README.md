# ocean-slice

A fish simulation prototype with ECS (Entity Component System) and boids. Watch fish swim, flock, and hunt in a simple ocean environment.

## Screenshot

<img width="1280" height="720" alt="image" src="https://github.com/user-attachments/assets/66e5e36d-df66-4d83-a0e9-0eefdcf7a1fd" />

## Running the Simulation

The simulation is a pure browser app (HTML + ES modules).

The easiest way to serve it is with Python's built-in HTTP server.

### Quick Start

```bash
# Navigate to the ocean-slice folder
cd ocean-slice

# Python 3 (recommended)
python3 -m http.server 8080

# Python 2 (legacy)
python -m SimpleHTTPServer 8080
```

Then open your browser to **http://localhost:8080** and the simulation starts immediately.

---

## What's in This Repo

```
ocean-slice/
├── index.html          # Entry point — open this in a browser after serving
└── src/
    ├── main.js         # Bootstraps the ECS world, game loop, and UI
    ├── engine/
    │   ├── ecs.js          # Entity Component System core (Structure-of-Arrays)
    │   ├── fishRenderer.js # Batched sprite rendering with procedural texture atlas
    │   ├── loop.js         # Fixed-timestep game loop with interpolated rendering
    │   ├── math.js         # Vector/math utilities
    │   ├── render.js       # Ocean background, terrain, kelp, and particle drawing
    │   ├── spatial.js      # Spatial hash for broad-phase neighbour queries
    │   └── spatialECS.js   # ECS-aware spatial hash integration
    └── sim/
        ├── behavior.js     # Boid rules (separation, alignment, cohesion) + predator AI
        ├── fish.js         # Fish entity definitions and spawn helpers
        ├── kelp.js         # Procedural kelp generation
        ├── terrain.js      # Procedural seabed terrain generation
        ├── world.js        # Legacy world helpers (kept for reference)
        └── worldECS.js     # Main simulation world: ECS lifecycle, physics, evolution
    └── ui/
        └── controller.js   # UI panel wiring (sliders, toggles, live stats)
```

### Architecture Highlights

| Concept | Detail |
|---|---|
| **ECS + SoA** | Flat `TypedArray` buffers for fish position, velocity, and genetics — maximises CPU cache locality and eliminates garbage collection pauses. |
| **Boid flocking** | Separation, alignment, and cohesion weights are tunable in real time via the UI panel. |
| **Predator-prey evolution** | Fish mutate, driving emergent evolution over time. |
| **Procedural world** | Seabed terrain, kelp beds, and ambient particles are generated. |
| **Fixed timestep loop** | Physics runs at deterministic 60 Hz tick; rendering interpolates for smooth visuals. |
| **Spatial hashing** | O(1) average neighbour lookup |

### UI Controls

| Control | Description |
|---|---|
| **Seed / Regen** | Set a world seed and regenerate the terrain and fish population. |
| **Separation / Alignment / Cohesion** | Tune the three boid weights live. |
| **Sim Speed** | Scale the simulation tick rate (0.1× – 3×). |
| **Mutation Rate** | How much offspring traits deviate from parents (0 – 0.5). |
| **Fish Scale** | Visual size multiplier for all fish. |
| **Debug / FPS / Low-Q** | Toggle debug overlays, FPS counter, and a low-quality rendering mode. |
| **Stats panel** | Live readout of FPS, average FPS, prey/predator counts, average speed, and average vision range. |

---

## Requirements

- A modern browser with ES module support (Chrome, Firefox, Edge, Safari — all current versions).
- Python 3.x (or Python 2.7) on your machine to run the HTTP server.
