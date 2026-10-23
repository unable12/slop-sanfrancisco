(function () {
// js/landmarks.js
// San Francisco's landmarks (phase 5): models built from primitives on their real sites. A site is an OpenStreetMap
// outline (GEO.landmarks via LANDMARK_SITES, tools/geo-landmarks.mjs) with `base`, the lowest DEM ground under it, and
// `topH`, its OSM height. Every model is built in metres around a local origin on its site (y = 0 at the base, +x along
// the outline's long axis unless a model says otherwise) and placed by fitToSite; facts, sources and what is simplified
// are in docs/landmarks/<slug>.md. Where OSM draws the structure part by part (Sutro Tower), the parts are extruded as
// drawn. Outside the core the sites stand on the interim region ground (sf-ground.js, PLAN P5-1).
// Exports: buildLandmarks(scene) -> { group, colliders }, window.NYC.landmarkCovers(x, z) (the generated building masses
// under a model are left out, buildings.js) and window.NYC.landmarkStats (triangles and draws per landmark).

const { THREE, LANDMARK_SITES } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { createPreWarBuildingMaterial, createCurtainWallMaterial } = window.NYC;

const UP = new THREE.Vector3(0, 1, 0);

// Geometry gathered per material and merged into one mesh each (a landmark costs one draw per material)
function createParts() {
  const byMat = new Map();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const P = {
    // a geometry (cloned, non-indexed) under matrix m; `paint` [wall rgb + surface, trim rgb + lit share] for the
    // paint-mode facade materials (tsl-materials.js createPreWarBuildingMaterial({ paint: true }))
    add(mat, geo, m = null, paint = null) {
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (m) g.applyMatrix4(m);
      if (mat.userData.paint) {
        const [wall, trim] = paint || mat.userData.paint;
        const n = g.attributes.position.count;
        const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { a.set(wall, i * 4); b.set(trim, i * 4); }
        g.setAttribute('paintWall', new THREE.Float32BufferAttribute(a, 4));
        g.setAttribute('paintTrim', new THREE.Float32BufferAttribute(b, 4));
      }
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(g);
      return P;
    },
    // matrix: translate (x, y, z), turn ry about y (then rx, rz), scale (sx, sy, sz)
    at(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
      _e.set(rx, ry, rz, 'YXZ');
      return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
    },
    // a box standing on y (w along x, d along z), turned ry
    box(mat, x, y, z, w, h, d, ry = 0, paint = null) {
      return P.add(mat, UNIT_BOX, P.at(x, y + h / 2, z, ry, w, h, d), paint);
    },
    // a frustum standing on y (radii at the bottom and the top), n sides
    cyl(mat, x, y, z, rBottom, rTop, h, n = 24, ry = 0, open = false, paint = null) {
      return P.add(mat, new THREE.CylinderGeometry(rTop, rBottom, h, n, 1, open), P.at(x, y + h / 2, z, ry), paint);
    },
    // a lathe of [r, y] points about the vertical through (x, z), from y
    lathe(mat, pts, x, y, z, n = 32, paint = null) {
      return P.add(mat, new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(Math.max(0, r), yy)), n), P.at(x, y, z), paint);
    },
    // a vertical prism over a local outline [[x, z], ...] (holes: more outlines) from y0 to y1
    prism(mat, outline, y0, y1, holes = [], paint = null) {
      const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); };
      if (outline.length < 3 || area(outline) < 0.01) return P;
      const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const h of holes) if (h.length >= 3 && area(h) > 0.25) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
      let g;
      try {
        g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
      } catch (e) {
        // a hole the triangulator can't place (OSM rings touching): drawn without its holes
        shape.holes.length = 0;
        g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
      }
      g.rotateX(-Math.PI / 2);
      g.translate(0, y0, 0);
      return P.add(mat, g, null, paint);
    },
    // a member from p0 to p1 ([x, y, z]), a thick (up-ish) by b wide
    beam(mat, p0, p1, a, b = a) {
      X.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const len = X.length();
      if (len < 1e-4) return P;
      X.multiplyScalar(1 / len);
      Z.crossVectors(X, Math.abs(X.y) > 0.95 ? _p.set(1, 0, 0) : UP).normalize();
      Y.crossVectors(Z, X);
      _m.makeBasis(X.multiplyScalar(len), Y.multiplyScalar(a), Z.multiplyScalar(b));
      _m.setPosition((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
      return P.add(mat, UNIT_BOX, _m);
    },
    // one mesh per material under `parent`; returns { tris, draws }
    build(parent, name, { shadow = true } = {}) {
      let tris = 0, draws = 0;
      for (const [mat, geos] of byMat) {
        const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = name;
        mesh.castShadow = shadow && !mat.userData.noShadow;
        mesh.receiveShadow = true;
        parent.add(mesh);
        tris += geo.attributes.position.count / 3;
        draws++;
      }
      byMat.clear();
      return { tris, draws };
    }
  };
  return P;
}
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// The minimum-area rectangle of a flat outline [x0, z0, x1, z1, ...]: centre, length along `ang` (rad from +x towards
// +z), width (tools/geo-extra.mjs orientedBox)
function orientedBox(flat) {
  const ring = [];
  for (let i = 0; i + 1 < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1) continue;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ring) {
      const a = x * ux + z * uz, b = -x * uz + z * ux;
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, ux, uz, a0, a1, b0, b1 };
  }
  const { ux, uz, a0, a1, b0, b1 } = best;
  const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
  let len = a1 - a0, wid = b1 - b0, ang = Math.atan2(uz, ux);
  if (wid > len) { [len, wid] = [wid, len]; ang += Math.PI / 2; }
  return { cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, len, wid, ang };
}
function pointInFlatRing(flat, x, z) {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1], xj = flat[j], zj = flat[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function buildLandmarks(scene) {
  const group = new THREE.Group();
  group.name = 'SFLandmarks';
  const colliders = [];
  const covers = [];
  const stats = [];
  const T = window.NYC.Terrain;
  const water = T ? T.waterLevel : 0;

  // ---------------------------------------------------------------------------------------------------------------
  // Materials (shared across landmarks: one pipeline each)
  // ---------------------------------------------------------------------------------------------------------------
  const std = (color, roughness = 0.7, metalness = 0.05, extra = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness, metalness, ...extra });
  const hex = (c) => new THREE.Color(c);
  const rgb = (c) => { const k = hex(c); return [k.r, k.g, k.b]; };
  // paint-mode masonry (windows, panel joints and night lights by world position): userData.paint is the default
  // [wall rgb + surface (3 stone/concrete panels, 1 stucco), trim rgb + lit-window share]
  // (a seed of its own keeps it apart from the buildings' cached paint material)
  let paintSeed = 501;
  const paintMat = (wall, trim, surface = 3, lit = 0.35, opts = {}) => {
    const m = createPreWarBuildingMaterial({ paint: true, seed: paintSeed++, ...opts });
    m.userData.paint = [[...rgb(wall), surface], [...rgb(trim), lit]];
    return m;
  };
  const mats = {
    orange: std(0xbf4e3b, 0.62, 0.25), // OSM building:colour of the Golden Gate and Sutro Tower red
    white: std(0xe9e9df, 0.55, 0.25), // OSM building:colour of Sutro Tower's white
    steelGrey: std(0x8e959c, 0.55, 0.55),
    concrete: std(0xb9b5ab, 0.85, 0.0),
    stoneLight: std(0xe2ddd1, 0.72, 0.02),
    stoneWarm: std(0xd9cdb4, 0.75, 0.02),
    copperGreen: std(0x5d8f7c, 0.55, 0.3),
    gold: std(0xc9a24a, 0.35, 0.85),
    glassDark: std(0x2a3a48, 0.12, 0.85),
    roofDark: std(0x3b3f44, 0.8, 0.1),
    grass: std(0x5d7f45, 0.95, 0.0),
    dirt: std(0x8a7a5c, 0.95, 0.0),
    redTile: std(0x9a4a35, 0.8, 0.0),
    lamp: new THREE.MeshBasicNodeMaterial({ color: 0xfff1cc })
  };
  mats.lamp.userData.noShadow = true;

  // ---------------------------------------------------------------------------------------------------------------
  // Placement: fitToSite puts a model built round a local origin onto its real outline (NYC's role, terrain-aware):
  // centre on the outline's oriented box (+ offset in the model's frame), y = the site's base (lowest ground under the
  // outline) unless `y` is given, turned so the model's +x runs along the outline's long axis (or `yaw`). Colliders
  // given in the model's frame (collide()) follow it as oriented boxes with minY / maxY.
  // ---------------------------------------------------------------------------------------------------------------
  const site = (name) => LANDMARK_SITES[name];
  let place = null; // the current model's frame
  function frameOf(s, { yaw, offset = [0, 0], y, centre = 'box' } = {}) {
    const ob = orientedBox(s.ring);
    if (centre === 'home' && s.field) {
      // a ballpark from its OSM field: the backstop is where the outline's vertices crowd (its curve), centre field
      // the vertex farthest from it; home plate 15 m (the 48 ft backstop) in front of the backstop, +x to centre field
      const v = [];
      for (let i = 0; i + 1 < s.field.length; i += 2) v.push([s.field[i], s.field[i + 1]]);
      const dense = v.filter((p, i) => Math.hypot(p[0] - v[(i + 1) % v.length][0], p[1] - v[(i + 1) % v.length][1]) < 3);
      let bx = 0, bz = 0;
      for (const [x, z] of dense) { bx += x; bz += z; }
      bx /= dense.length; bz /= dense.length;
      const cf = v.reduce((a, p) => (Math.hypot(p[0] - bx, p[1] - bz) > Math.hypot(a[0] - bx, a[1] - bz) ? p : a), v[0]);
      const ang = Math.atan2(cf[1] - bz, cf[0] - bx);
      const hx = bx + Math.cos(ang) * 15, hz = bz + Math.sin(ang) * 15;
      return { cx: hx, cz: hz, y: y ?? s.base, ang, cs: Math.cos(ang), sn: Math.sin(ang), len: ob.len, wid: ob.wid };
    }
    const ang = yaw ?? ob.ang;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const cx = (centre === 'box' ? ob.cx : s.x) + offset[0] * cs - offset[1] * sn;
    const cz = (centre === 'box' ? ob.cz : s.z) + offset[0] * sn + offset[1] * cs;
    return { cx, cz, y: y ?? s.base, ang, cs, sn, len: ob.len, wid: ob.wid };
  }
  // model (x, z) -> world, for the frame `f` (+x along ang, +z to its right: (-sn, cs))
  const toWorld = (f, x, z) => [f.cx + x * f.cs - z * f.sn, f.cz + x * f.sn + z * f.cs];
  // (w along the model's direction ry, d across it)
  function collide(x, z, w, d, y0, y1, ry = 0) {
    const f = place;
    const [cx, cz] = toWorld(f, x, z);
    const a = f.ang + ry;
    const cs = Math.cos(a), sn = Math.sin(a);
    // buildings.js / controllers.js OBB convention: local = R_y(-theta)(p - c), theta = -a (three.js rotation.y)
    const ex = (Math.abs(cs) * w + Math.abs(sn) * d) * 0.5, ez = (Math.abs(sn) * w + Math.abs(cs) * d) * 0.5;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: f.y + y0, maxY: f.y + y1, obb: { cx, cz, hx: w * 0.5, hz: d * 0.5, cs: Math.cos(-a), sn: Math.sin(-a) } });
  }
  function fitToSite(obj, s, f, name) {
    obj.position.set(f.cx, f.y, f.cz);
    obj.rotation.y = -f.ang;
    obj.name = name;
    group.add(obj);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The models. Each: [OSM name, build(P, s, f) -> { cover }, frame options]. P builds in the model's frame;
  // collide() adds colliders in it. `cover`: the generated masses under the outline are left out (default true)
  // ---------------------------------------------------------------------------------------------------------------
  const MODELS = [];
  const model = (name, build, frame = {}) => MODELS.push({ name, build, frame });

  // world (x, z) -> the model's frame (the inverse of toWorld)
  const toLocal = (f, x, z) => [(x - f.cx) * f.cs + (z - f.cz) * f.sn, -(x - f.cx) * f.sn + (z - f.cz) * f.cs];
  const localRing = (f, flat) => { const o = []; for (let i = 0; i + 1 < flat.length; i += 2) o.push(toLocal(f, flat[i], flat[i + 1])); return o; };
  // the model-frame axis nearest a world direction (wx, wz): [axis 'x' | 'z', sign]
  const nearestAxis = (f, wx, wz) => { const lx = wx * f.cs + wz * f.sn, lz = -wx * f.sn + wz * f.cs; return Math.abs(lx) >= Math.abs(lz) ? ['x', Math.sign(lx)] : ['z', Math.sign(lz)]; };
  const colourMats = new Map();
  const matOfColour = (c, fallback) => {
    if (!c) return fallback;
    if (!colourMats.has(c)) colourMats.set(c, std(c, 0.7, /#61c1c3|#f2e923/i.test(c) ? 0.6 : 0.05));
    return colourMats.get(c);
  };
  // OSM building parts as drawn (rings in world xz, heights above the site's base) with their roof shapes: dome (a half
  // ellipsoid over the part's box), pyramidal (to an apex over its centre), gabled (ridge along its long side), else
  // flat; `matOf(part, isRoof)` picks the material. Returns the highest top
  function renderParts(P, s, f, matOf, parts = s.parts) {
    let top = 0;
    for (const part of parts) {
      const rings = part.rings.map((r) => localRing(f, r));
      const roofH = part.roof === 'dome' || part.roof === 'pyramidal' || part.roof === 'gabled' ? Math.min(part.h - part.min, part.roofH ?? part.h - part.min) : 0;
      const wallTop = part.h - roofH;
      if (wallTop - part.min > 0.05) P.prism(matOf(part, false), rings[0], part.min, wallTop, rings.slice(1));
      if (roofH > 0) {
        const xs = rings[0].map((p) => p[0]), zs = rings[0].map((p) => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        const rx = (Math.max(...xs) - Math.min(...xs)) / 2, rz = (Math.max(...zs) - Math.min(...zs)) / 2;
        if (part.roof === 'dome') {
          P.add(matOf(part, true), new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), P.at(cx, wallTop, cz, 0, rx, roofH, rz));
        } else if (part.roof === 'pyramidal') {
          const pos = [];
          for (let i = 0; i < rings[0].length; i++) {
            const [ax, az] = rings[0][i], [bx, bz] = rings[0][(i + 1) % rings[0].length];
            // wound so the face looks outwards and up: (B - A) x (C - A) has y > 0
            const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            if (ny >= 0) pos.push(ax, wallTop, az, bx, wallTop, bz, cx, part.h, cz);
            else pos.push(ax, wallTop, az, cx, part.h, cz, bx, wallTop, bz);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.computeVertexNormals();
          P.add(matOf(part, true), g);
        } else {
          const ob = orientedBox(rings[0].flat());
          const shape = new THREE.Shape([new THREE.Vector2(-ob.wid / 2, 0), new THREE.Vector2(ob.wid / 2, 0), new THREE.Vector2(0, roofH)]);
          const g = new THREE.ExtrudeGeometry(shape, { depth: ob.len, bevelEnabled: false });
          g.translate(0, 0, -ob.len / 2);
          g.rotateY(Math.PI / 2 - ob.ang);
          g.translate(ob.cx, wallTop, ob.cz);
          P.add(matOf(part, true), g);
        }
      }
      top = Math.max(top, part.h);
    }
    return top;
  }
  const extrudeParts = (P, s, f, matOf) => renderParts(P, s, f, matOf);

  // ===== Sutro Tower (docs/landmarks/sutro-tower.md): OSM's building parts: three legs in nine bands of red and white,
  // five crossarm levels, three top masts; lattice drawn as solid members =====
  model('Sutro Tower', (P, s, f) => {
    const top = extrudeParts(P, s, f, (p) => (/^#e9e9df$/i.test(p.colour) ? mats.white : p.colour ? mats.orange : mats.steelGrey));
    // aircraft warning lamps on the mast tops
    for (const p of s.parts.filter((q) => /top_mast/.test(q.desc))) {
      let x = 0, z = 0;
      const r = p.rings[0];
      for (let i = 0; i < r.length; i += 2) { x += r[i]; z += r[i + 1]; }
      x = x / (r.length / 2) - f.cx; z = z / (r.length / 2) - f.cz;
      P.box(mats.lamp, x, p.h, z, 0.8, 0.8, 0.8);
    }
    collide(0, 0, 40, 40, 0, top);
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // Square frustum (4-sided, turned so its sides run along x and z) of widths w0 -> w1 from y0 to y1
  const frustum = (P, mat, x, z, y0, y1, w0, w1, paint) => P.add(mat, new THREE.CylinderGeometry(w1 / Math.SQRT2, w0 / Math.SQRT2, y1 - y0, 4, 1), P.at(x, (y0 + y1) / 2, z, Math.PI / 4), paint);
  // A loft of rounded squares: [y, width, corner radius] levels, n points per corner arc; closed top
  function roundedLoft(P, mat, levels, n = 6) {
    const ring = (w, r) => {
      const pts = [];
      const h = w / 2 - r;
      for (const [cx, cz, a0] of [[h, h, 0], [-h, h, Math.PI / 2], [-h, -h, Math.PI], [h, -h, Math.PI * 1.5]]) {
        for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * (i / n); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      }
      return pts;
    };
    const pos = [];
    for (let k = 0; k + 1 < levels.length; k++) {
      const [y0, w0, r0] = levels[k], [y1, w1, r1] = levels[k + 1];
      const a = ring(w0, r0), b = ring(w1, r1);
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        pos.push(a[i][0], y0, a[i][1], b[j][0], y1, b[j][1], a[j][0], y0, a[j][1]);
        pos.push(a[i][0], y0, a[i][1], b[i][0], y1, b[i][1], b[j][0], y1, b[j][1]);
      }
    }
    const [yt, wt, rt] = levels[levels.length - 1];
    const t = ring(wt, rt);
    for (let i = 0; i < t.length; i++) { const j = (i + 1) % t.length; pos.push(0, yt, 0, t[j][0], yt, t[j][1], t[i][0], yt, t[i][1]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    P.add(mat, g);
    return ring;
  }

  // ===== Transamerica Pyramid (docs/landmarks/transamerica-pyramid.md): a square pyramid 53 m at the base (OSM 54 m) to
  // the 48th floor at 212 m, 15 m across there (OSM's top part), the aluminium spire to 260 m; the wings (east: lifts,
  // west: stairs) as vertical faces 14 m out from the axis, 10.7 m wide (OSM's 27.9 x 10.7 m part), from where the
  // pyramid's face falls behind them to their gable at 215 m (OSM); a 4-storey base (Wikipedia) behind a colonnade
  // (ESTIMATE: 8 columns a side, the truss band over it). White quartz precast panels with recessed windows =====
  const quartz = paintMat(0xece8df, 0xc4beb2, 3, 0.4, { floorHeight: 4.4, windowWidth: 2.2, windowRatioX: 0.42, windowRatioY: 0.5 });
  const aluminium = std(0xd9dde0, 0.35, 0.8);
  model('Transamerica Pyramid', (P, s, f) => {
    const W0 = 53, W1 = 15, TOP = 212, TIP = s.topH || 260, BASE = 16, WING_OUT = 13.95, WING_W = 10.7, WING_TOP = 215;
    const half = (y) => (W0 - (W0 - W1) * (y / TOP)) / 2;
    P.box(mats.glassDark, 0, 0, 0, W0 - 6, BASE, W0 - 6);
    frustum(P, quartz, 0, 0, BASE, TOP, half(BASE) * 2, W1);
    frustum(P, aluminium, 0, 0, TOP, TIP, W1, 0.6);
    // the colonnade and the truss band over it
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const u = -W0 / 2 + 3 + ((W0 - 6) * i) / 7;
        P.beam(quartz, [u, 0, sd * (W0 / 2 - 1)], [u * 0.97, BASE, sd * (half(BASE) - 0.5)], 1.6, 1.6);
        P.beam(quartz, [sd * (W0 / 2 - 1), 0, u], [sd * (half(BASE) - 0.5), BASE, u * 0.97], 1.6, 1.6);
      }
      P.box(quartz, 0, BASE - 2.5, sd * (half(BASE) - 0.6), W0, 2.5, 1.4);
      P.box(quartz, sd * (half(BASE) - 0.6), BASE - 2.5, 0, 1.4, 2.5, W0);
    }
    // wings on the faces nearest world east and west
    const yW = TOP * (W0 / 2 - WING_OUT) / ((W0 - W1) / 2);
    for (const wx of [1, -1]) {
      const [axis, sg] = nearestAxis(f, wx, 0);
      const mid = sg * (WING_OUT + W1 / 2) / 2, depth = WING_OUT - W1 / 2;
      if (axis === 'x') { P.box(quartz, mid, yW, 0, depth, WING_TOP - yW, WING_W); P.add(quartz, new THREE.CylinderGeometry(0.01, WING_W / 2, 6, 3, 1), P.at(sg * (WING_OUT - depth / 2), WING_TOP, 0, 0, depth / WING_W * 1.6, 1, 1)); }
      else { P.box(quartz, 0, yW, mid, WING_W, WING_TOP - yW, depth); }
    }
    for (const [y0, y1, w] of [[0, 60, W0], [60, 120, half(60) * 2], [120, 180, half(120) * 2], [180, TIP, half(180) * 2]]) collide(0, 0, w, w, y0, y1);
  });

  // ===== Salesforce Tower (docs/landmarks/salesforce-tower.md): square in plan with rounded corners (54 m, OSM's
  // outline), tapering softly in its top third to the roof at 296 m, the crown to 326 m: glass and white aluminium fins.
  // ESTIMATES: the corner radius (9 m), the widths at the roof (41 m) and the crown top (33 m), the taper's start (196 m),
  // 30 fins round the crown =====
  const sfGlass = createCurtainWallMaterial({ glassTint: 0x4f6a7e, frameTint: 0xe6ebee, windowWidth: 1.5, floorHeight: 4.2, mullionThickness: 0.12, spandrelRatio: 0.28, litProbability: 0.5, reflectivity: 0.9, seed: 61.3 });
  const finWhite = std(0xeef1f2, 0.45, 0.4);
  model('Salesforce Tower', (P, s, f) => {
    const W0 = 54, ROOF = 296, TIP = s.topH || 326;
    const levels = [[0, W0, 9], [196, W0, 9]];
    for (let k = 1; k <= 6; k++) { const u = k / 6; levels.push([196 + (ROOF - 196) * u, W0 - (W0 - 41) * (1 - Math.cos((u * Math.PI) / 2)), 9 - 2 * u]); }
    roundedLoft(P, sfGlass, levels);
    // the crown: a dark core and the fins round it, rising to the top
    roundedLoft(P, mats.glassDark, [[ROOF, 36, 6], [TIP - 6, 28, 5]]);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const r0 = 41 / 2 / Math.max(Math.abs(c), Math.abs(sn)) * 0.97, r1 = 33 / 2 / Math.max(Math.abs(c), Math.abs(sn)) * 0.97;
      P.beam(finWhite, [c * r0, ROOF - 1, sn * r0], [c * r1, TIP, sn * r1], 0.6, 1.4);
    }
    P.box(finWhite, 0, ROOF - 1.5, 0, 42, 1.5, 42);
    collide(0, 0, W0, W0, 0, 196);
    collide(0, 0, 44, 44, 196, TIP);
  });

  // ===== Ferry Building (docs/landmarks/ferry-building.md): the hall as OSM outlines it (16.1 m), the clock tower from
  // OSM's stages (16 m square shaft to 43.5 m, the belfry stages and the cupola to 70 m, the pole to 83 m), four 6.7 m
  // clock dials (Wikipedia), 22 arches a side along the nave (Wikipedia). ESTIMATES: the dials' centre height (36 m), the
  // stone colour, the arches' size =====
  const ferryStone = paintMat(0xddd5c3, 0xb3a991, 3, 0.35, { floorHeight: 5.2, windowWidth: 3.0 });
  const dialMat = std(0xf3efe2, 0.5, 0.0);
  model('San Francisco Ferry Building', (P, s, f) => {
    const hall = s.parts.find((p) => p.h < 20) || { rings: [s.ring], min: 0, h: 16.1 };
    const tower = s.parts.filter((p) => p !== hall);
    renderParts(P, s, f, (p, roof) => (roof ? mats.copperGreen : p.h > 80 ? mats.steelGrey : ferryStone), [hall, ...tower]);
    // arcade along the hall's long sides: on the outline itself, where a line across the hall's long axis meets it
    const hr = localRing(f, hall.rings[0]);
    const ob = orientedBox(hr.flat());
    const ux = Math.cos(ob.ang), uz = Math.sin(ob.ang);
    for (let i = 0; i < 22; i++) {
      const u = -ob.len / 2 + 12 + ((ob.len - 24) * (i + 0.5)) / 22;
      const px = ob.cx + ux * u, pz = ob.cz + uz * u;
      // crossings of the line p + v (-uz, ux) with the outline's edges: the nearest either side are the two fronts
      let lo = -Infinity, hi = Infinity;
      for (let k = 0; k < hr.length; k++) {
        const [ax, az] = hr[k], [bx, bz] = hr[(k + 1) % hr.length];
        const den = (bx - ax) * ux + (bz - az) * uz;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((px - ax) * ux + (pz - az) * uz) / den;
        if (t < 0 || t > 1) continue;
        const v = -(ax + (bx - ax) * t - px) * uz + (az + (bz - az) * t - pz) * ux;
        if (v < 0) lo = Math.max(lo, v); else hi = Math.min(hi, v);
      }
      for (const v of [lo, hi]) {
        if (!Number.isFinite(v)) continue;
        const sg = Math.sign(v), x = px - uz * (v + sg * 0.05), z = pz + ux * (v + sg * 0.05), ry = -ob.ang;
        P.box(mats.glassDark, x, 0.6, z, 4.2, 6.2, 0.3, ry);
        P.add(mats.glassDark, new THREE.CylinderGeometry(2.1, 2.1, 0.3, 12, 1, false, 0, Math.PI), P.at(x, 6.8, z, ry, 1, 1, 1, Math.PI / 2));
      }
    }
    // clock dials on the shaft
    const shaft = tower.find((p) => p.h > 40 && p.h < 45);
    if (shaft) {
      const r = localRing(f, shaft.rings[0]);
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, hw = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.15;
      for (const [dx, dz, ry] of [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]]) {
        P.add(dialMat, new THREE.CircleGeometry(3.35, 32), P.at(cx + dx * hw, 36, cz + dz * hw, ry));
        P.add(mats.roofDark, UNIT_BOX, P.at(cx + dx * (hw + 0.05), 36.8, cz + dz * (hw + 0.05), ry, 0.25, 2.2, 0.1));
        P.add(mats.roofDark, UNIT_BOX, P.at(cx + dx * (hw + 0.05), 36, cz + dz * (hw + 0.05), ry + 0, 2.6, 0.25, 0.1));
      }
      collide(cx, cz, hw * 2, hw * 2, 0, 70);
    }
    collide(ob.cx, ob.cz, ob.len, ob.wid, 0, 16.1, ob.ang);
  }, { yaw: 0, centre: 'site' });

  // ===== Coit Tower (docs/landmarks/coit-tower.md): OSM's parts (the base terrace and rotunda, the 11 m shaft to 50 m,
  // the 9 m top to 64 m), unpainted concrete (#E0E0E0), red tile roofs on the rotunda (OSM roof:colour); the fluting as
  // ribs round the shaft and the arcade of the observation level under the top (ESTIMATE: 16 flutes, 8 arches at 50-58 m) =====
  model('Coit Tower', (P, s, f) => {
    const conc = std(0xe0e0e0, 0.85, 0.0), tile = std(0x8e5448, 0.8, 0.0);
    const top = renderParts(P, s, f, (p) => conc);
    for (const p of s.parts.filter((q) => q.roofColour && q.h <= 12)) {
      const r = localRing(f, p.rings[0]);
      P.prism(tile, r, p.h, p.h + 0.3);
    }
    const shaft = s.parts.find((p) => p.h === 50);
    if (shaft) {
      const r = localRing(f, shaft.rings[0]);
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, R = (Math.max(...xs) - Math.min(...xs)) / 2;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        P.box(conc, cx + Math.cos(a) * R, 12, cz + Math.sin(a) * R, 0.7, 38, 0.7, -a);
      }
      for (let i = 0; i < 8; i++) {
        const a = ((i + 0.5) / 8) * Math.PI * 2, R2 = R * 0.83;
        P.box(mats.glassDark, cx + Math.cos(a) * R2, 52, cz + Math.sin(a) * R2, 0.3, 5, 2.2, -a);
      }
      collide(cx, cz, R * 2, R * 2, 0, top);
    }
    collide(0, 0, 22, 22, 0, 12);
  }, { yaw: 0, centre: 'site' });

  // ===== City Hall (docs/landmarks/city-hall.md): OSM's 19 parts as drawn (the two-block base to 30 m, the central
  // block, the drum stages, the dome 60-75 m, the lantern and its gilded finial to 93 m; OSM colours); granite walls with
  // windows; a colonnade round the drum (ESTIMATE: 32 columns on the 46-56 m stage) =====
  const granite = paintMat(0xe3e3de, 0xb9b8b0, 3, 0.4, { floorHeight: 6.0, windowWidth: 2.6 });
  model('San Francisco City Hall', (P, s, f) => {
    const top = renderParts(P, s, f, (p, roof) => (/#61c1c3|#f2e923/i.test(p.colour) || roof ? matOfColour(p.colour || p.roofColour || '#61c1c3', mats.copperGreen) : p.h - p.min > 8 ? granite : matOfColour(p.colour, mats.stoneLight)));
    const drum = s.parts.find((p) => p.min === 46 && p.h === 56);
    if (drum) {
      const r = localRing(f, drum.rings[0]);
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, R = (Math.max(...xs) - Math.min(...xs)) / 2 + 1.2;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        P.cyl(mats.stoneLight, cx + Math.cos(a) * R, 46, cz + Math.sin(a) * R, 0.7, 0.6, 9.2, 10);
      }
      P.cyl(mats.stoneLight, cx, 55.2, cz, R + 1, R + 1, 1, 40);
      collide(cx, cz, 34, 34, 30, top);
    }
    const ob = orientedBox(localRing(f, s.ring).flat());
    collide(ob.cx, ob.cz, ob.len, ob.wid, 0, 30, ob.ang);
  }, { yaw: 0, centre: 'site' });

  // ===== Palace of Fine Arts (docs/landmarks/palace-of-fine-arts.md): OSM's 37 parts as drawn (the rotunda's drum and
  // dome to 51 m, its 36 m piers, the colonnades round the lagoon at 12-17 m); warm stone (ESTIMATE: colour); the dome
  // terracotta red (ESTIMATE, from photographs: not in the opened sources) =====
  const pfaStone = std(0xcbb79a, 0.85, 0.0), pfaDome = std(0xa8664a, 0.7, 0.05);
  // a colonnade band (a long OSM part 12-17 m tall): its top 3.5 m as the entablature, columns under it every 4 m along
  // its edges, 1.2 m in (ESTIMATE: spacing and size)
  function colonnade(P, f, part, mat) {
    const r = localRing(f, part.rings[0]);
    P.prism(mat, r, part.h - 3.5, part.h);
    let sx = 0, sz = 0;
    for (const [x, z] of r) { sx += x; sz += z; }
    const flat = r.flat();
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let t = 2; t < L - 1; t += 4) {
        let x = ax + ((bx - ax) * t) / L + nx * 1.2, z = az + ((bz - az) * t) / L + nz * 1.2;
        if (!pointInFlatRing(flat, x, z)) { x -= nx * 2.4; z -= nz * 2.4; }
        if (pointInFlatRing(flat, x, z)) P.cyl(mat, x, part.min, z, 0.75, 0.6, part.h - 3.5 - part.min, 10);
      }
    }
  }
  model('Palace of Fine Arts', (P, s, f) => {
    const isBand = (p) => p.h >= 12 && p.h <= 17 && p.min === 0 && p.rings[0].length >= 19;
    const top = renderParts(P, s, f, (p, roof) => (roof ? pfaDome : pfaStone), s.parts.filter((p) => !isBand(p)));
    for (const p of s.parts.filter(isBand)) colonnade(P, f, p, pfaStone);
    collide(0, 0, 40, 40, 0, top);
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // ===== Oracle Park (docs/landmarks/oracle-park.md): the field as OSM maps it (home plate on its west side, centre
  // field 119 m east-south-east, right field along McCovey Cove to the south, left field to the bay); the stands as a ring sector
  // round home plate behind a brick wall, the 24 ft (7.3 m) brick wall in right field (Wikipedia), centre field 119 m
  // (Wikipedia), the two 122 ft (37 m) clock towers (SABR), the Coca-Cola bottle (24 m, Wikipedia) and the glove (8 x
  // 9.75 m, SABR) behind left field. The grandstand fills the foul side between OSM's field and the stadium's outline.
  // ESTIMATES: its height (32 m), the clock towers' plan (9 m) and places, the light towers =====
  const brick = paintMat(0x9c4a32, 0xd8cfc0, 0, 0.3, { floorHeight: 5.0, windowWidth: 3.2 });
  const seats = std(0x2b3a4a, 0.7, 0.1), grass = std(0x4f8a3a, 0.9, 0.0), clay = std(0xa86a42, 0.95, 0.0);
  model('Oracle Park', (P, s, f) => {
    // the frame: origin on home plate, +x towards centre field, +z to its right (right field, the cove)
    const out = localRing(f, s.ring), field = localRing(f, s.field);
    // the distance along the ray at angle a from home plate to the farthest crossing of a ring
    const ray = (ring, a) => {
      const dx = Math.cos(a), dz = Math.sin(a);
      let best = 0;
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
        const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
        if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
      }
      return best;
    };
    const N = 72, H = 32;
    const pos = [];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2 - Math.PI, a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI, am = (a0 + a1) / 2;
      const rf0 = Math.max(18, ray(field, a0)), rf1 = Math.max(18, ray(field, a1)), ro0 = ray(out, a0), ro1 = ray(out, a1);
      const foul = Math.abs(am) > Math.PI / 4 + 0.08;
      const inner0 = foul ? rf0 + 4 : rf0, inner1 = foul ? rf1 + 4 : rf1;
      const pt = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      if (foul && ro0 > inner0 + 8 && ro1 > inner1 + 8) {
        // the grandstand: rising from the field's edge to the outline, a brick wall at its back
        const q = [pt(a0, inner0, 2), pt(a1, inner1, 2), pt(a1, ro1 - 2, H), pt(a0, ro0 - 2, H)];
        pos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
        const rm = (ro0 + ro1) / 2 - 1.2, L = Math.hypot(...[0, 2].map((k) => pt(a1, ro1, 0)[k] - pt(a0, ro0, 0)[k])) + 0.3;
        P.box(brick, Math.cos(am) * rm, 0, Math.sin(am) * rm, 1.4, H + 4, L, Math.PI / 2 - Math.atan2(pt(a1, ro1, 0)[2] - pt(a0, ro0, 0)[2], pt(a1, ro1, 0)[0] - pt(a0, ro0, 0)[0]));
        P.box(mats.concrete, Math.cos(am) * inner0, 0, Math.sin(am) * inner0, 1, 2.5, (Math.PI * 2 / N) * inner0 + 0.3, -am);
        collide(Math.cos(am) * (inner0 + ro0) / 2, Math.sin(am) * (inner0 + ro0) / 2, ro0 - inner0, L, 0, H + 4, am);
      } else if (!foul) {
        // the outfield fence: the 24 ft (7.3 m) brick wall in right field (+z), elsewhere 2.5 m (ESTIMATE)
        const h = am > 0.05 ? 7.3 : 2.5;
        P.beam(am > 0.05 ? brick : mats.roofDark, pt(a0, rf0, h / 2), pt(a1, rf1, h / 2), h, 0.8);
        // left and centre field bleachers between the fence and the outline (ESTIMATE: 10 m)
        if (am < -0.05 && ro0 > rf0 + 10) {
          const q = [pt(a0, rf0 + 1, 2.5), pt(a1, rf1 + 1, 2.5), pt(a1, Math.min(ro1, rf1 + 30), 10), pt(a0, Math.min(ro0, rf0 + 30), 10)];
          pos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    for (let k = 0; k < nrm.count; k++) if (nrm.getY(k) < 0) nrm.setXYZ(k, -nrm.getX(k), -nrm.getY(k), -nrm.getZ(k));
    P.add(seats, g);
    // the field: OSM's pitch in grass, the infield dirt and its grass square (a 90 ft = 27.4 m diamond)
    P.prism(grass, field, 0.1, 0.3);
    P.add(clay, new THREE.CircleGeometry(29, 24, -Math.PI / 4, Math.PI / 2).rotateX(-Math.PI / 2), P.at(0, 0.32, 0));
    P.add(grass, new THREE.PlaneGeometry(19.4, 19.4).rotateX(-Math.PI / 2), P.at(19.4 * Math.SQRT1_2, 0.34, 0, Math.PI / 4));
    // clock towers (37 m) where the grandstand's back meets the outline behind home plate (ESTIMATE: 9 m square)
    for (const a of [Math.PI - 0.9, -Math.PI + 0.9]) {
      const r = ray(out, a) + 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      P.box(brick, x, 0, z, 9, 34, 9, -a);
      P.add(mats.copperGreen, new THREE.ConeGeometry(6.5, 5, 4), P.at(x, 36.5, z, Math.PI / 4 - a));
      collide(x, z, 9, 9, 0, 37, -a);
    }
    // the Coca-Cola bottle and the glove behind left field (-z)
    const lf = -(Math.PI / 4 + 0.12), rb = Math.min(ray(out, lf) - 8, ray(field, lf) + 22);
    const bx = Math.cos(lf) * rb, bz = Math.sin(lf) * rb;
    P.lathe(std(0xc8102e, 0.4, 0.1), [[0, 0], [3.2, 0], [3.4, 6], [3.2, 12], [1.6, 17], [1.2, 22], [1.3, 24], [0, 24]], bx, 8, bz, 20);
    P.add(std(0x8a5a32, 0.8, 0.0), new THREE.SphereGeometry(1, 16, 12), P.at(bx + 10, 12, bz + 6, 0, 4.9, 4, 3));
    // light towers on the grandstand's back (ESTIMATE: six, 60 m; the count is not in the sources)
    for (const a of [Math.PI / 2 + 0.25, Math.PI * 0.75, Math.PI - 0.25, -Math.PI + 0.25, -Math.PI * 0.75, -Math.PI / 2 - 0.25]) {
      const r = ray(out, a) - 3, x = Math.cos(a) * r, z = Math.sin(a) * r;
      P.cyl(mats.steelGrey, x, 0, z, 0.9, 0.7, 56, 8);
      P.box(mats.steelGrey, x, 54, z, 10, 5, 1.2, -a + Math.PI / 2);
    }
  }, { centre: 'home' });

  // ----- Tier 2 -----
  // the highest generated roof (data/buildings-<box>.bin: base + roof) among the footprints whose centroid is inside an
  // outline: what an elevated park or a rooftop sign stands on
  function roofUnder(flat) {
    const B = window.NYC.DATA && window.NYC.DATA.buildings;
    if (!B) return null;
    const { header, table, verts } = B, F = header.fields.length;
    let top = null;
    for (let i = 0; i < header.count; i++) {
      const ringStart = table[i * F + 3], ringCount = table[i * F + 4];
      let sx = 0, sz = 0;
      for (let k = 0; k < ringCount; k++) { sx += verts[2 * (ringStart + k)]; sz += verts[2 * (ringStart + k) + 1]; }
      if (pointInFlatRing(flat, sx / ringCount, sz / ringCount)) top = Math.max(top ?? -Infinity, table[i * F + 1]);
    }
    return top;
  }
  const concreteWarm = paintMat(0xc9c1b0, 0x9e9686, 1, 0.25, { floorHeight: 11, windowWidth: 3.2, windowRatioX: 0.3, windowRatioY: 0.7 });
  // ===== Grace Cathedral (docs/landmarks/grace-cathedral.md): OSM's parts (the body to 28 m, the two towers to 53 m,
  // the flèche to 75 m); ferroconcrete; ESTIMATES: the nave's pitched roof (9 m), the flèche's spire from 48 m, the towers'
  // pinnacles =====
  model('Grace Cathedral', (P, s, f) => {
    const body = s.parts.find((p) => p.h === 28), spire = s.parts.find((p) => p.h === 75), towers = s.parts.filter((p) => p.h === 53);
    if (body) {
      renderParts(P, s, f, () => concreteWarm, [body]);
      // the nave's roof along the body's long axis, 26 m wide and 10 m short of its ends (ESTIMATE)
      const ob = orientedBox(localRing(f, body.rings[0]).flat());
      const c = Math.cos(ob.ang), sn = Math.sin(ob.ang), hl = ob.len / 2 - 5, hw = 13;
      const roofRing = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => [ob.cx + u * c - v * sn, ob.cz + u * sn + v * c]);
      const toW = roofRing.map(([x, z]) => toWorld(f, x, z)).flat();
      renderParts(P, s, f, () => mats.roofDark, [{ rings: [toW], min: 28, h: 37, roof: 'gabled', roofH: 9 }]);
    }
    renderParts(P, s, f, () => concreteWarm, towers);
    for (const t of towers) {
      const r = localRing(f, t.rings[0]);
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      for (const x of [Math.min(...xs) + 1, Math.max(...xs) - 1]) for (const z of [Math.min(...zs) + 1, Math.max(...zs) - 1]) P.cyl(concreteWarm, x, 53, z, 0.9, 0.1, 5, 6);
    }
    if (spire) {
      const r = localRing(f, spire.rings[0]);
      const x = r.reduce((a, p) => a + p[0], 0) / r.length, z = r.reduce((a, p) => a + p[1], 0) / r.length;
      P.cyl(mats.roofDark, x, 37, z, 3.4, 3.0, 11, 8);
      P.cyl(mats.copperGreen, x, 48, z, 3.0, 0.15, 27, 8);
    }
    const ob = orientedBox(localRing(f, s.ring).flat());
    collide(ob.cx, ob.cz, ob.len, ob.wid, 0, 37, ob.ang);
  }, { yaw: 0, centre: 'site' });

  // ===== Chase Center (docs/landmarks/chase-center.md): OSM's outline (a ~155 m drum) to its 38.1 m height; white
  // aluminium panels over a glass base (Architect's Newspaper via the notes); ESTIMATES: the glass base (to 9 m), the
  // three set-back tiers =====
  const panelWhite = std(0xeef0ee, 0.45, 0.35);
  model('Chase Center', (P, s, f) => {
    const r = localRing(f, s.ring), H = s.topH || 38.1;
    const shrink = (k) => r.map(([x, z]) => [x * k, z * k]);
    P.prism(mats.glassDark, shrink(0.97), 0, 9);
    P.prism(panelWhite, r, 9, 22);
    P.prism(panelWhite, shrink(0.96), 22, 31);
    P.prism(panelWhite, shrink(0.92), 31, H);
    const xs = r.map((p) => p[0]);
    collide(0, 0, Math.max(...xs) - Math.min(...xs), Math.max(...xs) - Math.min(...xs), 0, H);
  }, { yaw: 0, centre: 'site' });

  // ===== Conservatory of Flowers (docs/landmarks/conservatory-of-flowers.md): 73 m long (OSM 75 x 35), white-painted
  // wood and glass, the octagonal central pavilion with its dome to 18 m (Wikipedia), arched wings; ESTIMATES: the
  // pavilion's size (16 m across), the wings' 7 m vaults, the white frames =====
  const glassPale = std(0xc8d8d8, 0.15, 0.6), frameWhiteM = std(0xf4f4ef, 0.5, 0.05);
  model('Conservatory of Flowers', (P, s, f) => {
    const L = f.len, W = f.wid;
    P.box(frameWhiteM, 0, 0, 0, L - 2, 1.2, W * 0.42);
    for (const sd of [-1, 1]) {
      // the wings: glass vaults along +x either side of the pavilion
      P.add(glassPale, new THREE.CylinderGeometry(4.5, 4.5, L / 2 - 9, 16, 1, false, 0, Math.PI), P.at(sd * (L / 4 + 4), 4.5, 0, 0, 1, 1, 1, 0, Math.PI / 2));
      P.box(glassPale, sd * (L / 4 + 4), 1.2, 0, L / 2 - 9, 3.3, 9);
      for (let x = 9; x < L / 2 - 1; x += 3) P.add(frameWhiteM, new THREE.TorusGeometry(4.55, 0.12, 4, 12, Math.PI), P.at(sd * x, 4.5, 0, Math.PI / 2));
      P.box(glassPale, sd * (L / 2 - 4), 1.2, 0, 6, 6, W * 0.8);
    }
    P.cyl(glassPale, 0, 0, 0, 8, 8, 10, 8);
    P.add(glassPale, new THREE.SphereGeometry(8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.at(0, 10, 0, 0, 1, 1, 1));
    P.add(frameWhiteM, new THREE.CylinderGeometry(1.4, 1.6, 2, 8), P.at(0, 18 - 1, 0));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.box(frameWhiteM, Math.cos(a) * 8, 0, Math.sin(a) * 8, 0.4, 10, 0.4); }
    collide(0, 0, L, W * 0.5, 0, 18);
  });

  // ===== de Young Museum (docs/landmarks/de-young-museum.md): OSM's outline (the relation with its courtyards) at 13 m
  // and the Hamon Tower's stacked slices to 51 m (OSM; Wikipedia gives 44 m), perforated copper =====
  const copper = std(0x8c5d3c, 0.55, 0.6);
  model('de Young Museum', (P, s, f) => {
    P.prism(copper, localRing(f, s.ring), 0, s.topH || 13);
    const top = renderParts(P, s, f, () => copper);
    collide(0, 0, 40, 40, 0, top);
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // ===== Fort Point (docs/landmarks/fort-point.md): OSM's outline with its parade ground, 3 levels and 15 m (OSM),
  // brick (OSM building:material) with the casemates' openings =====
  const fortBrick = paintMat(0x9a5b45, 0x6b4a3c, 0, 0.1, { floorHeight: 5, windowWidth: 3.2, windowRatioX: 0.35, windowRatioY: 0.55 });
  model('Fort Point', (P, s, f) => {
    P.prism(fortBrick, localRing(f, s.ring), 0, s.topH || 15);
    collide(0, 0, f.len, f.wid, 0, s.topH || 15);
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // OSM buildings on a site (Alcatraz, the Painted Ladies): each on the lowest ground under it, to its height (where
  // OSM has none, `fallback`), its roof shape and colours
  function siteBuildings(P, s, f, matOf, fallback) {
    for (const b of s.buildings || []) {
      let g = Infinity;
      for (let i = 0; i < b.ring.length; i += 2) g = Math.min(g, T.groundAt(b.ring[i], b.ring[i + 1]));
      const y0 = g - f.y - 1, h = b.h ?? fallback(b);
      const part = { rings: [b.ring], min: y0, h: y0 + 1 + h, roof: b.roof, roofH: b.roofH, colour: b.colour, roofColour: b.roofColour };
      renderParts(P, s, f, (p, roof) => matOf(b, roof), [part]);
      const r = localRing(f, b.ring);
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      collide((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), y0, y0 + 1 + h);
    }
  }
  // ===== Alcatraz (docs/landmarks/alcatraz.md): the island is the region ground; its OSM buildings to their heights
  // (the cellhouse, untagged, 3 storeys: 13.5 m ESTIMATE; others untagged 9 m ESTIMATE), the lighthouse (26 m, OSM) with
  // its lantern, the 94 ft (28.7 m, NPS) water tower on legs =====
  const prisonConc = paintMat(0xd4cfc2, 0x8f8a7e, 1, 0.15, { floorHeight: 4.5, windowWidth: 2.0 });
  model('Alcatraz Island', (P, s, f) => {
    const isTower = (b) => /water/i.test(b.name), isLight = (b) => /Lighthouse/i.test(b.name);
    siteBuildings(P, { ...s, buildings: (s.buildings || []).filter((b) => !isTower(b) && !isLight(b)) }, f, () => prisonConc, (b) => (/Main Prison/i.test(b.name) ? 13.5 : 9));
    for (const b of (s.buildings || []).filter((q) => isLight(q) || isTower(q))) {
      const r = localRing(f, b.ring);
      const x = r.reduce((a, p) => a + p[0], 0) / r.length, z = r.reduce((a, p) => a + p[1], 0) / r.length;
      const [wx, wz] = toWorld(f, x, z);
      const g = T.groundAt(wx, wz) - f.y;
      if (isLight(b)) {
        const h = b.h || 26;
        P.cyl(mats.white, x, g, z, 2.6, 1.8, h - 4, 8);
        P.cyl(mats.glassDark, x, g + h - 4, z, 1.6, 1.6, 2.5, 8);
        P.cyl(mats.roofDark, x, g + h - 1.5, z, 1.9, 0.2, 1.5, 8);
      } else {
        const H = 28.7;
        for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) P.beam(mats.steelGrey, [x + dx, g, z + dz], [x + dx * 0.8, H - 8, z + dz * 0.8], 0.6, 0.6);
        P.cyl(mats.white, x, g + H - 9, z, 6, 6, 7, 16);
        P.cyl(mats.roofDark, x, g + H - 2, z, 6.2, 0.5, 2, 16);
      }
    }
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // ===== Painted Ladies (docs/landmarks/painted-ladies.md): the seven OSM houses on Steiner St with their heights,
  // colours and gabled roofs (OSM), wood siding; bay windows on the street fronts (ESTIMATE: one 2-storey bay each) =====
  const siding = paintMat(0xd8c8a8, 0xf2efe8, 2, 0.35, { floorHeight: 3.6, windowWidth: 1.6 });
  model('Painted Ladies', (P, s, f) => {
    for (const b of s.buildings || []) {
      let g = Infinity;
      for (let i = 0; i < b.ring.length; i += 2) g = Math.min(g, T.groundAt(b.ring[i], b.ring[i + 1]));
      const y0 = g - f.y - 0.5, h = b.h ?? 12, roofH = b.roofH ?? 3;
      const wall = [...rgb(b.colour || '#d8c8a8'), 2], trim = [...rgb(0xf2efe8), 0.35];
      P.prism(siding, localRing(f, b.ring), y0, y0 + h - roofH, [], [wall, trim]);
      renderParts(P, s, f, () => mats.roofDark, [{ rings: [b.ring], min: y0 + h - roofH, h: y0 + h, roof: 'gabled', roofH }]);
      // the bay on the street (east) front
      const r = localRing(f, b.ring);
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      P.box(siding, Math.max(...xs) + 0.6, y0 + 3.5, (Math.min(...zs) + Math.max(...zs)) / 2, 1.2, 6.5, 3.2, 0, [wall, trim]);
      collide((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), y0, y0 + h);
    }
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // ===== Mission Dolores (docs/landmarks/mission-dolores.md): the old adobe mission (OSM, 8 m) and the basilica (OSM,
  // 14 m): white walls, red tile gabled roofs (ESTIMATE: roof pitches) =====
  const adobe = std(0xf1ece0, 0.9, 0.0);
  for (const name of ['Old Mission Dolores', 'Mission Dolores Basilica']) {
    model(name, (P, s, f) => {
      const h = s.topH || (name.startsWith('Old') ? 8 : 14), roofH = name.startsWith('Old') ? 3 : 4;
      renderParts(P, s, f, (p, roof) => (roof ? mats.redTile : adobe), [{ rings: [s.ring], min: 0, h: h + roofH, roof: 'gabled', roofH }]);
      collide(0, 0, f.len, f.wid, 0, h + roofH);
      return { cover: false };
    }, { yaw: 0, centre: 'site' });
  }

  // ===== Salesforce Transit Center and Park (docs/landmarks/salesforce-park.md): the centre (opened 2018, after the
  // DataSF footprints' lidar) from OSM's outline to its OSM height (30 m), the park on its roof: OSM's outline, a lawn
  // and trees (ESTIMATES: the park level at the OSM height, the white skin, tree count and size) =====
  const skinWhite = paintMat(0xe9ebe8, 0xcfd3d2, 3, 0.2, { floorHeight: 7.5, windowWidth: 1.4, windowRatioX: 0.6, windowRatioY: 0.75 });
  model('Salesforce Transit Center', (P, s, f) => {
    P.prism(skinWhite, localRing(f, s.ring), 0, s.topH || 30);
    collide(0, 0, f.len, f.wid, 0, s.topH || 30);
    return { cover: false };
  });
  model('Salesforce Park', (P, s, f) => {
    const tc = site('Salesforce Transit Center');
    const roof = tc ? tc.base + (tc.topH || 30) : roofUnder(s.ring);
    if (roof == null) return { cover: false };
    const y = roof - f.y;
    const r = localRing(f, s.ring);
    P.prism(mats.grass, r, y, y + 0.4);
    const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
    let n = 0;
    for (let x = Math.min(...xs) + 6; x < Math.max(...xs) - 6 && n < 120; x += 14) {
      for (let z = Math.min(...zs) + 6; z < Math.max(...zs) - 6; z += 14) {
        if (!pointInFlatRing(r.flat(), x, z) || ((x * 7 + z * 13) & 3) === 0) continue;
        P.cyl(mats.dirt, x, y, z, 0.25, 0.2, 3, 5);
        P.add(mats.grass, new THREE.IcosahedronGeometry(2.4, 0), P.at(x, y + 4.5, z));
        n++;
      }
    }
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // ===== Ghirardelli Square's sign (docs/landmarks/ghirardelli-square.md): GHIRARDELLI, 46 x 5.8 m (19 x 152 ft: Color
  // Kinetics, Funcheap; Sartle gives 25 x 165 ft), facing the waterfront (north), on the highest roof of the square
  // (data/buildings; ESTIMATE: which roof); white lit letters =====
  model('Ghirardelli Square', (P, s, f) => {
    const roof = roofUnder(s.ring);
    if (roof == null) return { cover: false };
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1a18'; g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#fff8ec'; g.font = '700 104px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GHIRARDELLI', 512, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.MeshStandardNodeMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6 });
    // on the outline's north edge: the face looks north (-z world)
    const r = localRing(f, s.ring);
    const zs = r.map((p) => p[1]);
    const zN = Math.min(...zs) + 18, y = roof - f.y + 1;
    P.add(sign, new THREE.PlaneGeometry(46, 5.8), P.at(0, y + 2.9, zN, Math.PI));
    for (const x of [-20, -7, 7, 20]) P.beam(mats.steelGrey, [x, y - 1, zN + 0.4], [x, y + 5.8, zN + 0.4], 0.3, 0.3);
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // ===== The Powell & Market cable car turntable (docs/landmarks/cable-car-turntable.md): a redwood-faced revolving
  // platform at OSM's node, pushed round by hand. ESTIMATE: its diameter (8.5 m, room for a car: OSM's 5.1 m outline is
  // not a sourced figure); the rails across it =====
  const redwood = std(0x7a4a32, 0.8, 0.0);
  model('Cable Car Turntable (Powell & Market)', (P, s, f) => {
    const g = T.groundAt(s.x, s.z) - f.y;
    P.cyl(redwood, 0, g - 0.1, 0, 4.25, 4.25, 0.25, 32);
    P.cyl(mats.steelGrey, 0, g - 0.12, 0, 4.4, 4.4, 0.2, 32, 0, true);
    for (const sx of [-0.76, 0.76]) P.box(mats.steelGrey, sx, g + 0.15, 0, 0.08, 0.05, 8.4);
    return { cover: false };
  }, { yaw: 0, centre: 'site' });

  // ---------------------------------------------------------------------------------------------------------------
  // Lombard Street's crooked block (P5.5, docs/landmarks/lombard-street.md): red brick paving (OSM surface=bricks)
  // along the switchbacks the road graph drives (PLAN P3-6), terraced flower beds in the rest of its 10 m between the
  // curbs, steps down both sidewalks. ESTIMATES: the paved width (5.6 m), the beds' terraces (1 m cells, 0.25 m proud),
  // the flowers' colours, the steps (0.6 m treads)
  // ---------------------------------------------------------------------------------------------------------------
  function buildLombard() {
    const GEO = window.NYC.GEO, RG = GEO.roadGraph;
    if (!RG || !T) return null;
    const node = (i) => [RG.nodes[2 * i], RG.nodes[2 * i + 1]];
    const lines = [];
    let corridor = 0, side = 0;
    RG.links.forEach(([a, b, , w, , , inner, flags, swL, swR]) => {
      if (!(flags & 64)) return;
      const pts = [node(a)];
      for (let k = 0; k < inner.length; k += 2) pts.push([inner[k], inner[k + 1]]);
      pts.push(node(b));
      lines.push(pts);
      corridor = Math.max(corridor, w);
      side = Math.max(side, swL, swR);
    });
    if (!lines.length) return null;
    // the block's straight axis: end to end of the chained links
    const all = lines.flat();
    let A = all[0], Bp = all[0], best = 0;
    for (const p of all) for (const q of all) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > best) { best = d; A = p; Bp = q; } }
    const L = best, ux = (Bp[0] - A[0]) / L, uz = (Bp[1] - A[1]) / L;
    const distToRoad = (x, z) => {
      let d = Infinity;
      for (const pts of lines) for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
        d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
      }
      return d;
    };
    const P = createParts();
    const brickMat = std(0x93503c, 0.92, 0.0);
    brickMat.polygonOffset = true; brickMat.polygonOffsetFactor = -2; brickMat.polygonOffsetUnits = -2;
    // paving: a ribbon 5.6 m wide along each link, 1 m stations, 5 cm over the ground
    const HALF = 2.8;
    for (const pts of lines) {
      const st = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l));
        for (let k = 0; k < n; k++) st.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      st.push(pts[pts.length - 1]);
      const pos = [];
      const q = st.map((p, k) => {
        const a = st[Math.max(0, k - 1)], b = st[Math.min(st.length - 1, k + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
        return [-dz / dl, dx / dl];
      });
      for (let i = 0; i + 1 < st.length; i++) {
        const v = (k, s) => [st[k][0] + q[k][0] * s * HALF, T.heightAt(st[k][0] + q[k][0] * s * HALF, st[k][1] + q[k][1] * s * HALF) + 0.05, st[k][1] + q[k][1] * s * HALF];
        const a0 = v(i, -1), a1 = v(i, 1), b0 = v(i + 1, -1), b1 = v(i + 1, 1);
        pos.push(...a0, ...b1, ...a1, ...a0, ...b0, ...b1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      // normals up whichever way the strip was wound
      const nrm = g.attributes.normal;
      for (let k = 0; k < nrm.count; k++) if (nrm.getY(k) < 0) nrm.setXYZ(k, -nrm.getX(k), -nrm.getY(k), -nrm.getZ(k));
      P.add(brickMat, g);
    }
    // flower beds: 1 m cells between the curbs (corridor / 2 off the axis) farther than the paving from the road
    const beds = [];
    for (let t = 8; t < L - 8; t += 1) {
      for (let s = -corridor / 2 + 0.7; s <= corridor / 2 - 0.7; s += 1) {
        const x = A[0] + ux * t - uz * s, z = A[1] + uz * t + ux * s;
        if (distToRoad(x, z) < HALF + 0.6) continue;
        beds.push([x, T.heightAt(x, z), z]);
      }
    }
    const bedMesh = new THREE.InstancedMesh(UNIT_BOX, new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 }), Math.max(1, beds.length));
    const flowers = [0x3f6a2a, 0x46722e, 0x3a5f28, 0x507a34, 0x9c3d6a, 0xb05a82, 0x6d4f92, 0x3f6a2a, 0x46722e];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    beds.forEach(([x, y, z], i) => {
      m4.compose(new THREE.Vector3(x, y + 0.05, z), new THREE.Quaternion().setFromAxisAngle(UP, -Math.atan2(uz, ux)), new THREE.Vector3(1.02, 0.6, 1.02));
      bedMesh.setMatrixAt(i, m4);
      bedMesh.setColorAt(i, col.setHex(flowers[Math.floor(Math.abs(Math.sin(x * 12.99 + z * 78.23) * 43758.5) % flowers.length)]));
    });
    bedMesh.count = beds.length;
    bedMesh.name = 'landmark:lombard-beds';
    bedMesh.receiveShadow = true;
    // steps down the middle of both sidewalks: 0.6 m treads, each from its own ground
    const steps = [];
    for (const sg of [-1, 1]) {
      for (let t = 1; t < L - 1; t += 0.6) {
        const s = sg * (corridor / 2 + side / 2), x = A[0] + ux * t - uz * s, z = A[1] + uz * t + ux * s;
        steps.push([x, T.heightAt(x, z) + 0.12, z]);
      }
    }
    for (const [x, y, z] of steps) P.add(mats.concrete, UNIT_BOX, P.at(x, y - 0.25, z, -Math.atan2(uz, ux), 0.62, 0.5, Math.max(1.2, side - 1.4)));
    const g = new THREE.Group();
    g.name = 'landmark:lombard';
    const st = P.build(g, 'landmark:lombard', { shadow: false });
    g.add(bedMesh);
    group.add(g);
    return { name: 'Lombard Street', slug: 'lombard-street', tris: st.tris + beds.length * 12, draws: st.draws + 1 };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Build every model whose site resolved
  // ---------------------------------------------------------------------------------------------------------------
  for (const m of MODELS) {
    const s = site(m.name);
    if (!s || !s.ring || s.ring.length < 6) {
      console.warn(`[landmarks] no site for ${m.name}`);
      continue;
    }
    const f = frameOf(s, m.frame);
    place = f;
    const P = createParts();
    const res = m.build(P, s, f) || {};
    const obj = new THREE.Group();
    const st = P.build(obj, `landmark:${s.slug}`);
    fitToSite(obj, s, f, `landmark:${s.slug}`);
    if (res.cover !== false) {
      const xs = [], zs = [];
      for (let i = 0; i < s.ring.length; i += 2) { xs.push(s.ring[i]); zs.push(s.ring[i + 1]); }
      covers.push({ ring: s.ring, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) });
    }
    stats.push({ name: m.name, slug: s.slug, ...st });
  }

  const lombard = buildLombard();
  if (lombard) stats.push(lombard);

  window.NYC.landmarkCovers = (x, z) => covers.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && pointInFlatRing(c.ring, x, z));
  window.NYC.landmarkStats = stats;
  const total = stats.reduce((a, s) => ({ tris: a.tris + s.tris, draws: a.draws + s.draws }), { tris: 0, draws: 0 });
  console.info(`[landmarks] ${stats.length} models, ${Math.round(total.tris / 1000)}k triangles, ${total.draws} draws: ${stats.map((s) => `${s.slug} ${Math.round(s.tris / 100) / 10}k/${s.draws}`).join(', ')}`);
  scene.add(group);
  return { group, colliders };
}

Object.assign(window.NYC, { buildLandmarks, orientedBoxOfRing: orientedBox, createLandmarkParts: createParts });
})();
