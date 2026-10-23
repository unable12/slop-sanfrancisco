(function () {
// js/terrain-mesh.js
// The ground surface: the baked height field (js/terrain.js) as a CPU-built mesh with world y in its vertices (no
// displacement shader, so culling and shadows see the real shape; PLAN.md D4).
// - 64 m chunks, each at its own level of detail by camera distance: 2, 4, 8 or 16 m between vertices, with skirts
//   hanging below their edges to hide the cracks between neighbours at different levels.
// - Chunks are drawn per TILE x TILE m tile: one mesh (one draw) per tile, rebuilt when a chunk in it changes level.
// - The bay: vertices on water drop below the water plane, so the land's edge becomes a steep seawall face.
// - Hills cast shadows through a static 8 m stand-in on the shadow proxy layer (scene-culling.js), drawn back faces
//   only so sunlit slopes don't shadow themselves while the slopes facing away still shade what lies behind them.
// - Material: createTerrainMaterial (asphalt, concrete, lawn, rock, seawall by the ground mask).

const { THREE, Terrain } = window.NYC;
const { createTerrainMaterial } = window.NYC;

const CHUNK = 64;
const TILE = 512;
const LOD_STEPS = [2, 4, 8, 16]; // metres between vertices
const LOD_DIST = [150, 400, 900]; // switch to the next level beyond these distances (m)
const HYSTERESIS = 0.1; // a chunk moves back to the finer level only 10% inside its threshold
const UPDATE_SECONDS = 0.25;
const UPDATE_MOVE = 20;
const WATER_DROP = 4; // metres below the water level for vertices on the bay
const SHADOW_STEP = 8;
const SHADOW_CELL = 500;

function buildTerrainMesh(scene) {
  const T = Terrain;
  const water = T.waterLevel;
  const extentX = (T.w - 1) * T.cell;
  const extentZ = (T.h - 1) * T.cell;
  const nx = Math.ceil(extentX / CHUNK);
  const nz = Math.ceil(extentZ / CHUNK);
  const perTile = TILE / CHUNK;
  const tilesX = Math.ceil(nx / perTile);
  const tilesZ = Math.ceil(nz / perTile);

  // Height of the mesh at a grid point (metres from the data origin, clamped to the data): land as measured, the bay
  // dropped below its surface
  // dropped under a tunnel's floor at its portals too (grade-separation.js carveAt, once it is built: rebuild())
  const surfaceY = (lx, lz) => {
    const i = Math.min(T.w - 1, Math.round(Math.min(lx, extentX) / T.cell));
    const j = Math.min(T.h - 1, Math.round(Math.min(lz, extentZ) / T.cell));
    const y = T.heights[j * T.w + i];
    const G = window.NYC.GradeSeparation;
    const carved = G && G.carveAt(T.originX + i * T.cell, T.originZ + j * T.cell);
    if (carved !== null && carved !== undefined) return Math.min(y, carved);
    return y > water + 0.05 ? y : water - WATER_DROP;
  };

  // Chunk summaries: height range (for distances & culling) and whether any of it is land
  const chunks = [];
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      let lo = Infinity, hi = -Infinity, land = false;
      for (let lz = cz * CHUNK; lz <= (cz + 1) * CHUNK; lz += T.cell) {
        for (let lx = cx * CHUNK; lx <= (cx + 1) * CHUNK; lx += T.cell) {
          const y = surfaceY(lx, lz);
          if (y > water) land = true;
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      }
      chunks.push({ cx, cz, lo, hi, land, lod: LOD_STEPS.length - 1 });
    }
  }

  const material = createTerrainMaterial(makeMaskTexture(), window.NYC.DATA.groundMask.header);
  if (window.NYC.DATA.fullRegion) {
    // A 50 m dither transition reveals the regional ground underneath without alpha blending or double interiors.
    const { positionWorld, min, clamp, floor, sin, fract, step } = window.NYC.TSL;
    const distance = min(min(positionWorld.x.sub(T.originX), positionWorld.x.negate().add(T.originX + extentX)),
      min(positionWorld.z.sub(T.originZ), positionWorld.z.negate().add(T.originZ + extentZ)));
    const noise = fract(sin(floor(positionWorld.x.mul(2)).mul(12.9898).add(floor(positionWorld.z.mul(2)).mul(78.233))).mul(43758.5453));
    material.opacityNode = step(noise, clamp(distance.div(50), 0, 1));
    material.alphaTest = 0.5;
  }
  const group = new THREE.Group();
  group.name = 'SFTerrain';

  // Writes one chunk at its level into the arrays: (n + 1)^2 grid vertices, then a skirt along each edge
  function writeChunk(c, pos, nrm, idx) {
    const step = LOD_STEPS[c.lod];
    const n = CHUNK / step;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const base = pos.length / 3;
    const skirt = Math.max(2, step / 2);
    const yAt = (a, b) => surfaceY(x0 + a * step, z0 + b * step);
    for (let b = 0; b <= n; b++) {
      for (let a = 0; a <= n; a++) {
        const y = yAt(a, b);
        pos.push(T.originX + x0 + a * step, y, T.originZ + z0 + b * step);
        // central differences at this level's spacing (one-sided at the data's edges)
        const gx = (surfaceY(x0 + (a + 1) * step, z0 + b * step) - surfaceY(Math.max(0, x0 + (a - 1) * step), z0 + b * step)) / (2 * step);
        const gz = (surfaceY(x0 + a * step, z0 + (b + 1) * step) - surfaceY(x0 + a * step, Math.max(0, z0 + (b - 1) * step))) / (2 * step);
        const len = Math.hypot(gx, 1, gz);
        nrm.push(-gx / len, 1 / len, -gz / len);
      }
    }
    const row = n + 1;
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const k = base + b * row + a;
        idx.push(k, k + row, k + 1, k + 1, k + row, k + row + 1);
      }
    }
    // skirts: a copy of each edge hanging `skirt` m lower, joined to the edge facing outwards
    const edges = [
      { at: (t) => t, flip: false }, // north edge (b = 0), a = t
      { at: (t) => n * row + t, flip: true }, // south edge
      { at: (t) => t * row, flip: true }, // west edge
      { at: (t) => t * row + n, flip: false } // east edge
    ];
    for (const e of edges) {
      const s0 = pos.length / 3;
      for (let t = 0; t <= n; t++) {
        const k = base + e.at(t);
        pos.push(pos[3 * k], pos[3 * k + 1] - skirt, pos[3 * k + 2]);
        nrm.push(nrm[3 * k], nrm[3 * k + 1], nrm[3 * k + 2]);
      }
      for (let t = 0; t < n; t++) {
        const top0 = base + e.at(t), top1 = base + e.at(t + 1), bot0 = s0 + t, bot1 = s0 + t + 1;
        if (e.flip) idx.push(top0, bot0, top1, top1, bot0, bot1);
        else idx.push(top0, top1, bot0, top1, bot1, bot0);
      }
    }
  }

  const tiles = [];
  for (let tz = 0; tz < tilesZ; tz++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const members = chunks.filter((c) => c.land && Math.floor(c.cx / perTile) === tx && Math.floor(c.cz / perTile) === tz);
      if (!members.length) continue;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.name = 'TerrainTile';
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      if (tiles.length) mesh.userData.sharesPipelineWith = tiles[0].mesh;
      group.add(mesh);
      tiles.push({ mesh, members, key: '' });
    }
  }

  function rebuildTile(tile) {
    const key = tile.members.map((c) => c.lod).join('');
    if (key === tile.key) return false;
    tile.key = key;
    const pos = [];
    const nrm = [];
    const idx = [];
    for (const c of tile.members) writeChunk(c, pos, nrm, idx);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    tile.mesh.geometry.dispose();
    tile.mesh.geometry = g;
    return true;
  }

  // Level of each chunk from the camera's distance to it (with hysteresis)
  function chooseLevels(px, py, pz) {
    for (const c of chunks) {
      if (!c.land) continue;
      const x0 = T.originX + c.cx * CHUNK, z0 = T.originZ + c.cz * CHUNK;
      const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK));
      const dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK));
      const dy = Math.max(c.lo - py, 0, py - c.hi);
      const d = Math.hypot(dx, dy, dz);
      let lod = 0;
      while (lod < LOD_DIST.length && d > LOD_DIST[lod]) lod++;
      // stay finer while within the hysteresis band of the threshold just crossed outwards
      if (lod > c.lod && d < LOD_DIST[lod - 1] * (1 + HYSTERESIS)) lod = c.lod;
      c.lod = lod;
    }
  }

  const last = { x: Infinity, y: Infinity, z: Infinity, t: -Infinity, rebuilt: 0 };
  function update(cameraPosition, elapsed) {
    const { x, y, z } = cameraPosition;
    if (elapsed - last.t < UPDATE_SECONDS) return;
    if (Math.hypot(x - last.x, y - last.y, z - last.z) < UPDATE_MOVE) return;
    last.x = x; last.y = y; last.z = z; last.t = elapsed;
    chooseLevels(x, y, z);
    for (const tile of tiles) if (rebuildTile(tile)) last.rebuilt++;
  }

  // Start at the coarsest level everywhere (a first update() refines around the camera)
  for (const tile of tiles) rebuildTile(tile);

  group.add(...buildShadowCaster(surfaceY, extentX, extentZ));
  scene.add(group);
  console.info(`[terrain] ${chunks.filter((c) => c.land).length} land chunks of ${CHUNK} m in ${tiles.length} tiles`);
  // Every tile built again at its current levels (after grade-separation.js has carved the portals)
  function rebuild() {
    for (const tile of tiles) {
      tile.key = '';
      rebuildTile(tile);
    }
  }

  return {
    group,
    update,
    rebuild,
    stats: () => ({
      tiles: tiles.length,
      visibleTiles: tiles.filter((t) => t.mesh.visible).length,
      triangles: tiles.reduce((s, t) => s + t.mesh.geometry.index.count / 3, 0),
      lods: LOD_STEPS.map((_, l) => chunks.filter((c) => c.land && c.lod === l).length),
      rebuilt: last.rebuilt
    })
  };
}

