(function () {
// js/sf-transit.js
// San Francisco's rail transit (P4.6) on the OSM Muni route runs in GEO.transit (tools/geo-extra.mjs): the F line's
// historic streetcars, Muni Metro light-rail trains (N, T, J where they run on the surface) and the cable cars of the
// Powell/Hyde, Powell/Mason and California lines. Every vehicle is bound to its run (each run is one direction of a
// route): it cruises, brakes into the route's stops, dwells and pulls away, keeps a gap behind the vehicle ahead and,
// at the end of the run, starts again at its beginning. Cable cars hold the cable's constant speed (CABLE_SPEED)
// between stops. Bodies stand on the terrain (curb islands and rail medians: CURB_H higher) or on a bridge deck
// (GradeSeparation.floorAt), pitched between their bogies.
// Liveries (docs/landmarks/muni.md): Muni Metro silver with a red stripe; cable cars maroon with light-blue trim and
// cream panels; the F line's streetcars in a few two-tone schemes standing for its historic cars (a style choice).
// Cars and pedestrians don't see the rail vehicles yet (a known gap, P4 gallery).

const { THREE } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { Fn, attribute, color, mix, step, float, vec3, smoothstep } = window.NYC.TSL;
const { blockAt, cityUniforms, CURB_H } = window.NYC;

const CABLE_SPEED = 15 / 3.6; // m/s: the cable's speed (PLAN P4.6: 15 km/h-equivalent)
const KINDS = {
  //            cruise (m/s), acceleration, braking, dwell (s), spacing (m), length (m), gap kept (m)
  streetcar: { v: 9, a: 1.0, b: 1.3, dwell: 14, spacing: 1400, len: 14.2, gap: 25 },
  lightrail: { v: 11, a: 1.1, b: 1.3, dwell: 18, spacing: 1100, len: 23.0, gap: 35 },
  cablecar: { v: CABLE_SPEED, a: 1.4, b: 1.6, dwell: 10, spacing: 520, len: 8.4, gap: 18 }
};
// Two-tone schemes for the F line's streetcars [lower, upper]
const STREETCAR_LIVERIES = [[0x2f6b4f, 0xefe6c8], [0xd2691e, 0xf3e9cf], [0x7a1f2b, 0xf0e2c0], [0xe0b43a, 0xf6f1e2], [0x34507a, 0xe9e6dc]];
const ROLE = { paintA: 0, paintB: 1, glass: 2, dark: 3, roof: 4, wood: 5 };

// A box part with a `role` per vertex, in the vehicle's frame: x across, y up from the rail, z along (front +z)
function part(w, h, d, x, y, z, role, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  g.setAttribute('role', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(role), 1));
  g.deleteAttribute('uv');
  return g;
}

// F-line style streetcar: a single body on two trucks, a window band all round, a clerestory roof and a trolley pole
function buildStreetcarGeometry() {
  const L = KINDS.streetcar.len, W = 2.6;
  return mergeGeometries([
    part(W, 1.1, L, 0, 1.15, 0, ROLE.paintA), // lower body
    part(W + 0.02, 1.05, L - 0.6, 0, 2.25, 0, ROLE.glass), // window band
    part(W, 0.12, L - 0.4, 0, 1.75, 0, ROLE.paintB), // belt rail under the windows
    part(W, 0.35, L - 0.2, 0, 2.95, 0, ROLE.paintB), // letterboard over them
    part(W - 0.2, 0.3, L - 0.6, 0, 3.27, 0, ROLE.roof), // roof
    part(1.2, 0.18, L * 0.55, 0, 3.5, 0, ROLE.roof), // clerestory
    part(0.08, 0.08, 6.0, 0, 4.4, -2.6, ROLE.dark, -0.32), // trolley pole, raised back to the wire
    part(W - 0.4, 0.55, 2.2, 0, 0.45, L * 0.33, ROLE.dark), // trucks
    part(W - 0.4, 0.55, 2.2, 0, 0.45, -L * 0.33, ROLE.dark)
  ]);
}
// Muni Metro two-section light-rail car: silver with a red stripe under the windows, an articulation in the middle
function buildLightRailGeometry() {
  const L = KINDS.lightrail.len, W = 2.7, S = L / 2 - 0.5;
  const parts = [];
  for (const z of [-L / 4 - 0.25, L / 4 + 0.25]) {
    parts.push(part(W, 1.15, S, 0, 1.2, z, ROLE.paintA));
    parts.push(part(W, 0.22, S, 0, 1.85, z, ROLE.paintB));
    parts.push(part(W + 0.02, 1.05, S - 0.4, 0, 2.5, z, ROLE.glass));
    parts.push(part(W, 0.4, S, 0, 3.2, z, ROLE.paintA));
    parts.push(part(W - 0.3, 0.3, S - 1, 0, 3.55, z, ROLE.roof));
  }
  parts.push(part(W - 0.3, 2.6, 1.0, 0, 1.95, 0, ROLE.dark)); // articulation bellows
  parts.push(part(0.08, 0.08, 1.6, 0, 4.1, 0, ROLE.dark, -0.6)); // pantograph arm
  for (const z of [-L * 0.38, 0, L * 0.38]) parts.push(part(W - 0.5, 0.55, 2.2, 0, 0.45, z, ROLE.dark));
  return mergeGeometries(parts);
}
// Cable car: an enclosed cabin in the middle, open ends with outward benches and corner posts under one long roof,
// running boards along the sides, the grip man's lever in the middle of the open end
function buildCableCarGeometry() {
  const L = KINDS.cablecar.len, W = 2.45;
  const parts = [
    part(W, 0.3, L, 0, 0.75, 0, ROLE.paintA), // deck & side sills
    part(W + 0.5, 0.06, L - 1.2, 0, 0.5, 0, ROLE.wood), // running boards
    part(W, 1.0, 3.6, 0, 1.4, 0, ROLE.paintB), // cabin: lower panels
    part(W + 0.02, 0.9, 3.4, 0, 2.35, 0, ROLE.glass), // cabin windows
    part(W, 0.22, 3.6, 0, 2.9, 0, ROLE.paintA), // cabin letterboard
    part(W + 0.2, 0.14, L + 0.2, 0, 3.08, 0, ROLE.paintB), // roof
    part(1.4, 0.24, L - 1.6, 0, 3.27, 0, ROLE.paintB), // clerestory
    part(W + 0.24, 0.1, L + 0.24, 0, 2.98, 0, ROLE.wood) // trim under the roof (the light-blue band is paintB's edge)
  ];
  for (const sz of [-1, 1]) {
    const zEnd = sz * (L / 2 - 0.1), zMid = sz * 2.95;
    for (const sx of [-1, 1]) {
      parts.push(part(0.1, 2.2, 0.1, sx * (W / 2 - 0.08), 2.0, zEnd, ROLE.paintA)); // corner posts
      parts.push(part(0.1, 2.2, 0.1, sx * (W / 2 - 0.08), 2.0, sz * 1.85, ROLE.paintA));
      parts.push(part(0.45, 0.45, 2.0, sx * (W / 2 - 0.3), 1.12, zMid, ROLE.wood)); // outward benches
    }
    parts.push(part(W - 0.2, 0.75, 0.1, 0, 1.28, zEnd, ROLE.paintA)); // dash panel
    parts.push(part(0.06, 1.2, 0.06, 0.3, 1.5, sz * 2.0, ROLE.dark)); // grip lever
  }
  for (const z of [-L * 0.3, L * 0.3]) parts.push(part(W - 0.4, 0.5, 1.4, 0, 0.35, z, ROLE.dark)); // trucks
  return mergeGeometries(parts);
}

function createRailVehicleMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.2 });
  const role = attribute('role', 'float');
  const a = attribute('liveryA', 'vec3');
  const b = attribute('liveryB', 'vec3');
  const is = (r) => step(r - 0.5, role).mul(step(role, r + 0.5));
  const glass = is(ROLE.glass);
  mat.colorNode = Fn(() => {
    let c = mix(a, b, is(ROLE.paintB));
    c = mix(c, color(0x1a2430), glass);
    c = mix(c, color(0x1c1e21), is(ROLE.dark));
    c = mix(c, color(0x8d9196), is(ROLE.roof));
    c = mix(c, color(0x6b4a2e), is(ROLE.wood));
    return c;
  })();
  mat.roughnessNode = mix(float(0.55), float(0.12), glass);
  // lit cabins after dark
  mat.emissiveNode = vec3(1.0, 0.86, 0.62).mul(glass).mul(smoothstep(0.4, 1.1, cityUniforms.uInteriorGlow).mul(0.55));
  return mat;
}

