(function () {
// js/main.js
// Main entry point for San Francisco in Three.js WebGPURenderer & TSL (three.js dev, see index.html)

const { THREE } = window.NYC;
const {
  pass,
  mrt,
  output,
  normalView,
  positionView,
  metalness,
  roughness,
  vec2,
  vec4,
  smoothstep
} = window.NYC.TSL;
const { ssr } = window.NYC.PostFX;
const { createPostProcessing } = window.NYC;
const { ClusteredLighting } = window.NYC.Addons;

const { getLocationLabel, isTypingInField } = window.NYC;
const { buildSFRegion } = window.NYC;
const { buildLandmarks } = window.NYC;
const { buildCityBlocks } = window.NYC;
const { createTrafficSystem, createHighwayTraffic } = window.NYC;
const { buildRoadPaint } = window.NYC;
const { ThirdPersonControllerManager } = window.NYC;
const { TouchControls } = window.NYC;
const { CameraSystem, CAMERA_PRESETS } = window.NYC;
const { LightingSystem } = window.NYC;
const { NYCMapSystem } = window.NYC;
const { setupSceneCulling, updateSceneCulling } = window.NYC;
const { loadCityData, buildSFGround, buildRoadNetwork, buildSFStreetDetails, buildGradeSeparation } = window.NYC;

// Scripted camera paths for ?bench=name: keyframes [x, y, z, yawDeg, pitchDeg] spread evenly over BENCH_SECONDS
// (yaw 0 looks north, -z). Coordinates are in the current city's world frame.
const BENCH_SECONDS = new URLSearchParams(location.search).has('fogCompare') ? 40 : 20;
// San Francisco slice: street = up Grant Ave through Chinatown, car = along California St from Nob Hill to the Financial
// District, heli = a loop around the slice, hill = a turn on the spot at Nob Hill; the core (P3.6): russian-hill-view = a
// turn on the spot on Russian Hill's summit (Vallejo & Florence St, 110 m), across the whole core and the bay. The y of the
// paths in BENCH_ON_GROUND is height above the ground (Terrain.groundAt), the others' absolute
const BENCH_ON_GROUND = new Set(['street', 'car', 'hill', 'russian-hill-view', 'twin-peaks-view']);
const BENCH_PATHS = {
  'twin-peaks-view': [[-4020, 20, 3810, 0, -6], [-4020, 20, 3810, 360, -6]],
  'heli-city': [[-7000, 650, 4500, 15, -25], [-6000, 650, 0, 90, -25], [-2000, 650, -1500, 180, -25], [-1000, 650, 4000, 270, -25]],
  street: [[-391, 1.7, -727, 9, 0], [-446, 1.7, -1073, 9, 0]],
  car: [[-902, 1.4, -325, -99, -2], [-612, 1.4, -371, -99, -2], [400, 1.4, -531, -99, -2]],
  heli: [[-300, 300, 400, 0, -25], [500, 320, -400, 90, -25], [-300, 340, -1200, 180, -25], [-1100, 320, -400, 270, -25], [-300, 300, 400, 360, -25]],
  hill: [[-950, 8, -330, 0, -4], [-950, 8, -330, 360, -4]],
  'russian-hill-view': [[-1116, 8, -1052, 0, -4], [-1116, 8, -1052, 360, -4]]
};
function samplePath(keys, u) {
  const f = u * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(f));
  const t = f - i;
  const [a, b] = [keys[i], keys[i + 1]];
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return { x: mix(0), y: mix(1), z: mix(2), yaw: mix(3), pitch: mix(4) };
}

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingTrack = loadingOverlay ? loadingOverlay.querySelector('.loader-track') : null;
  const loadingFill = document.getElementById('loading-progress');
  // The loading bar sweeps while the city is being built (the main thread is busy) and fills as the shaders compile
  const setLoadingProgress = (p) => {
    if (!loadingFill) return;
    if (loadingTrack) loadingTrack.classList.remove('is-indeterminate');
    loadingFill.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  };

  if (loadingStatus) {
    loadingStatus.textContent = `Initializing Three.js r${THREE.REVISION} WebGPURenderer & TSL Shaders...`;
  }

  if (!navigator.gpu || new URLSearchParams(location.search).get('webgpu') === '0') {
    showBootError('WebGPU is unavailable. Use a WebGPU-enabled browser with hardware acceleration, and open this site over HTTPS or localhost.');
    return;
  }

  // 1. Initialize Three.js WebGPURenderer with 32-bit float reversedDepthBuffer
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    powerPreference: 'high-performance',
    reversedDepthBuffer: true,
    trackTimestamp: new URLSearchParams(location.search).has('gpuTiming')
  });
  renderer.setPixelRatio(1.0);
  const benchmarkResolution = ['bench', 'capture', 'showcase'].some(key => new URLSearchParams(location.search).has(key)) || new URLSearchParams(location.search).get('debug')==='collisions';
  const renderSize = () => benchmarkResolution ? [1280, 720] : [window.innerWidth, window.innerHeight];
  renderer.setSize(...renderSize());
  if (benchmarkResolution) { renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.domElement.style.objectFit = 'contain'; }
  renderer.shadowMap.enabled = true;
  if (ClusteredLighting) {
    renderer.lighting = new ClusteredLighting(256, 32, 28, 48);
  }
  container.appendChild(renderer.domElement);

  // Start-up phase timings (logged once as "[init] ...") to keep load-time regressions traceable
  let initTimings = [];
  let initMark = performance.now();
  const markInit = (label) => {
    const now = performance.now();
    initTimings.push(`${label} ${Math.round(now - initMark)}ms`);
    initMark = now;
  };

  await renderer.init();
  markInit('renderer');

  // 2. Build Scene & Physical Atmospheric Sky / PMREM IBL / 4096x4096 Shadow Lighting
  const scene = new THREE.Scene();
  const lightingSystem = new LightingSystem(scene, renderer);
  markInit('lighting');

  if (loadingStatus) {
    loadingStatus.textContent = 'Loading San Francisco terrain & buildings...';
  }
  await loadCityData(setLoadingProgress);
  markInit('data');
  if (loadingStatus) {
    loadingStatus.textContent = 'Building San Francisco streets & buildings...';
  }

  // 3. Build the city: ground & curb islands, buildings, street details & traffic
  const cityGrid = buildSFGround(scene);
  markInit('cityGrid');
  const region = buildSFRegion(scene);
  markInit('region');
  const { colliders: landmarkColliders } = buildLandmarks(scene);
  // The Golden Gate and Bay bridges (sf-bridges.js, P5.2); the Bay Bridge's decks carry the I-80 freeway (grade-separation.js)
  const bridges = window.NYC.buildSFBridges(scene);
  window.NYC.bridgeDeckAt = bridges.bridgeDeckAt;
  landmarkColliders.push(...bridges.colliders);
  markInit('landmarks');
  const cityBlocks = buildCityBlocks(scene, { sf: true });
  markInit('blocks');
  const allColliders = [...landmarkColliders, ...cityBlocks.colliders, ...(cityGrid.colliders || [])];

  // The road network (road-network.js), for the street furniture & the traffic built on it. Buildings turned along
  // non-grid streets have oriented colliders whose world bounds reach past their lots: they stay inside the property
  // line anyway, so the network (lanes & sidewalks) doesn't need them
  // The street network and everything on it stand on the core's terrain only: the regional terrain patches
  // must not turn streets past its edge into land
  window.NYC.Terrain.patchesEnabled = false;
  const roadNetwork = buildRoadNetwork(cityGrid.sidewalks, [...cityGrid.footprints, ...allColliders.filter((c) => !c.obb)]);
  markInit('roads');
  const streetDetails = buildSFStreetDetails(scene, roadNetwork);
  markInit('streetDetails');
  const trafficSystem = createTrafficSystem(scene, cityGrid.sidewalks, [], { network: roadNetwork });
  markInit('traffic');
  // Tunnels, bridges and freeway decks (grade-separation.js): their floors for the player and the cameras, their walls
  // and columns as colliders, the freeways' lanes for the highway traffic
  const gradeSeparation = roadNetwork
    ? buildGradeSeparation(scene, roadNetwork)
    : { colliders: [], highwayLanes: [], floorAt: () => null, roofAt: () => Infinity };
  window.NYC.GradeSeparation = gradeSeparation;
  if (cityGrid.terrain) cityGrid.terrain.rebuild(); // the portals carved
  markInit('grade');
  const highwayTraffic = createHighwayTraffic(scene, gradeSeparation.highwayLanes);
  // Streetcars, light rail & cable cars on the Muni route runs (sf-transit.js, P4.6)
  const transit = window.NYC.buildSFTransit(scene);
  // ?debug=roads: the road network's lanes, junction curves, arms & control drawn over the ground (road-network.js)
  if (new URLSearchParams(location.search).get('debug') === 'roads') {
    scene.add(window.NYC.buildRoadDebug(roadNetwork || buildRoadNetwork(cityGrid.sidewalks, [])));
  }
  if (trafficSystem.network) buildRoadPaint(scene, trafficSystem.network);
  window.NYC.Terrain.patchesEnabled = true;
  markInit('roadPaint');

  // 4. Initialize Third-Person Controllers (Person, Car, Cyclist, Helicopter) & Multi-Camera System
  // Outline buildings retain their exact rendered polygon; compound landmark parts remain separate.
  const controllerManager = new ThirdPersonControllerManager(scene, [...allColliders.flatMap((c) => c.parts || [c]), ...gradeSeparation.colliders]);
  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  cameraSystem.onResize(...renderSize());
  const touchControls = new TouchControls(controllerManager);
  markInit('controllers');

  // Island-wide static geometry: chunk & distance-cull the small props, shadow stand-ins for the big casters
  // (scene-culling.js)
  const cullingRoots = ['ManhattanCityGrid', 'ManhattanCityBlocks', 'ManhattanStreetDetails', 'ManhattanLandmarks', 'Boroughs', 'SFGround', 'SFBuildings', 'SFStreetDetails', 'SFLandmarks', 'SFBridges']
    .map((name) => scene.getObjectByName(name))
    .filter(Boolean);
  const cullingStats = setupSceneCulling(scene, cullingRoots, lightingSystem.sunLight.shadow);
  markInit('culling');

  // Small InstancedMeshes (<= 1000 instances) keep their matrices in uniform buffers that three.js
  // re-uploads on every draw of every pass (~2.5 MB/frame with the shadow cascades, stalling the GPU queue).
  // Storage attributes are only uploaded when instanceMatrix.needsUpdate is set.
  scene.traverse((object) => {
    if (object.isInstancedMesh) {
      object.instanceMatrix = new THREE.StorageInstancedBufferAttribute(object.instanceMatrix.array, 16);
    }
  });

  // 5. TSL RenderPipeline with Half-Res Screen Space Reflections (SSRNode), Bloom & Filmic Toning
  //    SSR skips pixels with zero metalness, so fading it out with distance spares the far facades
  const scenePass = pass(scene, cameraSystem.camera);
  // The multisampled colour attachments (output, normal, metalRough) only need resolving, never storing: discarding
  // them spares the GPU writing 3 x 4 samples per pixel to memory every frame (transient, memoryless attachments where
  // the browser supports them). The multisampled depth stays stored: SSR reads it.
  scenePass.renderTarget.storeMultisampledColorBuffer = false;
  const ssrFade = smoothstep(360.0, 180.0, positionView.z.negate());
  const sceneMRT = mrt({
    output: output,
    normal: normalView,
    metalRough: vec2(metalness.mul(ssrFade), roughness)
  });
  sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
  sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
  scenePass.setMRT(sceneMRT);

  const scenePassColor = scenePass.getTextureNode('output');
  const scenePassDepth = scenePass.getTextureNode('depth');
  const scenePassNormal = scenePass.getTextureNode('normal');
  const scenePassMetalRough = scenePass.getTextureNode('metalRough');

  const ssrPass = ssr(scenePassColor, scenePassDepth, scenePassNormal, {
    metalnessNode: scenePassMetalRough.r,
    roughnessNode: scenePassMetalRough.g,
    camera: cameraSystem.camera
  });
  ssrPass.resolutionScale = 0.5;
  ssrPass.blurQuality = 1;
  ssrPass.maxDistance.value = 42;
  ssrPass.thickness.value = 0.85;
  ssrPass.quality.value = 0.35;
  ssrPass.intensity.value = 0.50;
  ssrPass.screenEdgeFadeBlack = true;

  let colorGrade = createPostProcessing(renderer, scenePassColor, ssrPass, scenePassDepth, cameraSystem.camera, lightingSystem);
  let { bloomPass } = colorGrade;
  let renderPipeline = new THREE.RenderPipeline(renderer, colorGrade.outputNode);

  const pipelineCache = new Map([[true, { colorGrade, bloomPass, renderPipeline }]]);
  let paused = false, pauseDirty = false;
  function setShadows(enabled) {
    if (lightingSystem.sunLight.castShadow === enabled) return;
    lightingSystem.sunLight.castShadow = enabled;
    scene.traverse(object => {
      for (const material of [].concat(object.material || [])) material.needsUpdate = true;
    });
    pauseDirty = true;
  }
  function applyQuality(id) {
    const q = window.NYC.QUALITY_PRESETS[id];
    region.setQuality?.(q.distance, q.trees);
    ssrPass.resolutionScale = q.reflectionScale;
    setShadows(q.shadows);
    if (!pipelineCache.has(q.reflections)) {
      const grade = createPostProcessing(renderer, scenePassColor, vec4(0), scenePassDepth, cameraSystem.camera, lightingSystem);
      pipelineCache.set(false, { colorGrade: grade, bloomPass: grade.bloomPass, renderPipeline: new THREE.RenderPipeline(renderer, grade.outputNode) });
    }
    const fogEnabled = colorGrade.fogEnabled.value;
    ({ colorGrade, bloomPass, renderPipeline } = pipelineCache.get(q.reflections));
    colorGrade.fogEnabled.value = fogEnabled;
    colorGrade.applyPreset(lightingSystem.activePresetId);
    document.body.dataset.quality = id;
    if (window.__NYC_APP) {
      window.__NYC_APP.renderPipeline = renderPipeline;
      Object.assign(window.__NYC_APP.postFX, { colorGrade, bloomPass });
    }
    pauseDirty = true;
  }

  // 6. Wire UI Controls (Strictly using safe DOM APIs: textContent, classList, addEventListener)
  const modeButtons = document.querySelectorAll('[data-mode]');
  const cameraButtons = document.querySelectorAll('[data-camera]');
  const timeButtons = document.querySelectorAll('[data-time]');
  const teleportButtons = document.querySelectorAll('[data-teleport]');
  const hudToggleBtn = document.getElementById('btn-toggle-hud');
  const modeSwitch = document.getElementById('mode-switch');
  touchControls.onAvailabilityChange = placeModeIndicator;

  const elFps = document.getElementById('hud-fps');
  const elMode = document.getElementById('hud-active-mode');
  const elCamera = document.getElementById('hud-active-camera');
  const elSpeed = document.getElementById('hud-speed');
  const elSpeedMeter = document.getElementById('hud-speed-meter');
  const elAltitude = document.getElementById('hud-altitude');
  const elLocation = document.getElementById('hud-location');
  const elControlsHint = document.getElementById('hud-controls-hint');

  // Keyboard guide for each mode: [keys, action] (the arrow keys work as W A S D, controllers.js bindKeyboard)
  const WS = ['W ↑', 'S ↓'], AD = ['A ←', 'D →'];
  const controlHints = {
    person: [[WS, 'Walk'], [AD, 'Turn'], [['Shift'], 'Sprint'], [['Space'], 'Jump'], [['R'], 'Reset to road'], [['Drag'], 'Orbit']],
    car: [[WS, 'Drive / Reverse'], [AD, 'Steer'], [['Shift'], 'Boost'], [['R'], 'Reset to road'], [['Drag'], 'Orbit']],
    cyclist: [[WS, 'Pedal / Brake'], [AD, 'Lean & Turn'], [['Shift'], 'Sprint'], [['R'], 'Reset to road'], [['Drag'], 'Orbit']],
    helicopter: [[WS, 'Pitch'], [AD, 'Yaw'], [['Space', 'E'], 'Ascend'], [['Q', 'C'], 'Descend'], [['Shift'], 'Boost']]
  };
  // Boosted top speeds in mph (controllers.js caps them at 8.2, 36, 19 & 52 m/s): full scale of the speed meter
  const topSpeedMph = { person: 18, car: 81, cyclist: 43, helicopter: 116 };

  function renderControlHints(mode) {
    if (!elControlsHint) return;
    const items = (controlHints[mode] || []).map(([keys, action]) => {
      const item = document.createElement('span');
      item.className = 'hint';
      for (const key of keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        item.appendChild(kbd);
      }
      const label = document.createElement('span');
      label.className = 'hint-label';
      label.textContent = action;
      item.appendChild(label);
      return item;
    });
    elControlsHint.replaceChildren(...items);
  }

  // The taxi-yellow pill under the selected mode glides from button to button
  function placeModeIndicator() {
    const active = modeSwitch ? modeSwitch.querySelector('.mode-btn.active') : null;
    if (!active) return;
    modeSwitch.style.setProperty('--ind-x', `${active.offsetLeft}px`);
    modeSwitch.style.setProperty('--ind-w', `${active.offsetWidth}px`);
  }

  let rideExperience = null;
  function selectMode(mode) {
    if (mode !== 'car') rideExperience?.cancel();
    controllerManager.setMode(mode);
    touchControls.setMode(controllerManager.activeMode);
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    document.body.dataset.mode = mode;
    placeModeIndicator();
    const ent = controllerManager.getActiveEntity();
    if (elMode) elMode.textContent = ent.label;
    renderControlHints(mode);

    // If currently on a static scenic camera, switch to 3rd-Person Chase so user sees their selected character/vehicle
    const currentCam = cameraSystem.getActivePreset();
    if (currentCam.category !== 'follow') {
      selectCamera('chase', false);
    }
  }

  function selectCamera(camId, snap = false) {
    cameraSystem.setCameraPreset(camId, snap);
    cameraButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-camera') === camId);
    });
    const preset = cameraSystem.getActivePreset();
    if (elCamera) elCamera.textContent = preset.name;
  }

  // Steps through CAMERA_PRESETS (V / Shift+V, and the arrows either side of the camera name)
  function cycleCamera(step) {
    const n = CAMERA_PRESETS.length;
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === cameraSystem.activePresetId);
    selectCamera(CAMERA_PRESETS[(idx + step + n) % n].id, true);
  }

  function selectTime(timeId) {
    lightingSystem.applyPreset(timeId);
    colorGrade.applyPreset(lightingSystem.activePresetId);
    timeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-time') === timeId);
    });
  }

  // Follow the real wrapped toolbar height; time labels, zoom and touch controls can change it.
  const topbar = document.querySelector('.hud-topbar');
  const placeHudContent = () => document.documentElement.style.setProperty(
    '--hud-content-top', `${Math.ceil(topbar.getBoundingClientRect().bottom) + 12}px`
  );
  new ResizeObserver(placeHudContent).observe(topbar);
  window.addEventListener('resize', placeHudContent);
  placeHudContent();

  // Popovers (native [popover]: light dismiss & Esc for free) open against the control that toggles them: data-anchor
  // names the element they sit above / below, data-align the one whose right edge they line up with
  const popovers = document.querySelectorAll('.popover[popover]');
  const supportsPopover = typeof HTMLElement.prototype.togglePopover === 'function';
  function closePopovers() {
    if (!supportsPopover) return;
    popovers.forEach((pop) => {
      if (pop.matches(':popover-open')) pop.hidePopover();
    });
  }
  popovers.forEach((pop) => {
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    pop.addEventListener('beforetoggle', (e) => {
      const open = e.newState === 'open';
      if (invoker) invoker.classList.toggle('is-open', open);
      if (!open) return;
      const anchor = document.getElementById(pop.dataset.anchor) || invoker;
      const align = document.getElementById(pop.dataset.align) || invoker;
      if (!anchor || !align) return;
      const r = anchor.getBoundingClientRect();
      const spaceAbove = Math.max(0, r.top - 20);
      const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 20);
      let above = pop.dataset.side === 'above';
      // The camera control moves to the top on touch screens; open toward the available space.
      if ((above ? spaceAbove : spaceBelow) < 160) above = spaceAbove > spaceBelow;
      pop.style.right = `${Math.max(8, window.innerWidth - align.getBoundingClientRect().right)}px`;
      if (above) {
        pop.style.top = 'auto';
        pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
        pop.style.maxHeight = `${spaceAbove}px`;
      } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${r.bottom + 8}px`;
        pop.style.maxHeight = `${spaceBelow}px`;
      }
    });
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectMode(btn.getAttribute('data-mode'));
    });
  });

  cameraButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectCamera(btn.getAttribute('data-camera'), true);
      closePopovers();
    });
  });

  const camPrevBtn = document.getElementById('cam-prev');
  const camNextBtn = document.getElementById('cam-next');
  if (camPrevBtn) camPrevBtn.addEventListener('click', () => cycleCamera(-1));
  if (camNextBtn) camNextBtn.addEventListener('click', () => cycleCamera(1));

  timeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTime(btn.getAttribute('data-time'));
    });
  });

  // A mouse click mustn't leave the focus on a HUD button, or Space (jump / ascend) and Enter would press it again
  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (btn && e.detail > 0) btn.blur();
  });

  // Where you are: the place's name over its street corner, drawn as a pair of NYC street-name signs
  const roadNames = new Set(window.NYC.ROADS.map((r) => r.name));
  const placeNames = new Set(window.NYC.NYC_LANDMARKS.map((l) => l.name));
  let locationText = '';
  function renderLocation(label) {
    if (!elLocation || label === locationText) return;
    locationText = label;
    let place = '';
    let streets = label;
    const split = label.indexOf(' · ');
    if (split >= 0) {
      place = label.slice(0, split);
      streets = label.slice(split + 3);
    } else if (placeNames.has(label) || (!label.includes(' & ') && !roadNames.has(label))) {
      place = label;
      streets = '';
    }
    const nodes = [];
    if (place) {
      const el = document.createElement('div');
      el.className = 'location-place';
      el.textContent = place;
      nodes.push(el);
    }
    if (streets) {
      const row = document.createElement('div');
      row.className = 'location-signs';
      if (streets.startsWith('near ')) {
        streets = streets.slice(5);
        const near = document.createElement('span');
        near.className = 'location-near';
        near.textContent = 'near';
        row.appendChild(near);
      }
      for (const name of streets.split(' & ')) {
        const sign = document.createElement('span');
        sign.className = 'street-sign';
        sign.textContent = name;
        row.appendChild(sign);
      }
      nodes.push(row);
    }
    elLocation.replaceChildren(...nodes);
  }

  // No heading: face along the nearest street (controllers.js roadHeading)
  function teleportTo(x, z, heading = NaN) {
    rideExperience?.cancel();
    const box = window.NYC.GEO?.box;
    if (box && (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1)) selectMode('helicopter');
    const destination = controllerManager.teleportActiveTo(x, z, heading);
    touchControls.reset();
    cameraSystem.resetForTeleport();
    selectCamera('chase', true);
    mapSystem.waypoint = {
      x: destination.x,
      z: destination.z,
      name: getLocationLabel(destination.x, destination.z)
    };
    return destination;
  }

  const mapSystem = new NYCMapSystem({
    controllerManager,
    cameraSystem,
    trafficSystem,
    onToggle: (open) => {
      rideExperience?.setPaused(open || paused);
      controllerManager.resetInput();
      touchControls.setEnabled(!open);
      const mapHint = document.getElementById('fullmap-hover-info');
      if (open && touchControls.available && mapHint) {
        mapHint.textContent = 'Tap to teleport · Drag to pan · Use + / − to zoom';
      }
    },
    onTeleport: teleportTo
  });

  teleportButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-teleport');
      const loc = window.NYC.TELEPORT_LOCATIONS[key];
      if (loc) {
        if (loc.mode) selectMode(loc.mode);
        teleportTo(loc.x, loc.z, loc.heading);
      }
      closePopovers();
    });
  });

  const openMapBtn = document.getElementById('btn-open-map');
  if (openMapBtn) openMapBtn.addEventListener('click', () => mapSystem.toggleFullMap(true));

  if (hudToggleBtn) {
    hudToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('hud-minimized');
      const isMin = document.body.classList.contains('hud-minimized');
      hudToggleBtn.setAttribute('aria-pressed', String(isMin));
      hudToggleBtn.setAttribute('aria-label', isMin ? 'Show HUD' : 'Hide HUD');
      hudToggleBtn.title = isMin ? 'Show the HUD [H]' : 'Clean view: hide the HUD [H]';
      if (isMin) closePopovers();
    });
  }

  // Global keyboard shortcuts for modes (1-4), cameras (V / 5-0), and HUD (H)
  window.addEventListener('keydown', (e) => {
    if (isTypingInField(e)) return;
    switch (e.code) {
      case 'Digit1':
        selectMode('person');
        break;
      case 'Digit2':
        selectMode('car');
        break;
      case 'Digit3':
        selectMode('cyclist');
        break;
      case 'Digit4':
        selectMode('helicopter');
        break;
      case 'Digit5':
        selectCamera('chase', true);
        break;
      case 'Digit6':
        selectCamera('action', true);
        break;
      case 'Digit7':
        selectCamera('pov', true);
        break;
      case 'Digit8':
        selectCamera('fifthAve', true);
        break;
      case 'Digit9':
        selectCamera('timesSquare', true);
        break;
      case 'Digit0':
        selectCamera('chryslerGCT', true);
        break;
      case 'KeyR': {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || mapSystem.isFullMapOpen) break;
        e.preventDefault();
        const road = controllerManager.findRoadReset();
        if (road) teleportTo(road.x, road.z, road.heading);
        break;
      }
      case 'KeyV':
        cycleCamera(e.shiftKey ? -1 : 1);
        break;
      case 'KeyH':
        if (hudToggleBtn) hudToggleBtn.click();
        break;
    }
  });

  window.addEventListener('resize', () => {
    cameraSystem.onResize(...renderSize());
    renderer.setSize(...renderSize(), !benchmarkResolution);
    placeModeIndicator();
    if (mapSystem.isFullMapOpen) {
      mapSystem.resizeFullCanvas();
      mapSystem.renderFullMap();
    }
  });

  // Initialize default selection, overridable from the URL (debug & screenshot harness, see debugParams below):
  // ?mode=person|car|cyclist|heli  ?time=golden|midday|twilight|midnight  ?teleport=x,z,headingDeg  ?hud=0
  const urlParams = new URLSearchParams(location.search);
  const fogSelect = document.getElementById('fog-preset');
  lightingSystem.setFogPreset(urlParams.get('fog') || 'haze');
  fogSelect.value = lightingSystem.fogPreset;
  fogSelect.addEventListener('change', () => lightingSystem.setFogPreset(fogSelect.value));
  const urlMode = { heli: 'helicopter', helicopter: 'helicopter', person: 'person', car: 'car', cyclist: 'cyclist' }[urlParams.get('mode')];
  // Every player model starts parked on the ground at the first teleport (Market St), clear of buildings & each other
  const spawn = window.NYC.TELEPORT_LOCATIONS.market;
  if (spawn) {
    for (const mode of ['helicopter', 'cyclist', 'person', 'car']) {
      controllerManager.setMode(mode);
      controllerManager.teleportActiveTo(spawn.x, spawn.z, spawn.heading);
    }
  }
  selectMode(urlMode || 'car');
  selectCamera('chase', true);
  selectTime(['golden', 'midday', 'twilight', 'midnight'].includes(urlParams.get('time')) ? urlParams.get('time') : 'golden');
  // Benchmark-only baseline skips fog composition. Clear remains a light aerial haze.
  if (urlParams.get('fog') === 'off') colorGrade.fogEnabled.value = 0;
  if (urlParams.has('teleport')) {
    // a named destination (TELEPORT_LOCATIONS) or x,z,headingDeg
    const named = window.NYC.TELEPORT_LOCATIONS[urlParams.get('teleport')];
    const [tx, tz, th = 180] = urlParams.get('teleport').split(',').map(Number);
    if (named) { if(named.mode) selectMode(named.mode); teleportTo(named.x, named.z, named.heading); }
    else if (Number.isFinite(tx) && Number.isFinite(tz)) teleportTo(tx, tz, (th * Math.PI) / 180);
  }
  if (urlParams.get('hud') === '0') document.body.classList.add('hud-minimized');
  // the web fonts change the buttons' widths once they arrive
  if (document.fonts) document.fonts.ready.then(placeModeIndicator);
  markInit('ui');

  // The loading screen stays up while the shaders compile (precompileShaders() & the warm-up frame, see the loop) and
  // until the first frame is on screen
  if (loadingStatus) {
    loadingStatus.textContent = 'Compiling Shaders & Render Pipelines...';
  }

  const settings = window.NYC.createSettings({
    onPause(value) { rideExperience?.setPaused(value); paused=value; pauseDirty=true; controllerManager.resetInput(); touchControls.setEnabled(!value && !mapSystem.isFullMapOpen); },
    onTime(id) { selectTime(id); pauseDirty=true; },
    onFog(id) { lightingSystem.setFogPreset(id); fogSelect.value=id; pauseDirty=true; },
    onQuality: applyQuality,
    onShadows: setShadows,
    onTraffic(value) { trafficSystem.setDensity?.(value); pauseDirty=true; },
    getTime: () => lightingSystem.activePresetId,
    getFog: () => lightingSystem.fogPreset
  });
  const qualityParam = urlParams.get('quality');
  const requestedQuality = window.NYC.QUALITY_PRESETS[qualityParam] ? qualityParam : null;
  if (requestedQuality) settings.setQuality(requestedQuality);
  const autoFrames = []; let autoSeconds=0, autoDone=Boolean(requestedQuality || urlParams.has('bench') || urlParams.has('capture'));

  rideExperience = window.NYC.createRideExperience({
    scene, controller: controllerManager, map: mapSystem, traffic: trafficSystem,
    startAt(x,z,heading) { selectMode('car'); teleportTo(x,z,heading); }
  });
  document.addEventListener('visibilitychange', () => rideExperience.setPaused(document.hidden || paused || mapSystem.isFullMapOpen));

  // Debug & screenshot harness state (URL: ?cam=x,y,z,yawDeg,pitchDeg  ?freeze=1  ?bench=name):
  // `camera` pins the view to a fixed pose, `freeze` stops traffic, `bench` flies a scripted path (BENCH_PATHS) and logs
  // "[bench] name median_ms p95_ms fps" when done (also left in __NYC_APP.bench)
  // ?camGround=1: the ?cam y is height above the ground
  const fogCompare = urlParams.has('fogCompare');
  const fogBlocks = Array.from({ length: 8 }, () => []);
  const debugState = { camera: null, freeze: fogCompare || urlParams.get('freeze') === '1', bench: null };
  if (urlParams.has('cam')) {
    const [x, y, z, yaw = 0, pitch = 0] = urlParams.get('cam').split(',').map(Number);
    const y0 = urlParams.get('camGround') === '1' ? window.NYC.Terrain.groundAt(x, z) : 0;
    if ([x, y, z].every(Number.isFinite)) debugState.camera = { x, y: y + y0, z, yaw, pitch };
  }
  if (BENCH_PATHS[urlParams.get('bench')]) {
    const name = urlParams.get('bench');
    debugState.bench = { name, keys: BENCH_PATHS[name], onGround: BENCH_ON_GROUND.has(name), t: -2, frames: [], gpu: [] };
  }

  // Expose programmatic API for testing & inspection
  let currentFps = 60;
  window.__NYC_APP = {
    renderer,
    scene,
    renderPipeline,
    postFX: { scenePass, ssrPass, bloomPass, colorGrade },
    cullingStats,
    cityBlocks,
    quadtree: cityBlocks.quadtree,
    trafficSystem,
    highwayTraffic,
    controllerManager,
    touchControls,
    cameraSystem,
    lightingSystem,
    mapSystem,
    selectMode,
    selectCamera,
    cycleCamera,
    selectTime,
    getFps: () => currentFps,
    debug: {
      // draw calls, triangles & live counts for the probe (tools/dev/probe.mjs)
      stats: () => ({
        fps: currentFps,
        calls: renderer.info.render.drawCalls ?? renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        terrain: cityGrid.terrain ? cityGrid.terrain.stats() : null,
        region: region.stats(),
        gpuMB: gpuMegabytes()
      }),
      ride: () => rideExperience.summary(),
      heightAt: (x, z) => window.NYC.Terrain.heightAt(x, z),
      groundAt: (x, z) => window.NYC.Terrain.groundAt(x, z),
      teleport: (x, z, headingDeg = 180) => teleportTo(x, z, (headingDeg * Math.PI) / 180),
      setTime: selectTime,
      freeze: (on) => { debugState.freeze = !!on; },
      setCamera: (pose) => { debugState.camera = pose; }
    }
  };

  // GPU memory the scene's geometry and its materials' own data textures take, estimated from their CPU-side arrays
  // (each counted once; render targets, the shadow map and textures inside node graphs, such as the 1 m ground mask,
  // aren't included)
  function gpuMegabytes() {
    const seen = new Set();
    let bytes = 0;
    const add = (a) => {
      if (!a || seen.has(a)) return;
      seen.add(a);
      bytes += a.array ? a.array.byteLength : 0;
    };
    scene.traverse((o) => {
      const g = o.geometry;
      if (g) {
        add(g.index);
        for (const a of Object.values(g.attributes)) add(a);
      }
      if (o.isInstancedMesh) add(o.instanceMatrix);
      const m = o.material;
      for (const t of m ? Object.values(m).filter((v) => v && v.isTexture) : []) {
        if (!seen.has(t)) { seen.add(t); bytes += t.image?.data?.byteLength || 0; }
      }
    });
    return Math.round(bytes / 1e6);
  }

  // 6b. Shader pre-compilation behind the loading screen. compileAsync() builds the node graphs in slices and has the GPU
  //     process compile the pipelines in parallel, but after every 8 ms slice it waits for a rendered frame, which
  //     leaves the main thread idle about half the time while nothing else animates; several calls side by side keep
  //     it busy (warm cache: 2.1 s instead of 4.0 s). (Rendering straight away compiled ~500 pipelines one after
  //     another: ~25 s with a cold shader cache.)
  const COMPILE_POOL = 16;
  const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
  async function precompileShaders() {
    // An empty frame first: it sets up the post-processing chain, which configures the scene pass's render target
    // (MSAA samples, depth format), so the pipelines compiled below are the very ones the scene pass asks for
    scene.visible = false;
    renderPipeline.render();
    scene.visible = true;
    markInit('postFX');

    // Every visible object with frustum culling off (like the warm-up frame, see the loop). Plain meshes that share
    // a material share its shader, so one job compiles them in turn (the first build serves the rest); every
    // instanced mesh gets a build of its own
    const culled = [];
    const jobs = [];
    const jobByMaterial = new Map();
    scene.traverseVisible((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
      // chunks of one mesh share its pipeline (the first one compiles it) and the shadow stand-ins only ever draw in
      // the shadow maps (the warm-up frame compiles those)
      if (o.userData.sharesPipelineWith || o.userData.shadowProxy) return;
      if (o.isInstancedMesh || Array.isArray(o.material)) {
        jobs.push([o]);
        return;
      }
      let job = jobByMaterial.get(o.material);
      if (!job) {
        job = [];
        jobByMaterial.set(o.material, job);
        jobs.push(job);
      }
      job.push(o);
    });

    renderer.setRenderTarget(scenePass.renderTarget);
    renderer.setMRT(sceneMRT);
    const compile = async (object) => {
      // Each compile starts in a task of its own: compileAsync() keeps one precompilation state on the renderer,
      // which must not be mid-step for two of them in the same microtask checkpoint
      await nextTask();
      try {
        await renderer.compileAsync(object, cameraSystem.camera, scene);
      } catch (e) {
        console.warn('[compile]', e); // the warm-up frame compiles it instead
      }
    };
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        for (const object of job) await compile(object);
        done++;
        if (loadingStatus) {
          loadingStatus.textContent = `Compiling Shaders & Render Pipelines... ${Math.round((done / jobs.length) * 100)}%`;
        }
        setLoadingProgress(done / jobs.length);
      }
    };
    await Promise.all(Array.from({ length: COMPILE_POOL }, worker));
    renderer.setMRT(null);
    renderer.setRenderTarget(null);
    for (const o of culled) o.frustumCulled = true;
  }

  await precompileShaders();
  markInit('compile');

  // 6. Animation Loop
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let warmedUp = false; // see the first frame below

  if (elFps) elFps.textContent = '60';

  // Pins the camera to the ?cam pose, or flies the ?bench path once the city is on screen and records frame times
  function setCameraPose({ x, y, z, yaw, pitch }) {
    const cam = cameraSystem.camera;
    cameraSystem.currentPos.set(x, y, z);
    cam.position.set(x, y, z);
    cam.rotation.set((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0, 'YXZ');
    cam.updateMatrixWorld();
  }
  function updateDebugCamera(rawDt) {
    const b = debugState.bench;
    if (!b) {
      if (debugState.camera) setCameraPose(debugState.camera);
      return;
    }
    if (window.__NYC_APP.ready && !b.done) {
      b.t += rawDt;
      if (b.t >= 0) b.frames.push(rawDt * 1000);
      if (b.t >= BENCH_SECONDS) {
        b.done = true;
        const ms = b.frames.slice().sort((p, q) => p - q);
        const median = ms[Math.floor(ms.length / 2)];
        const p95 = ms[Math.floor(ms.length * 0.95)];
        window.__NYC_APP.bench = { name: b.name, medianMs: +median.toFixed(2), p95Ms: +p95.toFixed(2), fps: Math.round(1000 / median), frames: ms.length, width: renderer.domElement.width, height: renderer.domElement.height, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
        const gpu = b.gpu.slice().sort((a, c) => a - c);
        if (gpu.length) Object.assign(window.__NYC_APP.bench, { gpuMedianMs: +gpu[Math.floor(gpu.length / 2)].toFixed(3), gpuSamples: gpu.length });
        if (fogCompare) {
          const med = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
          const blocks = fogBlocks.map((samples, i) => ({ fog: [0, 1, 1, 0][i % 4], medianMs: med(samples), samples: samples.length }));
          const deltas = [0, 2, 4, 6].map(i => blocks[i].medianMs == null || blocks[i + 1].medianMs == null ? null :
            (blocks[i + 1].medianMs - blocks[i].medianMs) * (blocks[i + 1].fog ? 1 : -1));
          window.__NYC_APP.bench.fogComparison = { camera: debugState.camera || 'path-start', order: 'ABBAABBA', blocks, pairedDeltasMs: deltas, medianDeltaMs: med(deltas.filter(x => x !== null)) };
        }
        document.body.dataset.benchResult = JSON.stringify(window.__NYC_APP.bench);
        console.log(`[bench-details] ${JSON.stringify(window.__NYC_APP.bench)}`);
        console.log(`[bench-stats] ${JSON.stringify(window.__NYC_APP.debug.stats())}`);
        console.log(`[bench] ${b.name} median_ms=${median.toFixed(2)} p95_ms=${p95.toFixed(2)} fps=${Math.round(1000 / median)}`);
        if (urlParams.get('benchIdle') === '1') {
          renderer.setAnimationLoop(null);
          // Leave the complete scene resident while the browser has an opportunity to collect transient garbage.
          setTimeout(() => console.log(`[bench-idle] ${JSON.stringify({ name: b.name, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null })}`), 20000);
        }
      }
    }
    if (fogCompare) colorGrade.fogEnabled.value = [0, 1, 1, 0][Math.min(7, Math.floor(Math.max(0, b.t) / 5)) % 4];
    const pose = fogCompare && debugState.camera ? { ...debugState.camera } : samplePath(b.keys, fogCompare ? 0 : Math.min(1, Math.max(0, b.t / BENCH_SECONDS)));
    if (b.onGround && !(fogCompare && debugState.camera)) pose.y += window.NYC.Terrain.groundAt(pose.x, pose.z);
    setCameraPose(pose);
  }

  // Local, opt-in media tool; normal gameplay does not load the capture module.
  const showcase = urlParams.has('showcase')
    ? (await import('../tools/dev/showcase.mjs')).createShowcase({renderer,controller:controllerManager,cameraSystem,traffic:trafficSystem,selectMode})
    : null;
  const collisionReview=urlParams.get('debug')==='collisions'
    ? (await import('../tools/dev/collision-review.mjs')).createCollisionReview({scene,renderer,controller:controllerManager,cameraSystem,selectMode})
    : null;
  let gpuTimingPending = false;
  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    if (paused) {
      if (pauseDirty) { region.update(cameraSystem.camera, elapsed); lightingSystem.update(cameraSystem.currentPos, elapsed); renderPipeline.render(); pauseDirty=false; }
      return;
    }
    // Inspecting the route pauses the whole crossing, including AI traffic.
    // Braking only the taxi here could leave it rolling into a turning conflict.
    if (mapSystem.isFullMapOpen) { mapSystem.update(); return; }
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    elapsed = fogCompare ? 10 : elapsed + dt;

    // Update 3rd-person controllers, camera, signals, traffic & vehicle collisions, building LODs, and dynamic shadow focus
    rideExperience.update(dt, elapsed);
    controllerManager.update(dt, elapsed);
    showcase?.update(dt);
    cameraSystem.update(dt, elapsed);
    updateDebugCamera(rawDt);
    showcase?.camera();
    collisionReview?.update();
    // traffic divides by its step (traffic.js), so a frozen city still steps by a negligible 0.1 ms
    const trafficDt = debugState.freeze ? 1e-4 : dt;
    streetDetails.signalClock.value = elapsed;
    trafficSystem.update(
      trafficDt,
      elapsed,
      cameraSystem.currentPos,
      controllerManager.getActiveEntity(),
      controllerManager.activeMode,
      cameraSystem.camera
    );
    highwayTraffic.update(trafficDt, cameraSystem.camera, controllerManager.getActiveEntity(), controllerManager.activeMode);
    transit.update(debugState.freeze ? 0 : dt);
    bridges.update(cameraSystem.camera);
    region.update(cameraSystem.camera, elapsed);
    cityBlocks.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    if (cityBlocks.updateLights) cityBlocks.updateLights(cameraSystem.camera);
    if (streetDetails.update) streetDetails.update(cameraSystem.camera);
    lightingSystem.update(cameraSystem.currentPos, elapsed);
    mapSystem.update();
    if (warmedUp) updateSceneCulling(cameraSystem.camera.position); // the warm-up frame draws every chunk
    if (cityGrid.terrain) cityGrid.terrain.update(cameraSystem.camera.position, elapsed);

    // Render frame via TSL RenderPipeline (SSR + Bloom)
    if (!warmedUp) {
      // First frame = pipeline warm-up behind the loading screen, for what precompileShaders() can't reach (the shadow
      // map passes): with frustum culling off, every visible material's pipelines compile now instead of stalling the
      // first time the camera turns towards it (one chunk / shadow stand-in per shared pipeline is enough)
      const culled = [];
      scene.traverse((o) => {
        if (o.frustumCulled && !o.userData.sharesPipelineWith) {
          culled.push(o);
          o.frustumCulled = false;
        }
      });
      renderPipeline.render();
      for (const o of culled) o.frustumCulled = true;
      markInit('warmup');
    }
    renderPipeline.render();
    if (warmedUp && window.__NYC_APP.ready && !autoDone) {
      autoSeconds += rawDt; autoFrames.push(rawDt * 1000);
      if (autoSeconds >= 3) { autoDone=true; settings.setAutomatic(window.NYC.chooseQuality(autoFrames)); }
    }
    showcase?.afterRender(window.__NYC_APP.ready);
    const timedBench = debugState.bench;
    if (warmedUp && renderer.backend.trackTimestamp && timedBench && !timedBench.done && !gpuTimingPending) {
      gpuTimingPending = true;
      const block = Math.floor(timedBench.t / 5);
      const settledBlock = fogCompare && timedBench.t >= 0 && timedBench.t % 5 >= 1 && block < 8;
      renderer.resolveTimestampsAsync().then(ms => {
        if (settledBlock && !timedBench.done && Number.isFinite(ms)) fogBlocks[block].push(ms);
        if (timedBench.t >= 0 && !timedBench.done && Number.isFinite(ms)) timedBench.gpu.push(ms);
      }).catch(error => console.warn('GPU timing unavailable:', error.message)).finally(() => { gpuTimingPending = false; });
    }
    if (!warmedUp) {
      warmedUp = true;
      markInit('firstFrame');
      // The loading screen stays up until the GPU has got through the first frame (and the pipelines its warm-up
      // compiled), i.e. until the city is actually on screen
      const device = renderer.backend.device;
      Promise.resolve(device && device.queue.onSubmittedWorkDone()).catch(() => {}).then(() => {
        markInit('gpu');
        console.log(`[init] ${initTimings.join(', ')}`);
        initTimings = null;
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        setLoadingProgress(1);
        window.__NYC_APP.ready = true;
        // A still preview keeps its WebGPU context but releases the GPU between screenshot reviews.
        if (urlParams.get('still') === '1' || urlParams.get('capture') === '1') renderer.setAnimationLoop(null);
        // Review-only export: the canvas is fixed at 1280×720 even in a narrow preview tab.
        if (urlParams.get('capture') === '1') {
          const image = document.createElement('img');
          image.id = 'review-capture';
          image.alt = 'San Francisco review capture';
          image.src = renderer.domElement.toDataURL('image/png');
          image.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#111;z-index:10000';
          document.body.appendChild(image);
        }
      });
    }

    // Telemetry uses wall time, not the clamped simulation step, so slow frames and high-refresh displays report
    // their actual frame rate (updates DOM every 250ms).
    frameCount++;
    fpsTimer += Math.max(0, rawDt);
    if (fpsTimer >= 0.25) {
      currentFps = Math.round(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer = 0;

      const activeEnt = controllerManager.getActiveEntity();
      const mode = controllerManager.activeMode;
      const mph = Math.round(Math.abs(activeEnt.speed) * 2.237);
      const altFt = Math.max(0, Math.round(activeEnt.position.y * 3.281));

      if (elFps) {
        elFps.textContent = String(currentFps);
        elFps.className = currentFps >= 50 ? 'fps-ok' : currentFps >= 30 ? 'fps-warn' : 'fps-bad';
      }
      if (elSpeed) elSpeed.textContent = String(mph);
      if (elSpeedMeter) elSpeedMeter.style.transform = `scaleX(${Math.min(1, mph / (topSpeedMph[mode] || 80))})`;
      document.body.classList.toggle('is-boosting', controllerManager.keys.boost && mph > 0);
      if (elAltitude) elAltitude.textContent = altFt.toLocaleString('en-US');
      // The street corner of the player on the follow cameras, of the camera itself on the scenic ones
      const where = cameraSystem.getActivePreset().category === 'follow' ? activeEnt.position : cameraSystem.currentPos;
      renderLocation(getLocationLabel(where.x, where.z));
    }
  });
}

function showBootError(message) {
  const overlay = document.getElementById('loading-overlay');
  overlay?.classList.remove('hidden');
  overlay?.classList.add('boot-error');
  for (const hud of document.querySelectorAll('.hud')) hud.inert = true;
  const status = document.getElementById('loading-status');
  if (status) { status.textContent=message; status.setAttribute('role','alert'); }
  const track = overlay?.querySelector('.loader-track'); if(track) track.hidden=true;
  const retry = document.createElement('button'); retry.textContent='Try again'; retry.type='button'; retry.className='tool-btn';
  retry.addEventListener('click', () => location.reload()); status?.after(retry);
}
initApp().catch(error => { console.error('City initialization failed:', error); showBootError('The city could not start. Check your connection and WebGPU support, then try again.'); });

})();
