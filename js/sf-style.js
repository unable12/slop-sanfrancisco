(function () {
// js/sf-style.js
// San Francisco's building paint (P4.2): palette sets by neighbourhood (data/buildings-<box>.bin `palette`, chosen in
// tools/building-rules.json), a wall colour per building from a hash, white / cream trim on most and a contrasting trim
// on the rest; the wall surface (brick, stucco, painted wood siding, stone / concrete panels) and the share of windows
// lit at night by building type. These are style choices, not data: no dataset records facade colours.
// Read by buildings.js (buildSFMasses) and sf-buildings.js; colours go to the facade boxes' `paint` attributes, so the
// materials stay shared (tsl-materials.js createPreWarBuildingMaterial `paint`).

const SURFACE = { brick: 0, stucco: 1, siding: 2, panel: 3 };

// walls, contrasting trims (index = header.palettes)
const PALETTES = [
  { // victorian: painted pastels (Russian Hill, Pacific Heights, Western Addition, the Mission)
    walls: [0xe8d9b5, 0xc9d8c5, 0xb7cbd9, 0xe6c3a5, 0xd9c7d8, 0xf0e3a0, 0x9fb7a3, 0xe9e4da, 0xb9c0c7, 0xd7e0e6, 0xe9cfc4],
    trims: [0x6b4f3a, 0x3d5a6b, 0x8a3b32, 0x4f6a4c, 0x55506a]
  },
  { // north-beach: warm Italianate (North Beach, Telegraph Hill, the northern waterfront)
    walls: [0xe7d3a8, 0xd8b48a, 0xc98f6e, 0xf0e1c0, 0xe2c97f, 0xcdb9a0, 0xe9e4da, 0xd6c2b0],
    trims: [0x7a4a32, 0x5c5a48, 0x8a3b32]
  },
  { // chinatown: cream and tan walls, red / green / gold trim
    walls: [0xe6d5b8, 0xc9a77c, 0xb24a3b, 0x7f9a82, 0xe2c26a, 0xd9d2c5, 0x9a7e66, 0xd8c3a0],
    trims: [0xb8322a, 0x2f6b4f, 0xc9a23c, 0x8a2a24]
  },
  { // downtown: limestone, buff and red brick, glazed terracotta, granite
    walls: [0xd8cdb8, 0xc4b59a, 0xa45a45, 0xe2dbcc, 0xb7aea0, 0x9c8a74, 0xcfc2a8],
    trims: [0x9e937f, 0x6f665a, 0xb7ab94]
  },
  { // soma: brick, concrete, painted warehouse walls
    walls: [0x8f4a3a, 0xa45a45, 0xa8a49c, 0xd9d4c8, 0x6f7a80, 0xb88a5a, 0x7c5446, 0xc7c0b2],
    trims: [0x3e3a36, 0x6f665a, 0xe8e2d4]
  }
];
const LIGHT_TRIMS = [0xf4f1ea, 0xefe6cf, 0xe8e4dc];

// by type (header.types): wall surfaces [surface, share], night lit-window share, contrasting-trim share
const BY_TYPE = {
  shed: { surfaces: [[SURFACE.stucco, 1]], lit: 0.05, contrast: 0.2 },
  rowhouse: { surfaces: [[SURFACE.siding, 0.6], [SURFACE.stucco, 0.4]], lit: 0.45, contrast: 0.35 },
  flats: { surfaces: [[SURFACE.siding, 0.5], [SURFACE.stucco, 0.5]], lit: 0.45, contrast: 0.3 },
  apartment: { surfaces: [[SURFACE.stucco, 0.65], [SURFACE.brick, 0.35]], lit: 0.5, contrast: 0.2 },
  'office-low': { surfaces: [[SURFACE.brick, 0.45], [SURFACE.stucco, 0.35], [SURFACE.panel, 0.2]], lit: 0.3, contrast: 0.2 },
  warehouse: { surfaces: [[SURFACE.brick, 0.6], [SURFACE.panel, 0.4]], lit: 0.15, contrast: 0.1 },
  midrise: { surfaces: [[SURFACE.brick, 0.35], [SURFACE.panel, 0.35], [SURFACE.stucco, 0.3]], lit: 0.4, contrast: 0.1 },
  tower: { surfaces: [[SURFACE.panel, 1]], lit: 0.5, contrast: 0 },
  civic: { surfaces: [[SURFACE.panel, 1]], lit: 0.2, contrast: 0 },
  landmark: { surfaces: [[SURFACE.panel, 1]], lit: 0.3, contrast: 0 }
};

function pick(list, h) {
  let t = 0;
  for (const [v, w] of list) if (h < (t += w)) return v;
  return list[list.length - 1][0];
}

// [wallHex, trimHex, surface, litShare] for a building of `type` (name) in palette set `palette`; h1..h3 in [0, 1)
function sfPaint(type, palette, h1, h2, h3) {
  const pal = PALETTES[palette] || PALETTES[0];
  const t = BY_TYPE[type] || BY_TYPE.apartment;
  const wall = pal.walls[Math.floor(h1 * pal.walls.length) % pal.walls.length];
  const trim = h2 < t.contrast ? pal.trims[Math.floor((h2 / Math.max(t.contrast, 1e-6)) * pal.trims.length) % pal.trims.length] : LIGHT_TRIMS[Math.floor(h2 * 3) % 3];
  return [wall, trim, pick(t.surfaces, h3), t.lit];
}

window.NYC.SFStyle = { PALETTES, LIGHT_TRIMS, BY_TYPE, SURFACE, sfPaint };
})();