function buildSFTransit(scene) {
  const group = new THREE.Group();
  group.name = 'SFTransit';
  const T = window.NYC.Terrain;
  const G = window.NYC.GradeSeparation;
  // rail height: the ground (+ a curb island's or rail median's height), or the bridge deck the line crosses
  const railY = (x, z) => {
    const g = T && T.loaded ? T.groundAt(x, z) : 0;
    const deck = G && G.floorAt ? G.floorAt(x, z, g + 12) : null;
    if (deck !== null && deck !== undefined && deck > g + 0.5) return deck;
    return g + (blockAt(x, z) ? CURB_H : 0);
  };

  // Runs (dropping a run that repeats one already kept, e.g. the S on the N's track), with their arc lengths
  const runs = [];
  for (const r of window.NYC.GEO.transit || []) {
    const P = r.pts;
    const pts = [];
    for (let i = 0; i < P.length; i += 2) pts.push([P[i], P[i + 1]]);
    const end = pts[pts.length - 1];
    if (runs.some((o) => o.kind === r.kind && Math.hypot(o.pts[0][0] - pts[0][0], o.pts[0][1] - pts[0][1]) < 30 && Math.hypot(o.end[0] - end[0], o.end[1] - end[1]) < 30)) continue;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    runs.push({ name: r.name, kind: r.kind, pts, cum, len: cum[cum.length - 1], end, stops: r.stops, vehicles: [] });
  }
  const at = (run, s, out) => {
    s = Math.max(0, Math.min(run.len, s));
    let lo = 0, hi = run.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (run.cum[m] <= s) lo = m; else hi = m; }
    const L = run.cum[hi] - run.cum[lo] || 1e-6;
    const t = (s - run.cum[lo]) / L;
    const [ax, az] = run.pts[lo], [bx, bz] = run.pts[hi];
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    return out;
  };

  // Vehicles: spread along each run, every one at a stop or cruising
  const vehicles = [];
  let seed = 4021;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const run of runs) {
    const K = KINDS[run.kind];
    const n = Math.max(1, Math.round(run.len / K.spacing));
    for (let k = 0; k < n; k++) {
      const v = { run, K, s: (run.len * (k + rand() * 0.5)) / n, v: K.v, dwell: 0, nextStop: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      v.nextStop = run.stops.findIndex((st) => st > v.s + 1);
      run.vehicles.push(v);
      vehicles.push(v);
    }
    run.vehicles.sort((p, q) => p.s - q.s);
  }

  // Meshes: one instanced mesh per kind, liveries per instance
  const material = createRailVehicleMaterial();
  const geos = { streetcar: buildStreetcarGeometry(), lightrail: buildLightRailGeometry(), cablecar: buildCableCarGeometry() };
  const meshes = {};
  const col = new THREE.Color();
  for (const kind of Object.keys(KINDS)) {
    const list = vehicles.filter((v) => v.K === KINDS[kind]);
    if (!list.length) continue;
    const geo = geos[kind];
    const A = new Float32Array(list.length * 3), B = new Float32Array(list.length * 3);
    list.forEach((v, i) => {
      let pair;
      if (kind === 'streetcar') pair = STREETCAR_LIVERIES[i % STREETCAR_LIVERIES.length];
      else if (kind === 'lightrail') pair = [0xc3c8cd, 0xbe1e2d];
      else pair = [0x7b1e2a, i % 4 === 3 ? 0x8fb8d8 : 0xece2c6];
      col.setHex(pair[0]).toArray(A, i * 3);
      col.setHex(pair[1]).toArray(B, i * 3);
    });
    geo.setAttribute('liveryA', new THREE.InstancedBufferAttribute(A, 3));
    geo.setAttribute('liveryB', new THREE.InstancedBufferAttribute(B, 3));
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    mesh.name = `Transit_${kind}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // vehicles move across the whole core
    group.add(mesh);
    meshes[kind] = { mesh, list };
  }
  scene.add(group);

  const p = { x: 0, z: 0 }, q = { x: 0, z: 0 };
  const dummy = new THREE.Object3D();
  function place(v) {
    const half = v.K.len * 0.38;
    at(v.run, v.s + half, p);
    at(v.run, v.s - half, q);
    const yf = railY(p.x, p.z), yr = railY(q.x, q.z);
    v.x = (p.x + q.x) / 2;
    v.z = (p.z + q.z) / 2;
    v.y = (yf + yr) / 2;
    v.yaw = Math.atan2(p.x - q.x, p.z - q.z);
    v.pitch = -Math.atan2(yf - yr, half * 2);
  }

  function update(dt) {
    for (const run of runs) {
      const vs = run.vehicles;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        const K = v.K;
        if (v.dwell > 0) { v.dwell -= dt; continue; }
        // the vehicle ahead on the run (the last one follows the first round the loop's restart)
        const lead = vs.length > 1 ? vs[(i + 1) % vs.length] : null;
        let room = Infinity;
        if (lead) room = (lead.s >= v.s ? lead.s - v.s : lead.s + run.len - v.s) - K.len - K.gap;
        const stop = v.nextStop >= 0 ? run.stops[v.nextStop] : Infinity;
        const toStop = stop - v.s;
        const brakeTo = Math.min(toStop, room);
        // the highest speed that can still stop in the distance left, capped by the cruise speed
        const vMax = Math.min(K.v, Math.sqrt(Math.max(0, 2 * K.b * Math.max(0, brakeTo))));
        v.v = v.v < vMax ? Math.min(vMax, v.v + K.a * dt) : vMax;
        v.s += v.v * dt;
        if (toStop - v.v * dt <= 0.3 && Number.isFinite(stop)) {
          v.s = stop;
          v.v = 0;
          v.dwell = K.dwell * (0.7 + 0.6 * ((v.s * 13.7) % 1));
          v.nextStop = v.nextStop + 1 < run.stops.length ? v.nextStop + 1 : -1;
        }
        if (v.s >= run.len) {
          v.s -= run.len;
          v.nextStop = run.stops.findIndex((st) => st > v.s + 1);
        }
      }
      vs.sort((a, b) => a.s - b.s);
    }
    for (const { mesh, list } of Object.values(meshes)) {
      list.forEach((v, i) => {
        place(v);
        dummy.position.set(v.x, v.y, v.z);
        dummy.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  update(0);
  console.info(`[details] transit: ${runs.length} runs, ${vehicles.length} vehicles (${Object.entries(meshes).map(([k, m]) => `${m.list.length} ${k}`).join(', ')})`);
  return { group, update, runs, vehicles };
}

Object.assign(window.NYC, { buildSFTransit });
})();