// The ground mask as a single-channel texture, read texel by texel
function makeMaskTexture() {
  const { header, mask } = window.NYC.DATA.groundMask;
  const tex = new THREE.DataTexture(mask, header.w, header.h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// Hills' shadows: the surface at SHADOW_STEP m, cut into SHADOW_CELL m cells on the shadow proxy layer
function buildShadowCaster(surfaceY, extentX, extentZ) {
  const T = Terrain;
  const material = new THREE.MeshBasicNodeMaterial({ color: 0x000000, side: THREE.FrontSide });
  material.shadowSide = THREE.BackSide;
  material.name = 'ShadowProxy';
  const meshes = [];
  for (let z0 = 0; z0 < extentZ; z0 += SHADOW_CELL) {
    for (let x0 = 0; x0 < extentX; x0 += SHADOW_CELL) {
      const nxs = Math.ceil(Math.min(SHADOW_CELL, extentX - x0) / SHADOW_STEP);
      const nzs = Math.ceil(Math.min(SHADOW_CELL, extentZ - z0) / SHADOW_STEP);
      const pos = [];
      const idx = [];
      for (let b = 0; b <= nzs; b++) {
        for (let a = 0; a <= nxs; a++) {
          const lx = Math.min(extentX, x0 + a * SHADOW_STEP), lz = Math.min(extentZ, z0 + b * SHADOW_STEP);
          pos.push(T.originX + lx, surfaceY(lx, lz), T.originZ + lz);
        }
      }
      for (let b = 0; b < nzs; b++) {
        for (let a = 0; a < nxs; a++) {
          const k = b * (nxs + 1) + a;
          idx.push(k, k + nxs + 1, k + 1, k + 1, k + nxs + 1, k + nxs + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.name = 'ShadowProxy';
      mesh.layers.set(window.NYC.SHADOW_PROXY_LAYER);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData.shadowProxy = true;
      if (meshes.length) mesh.userData.sharesPipelineWith = meshes[0];
      meshes.push(mesh);
    }
  }
  return meshes;
}

Object.assign(window.NYC, { buildTerrainMesh });
})();
