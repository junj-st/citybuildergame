# tinyopolis

A relaxing, resource-free voxel city-builder sandbox that runs in the browser (Three.js + Vite).

## Run

```bash
npm install
npm run dev      # opens http://localhost:5173
```

## Controls

| Action | Input |
| --- | --- |
| Select an area | Left-drag on any surface (ground, roofs, walls) |
| Extrude / dig | Drag the orange arrow, or press `E` / `Q` |
| Block style | `1`–`6` (Concrete, Glass, Brick, Modern, Steel, Classic) |
| Tools | `B` build · `P` paint · `T` details · `G` ground · `X` erase |
| Rotate / pan / zoom | Right-drag · Shift+right-drag or middle-drag · scroll (or hold Space + left-drag to rotate) |
| Move camera | `WASD` / arrow keys |
| Walk the streets | `V` (Esc to return) |
| Undo / redo | `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` |
| Hide UI / screenshot | `H` / `K` |

The settings panel (top right) controls time of day, clouds, fog, rain, tilt-shift miniature,
depth of field, bloom and colour filters. The city autosaves to localStorage; use Save/Load file for JSON exports.
