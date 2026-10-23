(function () {
// js/cameras.js
// Multi-camera system supporting Third-Person Chase (with mouse/touch orbit + zoom),
// Low-Angle Action Cam, POV/Cockpit Cam, San Francisco Landmark Cameras, and Auto-Director Drone.

const { THREE } = window.NYC;
// The ground under (x, z) (js/terrain.js), 0 before the terrain is loaded; cameras stay CAMERA_CLEARANCE above it. In a
// tunnel or on a bridge (grade-separation.js, picked by the followed entity's height, `level`) its floor, and the
// cameras stay under a tunnel's roof
const level = { y: null };
const groundY = (x, z) => {
  const T = window.NYC.Terrain;
  if (!(T && T.loaded)) return 0;
  const G = window.NYC.GradeSeparation;
  const d = G && level.y !== null ? G.floorAt(x, z, level.y) : null;
  return d !== null ? d : T.groundAt(x, z);
};
const roofY = (x, z) => {
  const G = window.NYC.GradeSeparation;
  return G && level.y !== null ? G.roofAt(x, z, level.y) : Infinity;
};
const CAMERA_CLEARANCE = 0.55;

const CAMERA_PRESETS = [
  { id: 'chase',       name: '3rd-Person Chase',         short: 'Chase',       category: 'follow', fov: 56 },
  { id: 'action',      name: 'Low-Angle Action',         short: 'Action',      category: 'follow', fov: 60 },
  { id: 'pov',         name: 'First-Person / Cockpit',   short: 'POV / Dash',  category: 'follow', fov: 68 },
  { id: 'centralPark', name: 'Coit Tower & Telegraph Hill',       short: 'Coit Tower',  category: 'scenic', fov: 52 },
  { id: 'fifthAve',    name: 'Transamerica Pyramid',   short: 'Transamerica',     category: 'scenic', fov: 48 },
  { id: 'timesSquare', name: 'Ferry Building & Bay',  short: 'Ferry Building',    category: 'scenic', fov: 58 },
  { id: 'chryslerGCT', name: 'City Hall & Civic Center', short: 'City Hall',    category: 'scenic', fov: 50 },
  { id: 'observatory', name: 'Financial District Skyline',   short: 'SF Skyline',   category: 'scenic', fov: 52 },
  { id: 'bryantPark',  name: 'Lombard Street',       short: 'Lombard St',   category: 'scenic', fov: 52 },
  { id: 'waterfront',  name: 'Oracle Park & Waterfront',     short: 'Oracle Park',     category: 'scenic', fov: 46 },
  { id: 'drone',       name: 'Auto-Director Aerial',     short: 'Director',    category: 'scenic', fov: 50 }
];

class CameraSystem {
  constructor(domElement, controllerManager) {
    this.domElement = domElement;
    this.controllerManager = controllerManager;

    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.35,
      60000 // at 1:1 the boroughs & harbor run out ~20-40 km to the fogged horizon (reversed float depth keeps precision)
    );

    this.activePresetId = 'chase';
    this.orbitYawOffset = 0.0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1.0;
    this.isDragging = false;
    this.userOrbitTimer = 0;

    this.currentPos = new THREE.Vector3(0, 10, 380);
    this.currentLookAt = new THREE.Vector3(0, 8, 440);
    this.initialized = false;

    // Follow cameras (chase / action) are smoothed relative to the followed entity, see update()
    this.followEntity = null;
    this.followOffset = new THREE.Vector3();
    this.followLookOffset = new THREE.Vector3();
    this.followBaseY = 0;
    this.smoothedSpeed = 0;
    this._desiredPos = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();

    this.bindPointerControls();
  }

  bindPointerControls() {
    const canvas = this.domElement;
    const pointers = new Map();
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pointers.size >= 2) return;
      // Only two touch pointers may share a gesture; mouse and pen drags stay independent.
      if (pointers.size && (e.pointerType !== 'touch' || pointers.values().next().value.type !== 'touch')) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.userOrbitTimer = 4.0;
    });

    canvas.addEventListener('pointermove', (e) => {
      const pointer = pointers.get(e.pointerId);
      if (!pointer) return;
      e.preventDefault();
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      const pair = pointers.size === 2 ? [...pointers.values()] : null;
      const previousDistance = pair ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (pair) {
        const distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        if (previousDistance > 1 && distance > 1) {
          this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier * previousDistance / distance));
        }
      } else {
        this.orbitYawOffset -= dx * 0.0065;
        this.orbitPitchOffset = Math.max(-0.32, Math.min(0.68, this.orbitPitchOffset + dy * 0.005));
      }
      this.userOrbitTimer = 4.0;
    });

    const releasePointer = (id) => {
      if (!pointers.delete(id)) return;
      this.isDragging = pointers.size > 0;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (e) => releasePointer(e.pointerId));
    }
    const clearPointers = () => {
      for (const id of pointers.keys()) releasePointer(id);
    };
    this._clearPointers = clearPointers;
    window.addEventListener('blur', clearPointers);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearPointers();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier + e.deltaY * 0.001));
    }, { passive: false });
  }

  setCameraPreset(presetId, snapImmediately = false) {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.activePresetId = preset.id;
    this.camera.fov = preset.fov;
    this.camera.updateProjectionMatrix();
    if (snapImmediately) {
      this.initialized = false;
    }
  }

  resetForTeleport() {
    // Arrive with a fresh chase view, without carrying a previous drive or gesture into the destination.
    this._clearPointers();
    this.isDragging = false;
    this.orbitYawOffset = 0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1;
    this.userOrbitTimer = 0;
    this.smoothedSpeed = 0;
    this.followEntity = null;
    this.followOffset.set(0, 0, 0);
    this.followLookOffset.set(0, 0, 0);
    this.followBaseY = 0;
    this.setCameraPreset('chase', true);
  }

  getActivePreset() {
    return CAMERA_PRESETS.find((p) => p.id === this.activePresetId) || CAMERA_PRESETS[0];
  }

  onResize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt, elapsed) {
    const entity = this.controllerManager.getActiveEntity();
    level.y = entity.position.y;
    const desiredPos = this._desiredPos;
    const desiredLook = this._desiredLook;

    if (this.userOrbitTimer > 0 && !this.isDragging) {
      this.userOrbitTimer = Math.max(0, this.userOrbitTimer - dt);
    }

    if (!this.isDragging && this.userOrbitTimer <= 0 && Math.abs(entity.speed) > 0.5) {
      this.orbitYawOffset -= Math.round(this.orbitYawOffset / (Math.PI * 2)) * (Math.PI * 2);
      this.orbitYawOffset += (0.0 - this.orbitYawOffset) * (1 - Math.exp(-dt * 2.2));
    }

    // The follow cameras pull back with speed, eased so that they drift back as the entity speeds up (and in as it
    // slows down); speedLag is about how far their former world-space smoothing left them trailing at 60 FPS
    this.smoothedSpeed += (Math.abs(entity.speed) - this.smoothedSpeed) * (1 - Math.exp(-dt * 3.0));
    const speedLag = this.smoothedSpeed * 0.1;

    const totalYaw = entity.heading + this.orbitYawOffset;

    switch (this.activePresetId) {
      case 'chase': {
        const dist = entity.chaseDistance * this.zoomMultiplier * (1 + Math.min(0.25, this.smoothedSpeed * 0.01));
        const height = entity.chaseHeight * this.zoomMultiplier + Math.sin(this.orbitPitchOffset) * dist * 0.85;
        const horizDist = Math.cos(this.orbitPitchOffset) * dist + speedLag;

        desiredPos.set(
          entity.position.x - Math.sin(totalYaw) * horizDist,
          entity.position.y + height,
          entity.position.z - Math.cos(totalYaw) * horizDist
        );
        // A hill between the player and the camera shortens the boom: four samples along it, from the player out
        const ax = entity.position.x, ay = entity.position.y + 1.5, az = entity.position.z;
        let reach = 1;
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const x = ax + (desiredPos.x - ax) * t, y = ay + (desiredPos.y - ay) * t, z = az + (desiredPos.z - az) * t;
          if (groundY(x, z) + CAMERA_CLEARANCE + 0.1 > y) {
            reach = Math.max(0.2, t - 0.25);
            break;
          }
        }
        if (reach < 1) desiredPos.set(ax + (desiredPos.x - ax) * reach, ay + (desiredPos.y - ay) * reach, az + (desiredPos.z - az) * reach);
        desiredPos.y = Math.max(groundY(desiredPos.x, desiredPos.z) + 0.65, desiredPos.y);

        const lookUpBias = entity.type === 'helicopter' ? 0.2 : (entity.type === 'car' ? 0.52 : 1.55);
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * 5.2,
          entity.position.y + entity.cameraTargetOffset.y + lookUpBias,
          entity.position.z + Math.cos(entity.heading) * 5.2
        );
        break;
      }

      case 'action': {
        const sideOffset = entity.type === 'car' ? 2.65 : (entity.type === 'helicopter' ? 4.2 : 0.95);
        const backDist = (entity.type === 'car' ? 3.6 : (entity.type === 'helicopter' ? 8.5 : 2.8)) + speedLag;
        const lowY = entity.type === 'helicopter' ? entity.position.y + 1.2 : entity.position.y + 0.92;

        desiredPos.set(
          entity.position.x - Math.sin(entity.heading) * backDist + Math.cos(entity.heading) * sideOffset,
          lowY,
          entity.position.z - Math.cos(entity.heading) * backDist - Math.sin(entity.heading) * sideOffset
        );
        desiredPos.y = Math.max(groundY(desiredPos.x, desiredPos.z) + CAMERA_CLEARANCE, desiredPos.y);
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * 3.2,
          entity.position.y + 1.05,
          entity.position.z + Math.cos(entity.heading) * 3.2
        );
        break;
      }

      case 'pov': {
        let fwdOffset = 0.35;
        let eyeY = 1.68;
        if (entity.type === 'car') {
          fwdOffset = 0.55;
          eyeY = 1.52;
        } else if (entity.type === 'cyclist') {
          fwdOffset = 0.35;
          eyeY = 1.55;
        } else if (entity.type === 'helicopter') {
          fwdOffset = 1.65;
          eyeY = 1.65;
        }

        desiredPos.set(
          entity.position.x + Math.sin(entity.heading) * fwdOffset,
          entity.position.y + eyeY,
          entity.position.z + Math.cos(entity.heading) * fwdOffset
        );
        desiredLook.set(
          entity.position.x + Math.sin(totalYaw) * 40.0,
          entity.position.y + eyeY + Math.sin(-this.orbitPitchOffset) * 18.0 + 1.5,
          entity.position.z + Math.cos(totalYaw) * 40.0
        );
        break;
      }

      case 'centralPark': {
        const site = window.NYC.LANDMARK_SITES?.['Coit Tower'] || { x: 0, z: 0, base: 0 };
        desiredPos.set(site.x + (-100), groundY(site.x + (-100), site.z + (220)) + 130, site.z + (220));
        desiredLook.set(site.x, (site.base || 0) + 25, site.z);
        break;
      }

      case 'fifthAve': {
        const site = window.NYC.LANDMARK_SITES?.['Transamerica Pyramid'] || { x: 0, z: 0, base: 0 };
        desiredPos.set(site.x + (-160), groundY(site.x + (-160), site.z + (230)) + 90, site.z + (230));
        desiredLook.set(site.x, (site.base || 0) + 85, site.z);
        break;
      }

      case 'timesSquare': {
        const site = window.NYC.LANDMARK_SITES?.['San Francisco Ferry Building'] || { x: 0, z: 0, base: 0 };
        desiredPos.set(site.x + (-180), groundY(site.x + (-180), site.z + (20)) + 55, site.z + (20));
        desiredLook.set(site.x, (site.base || 0) + 25, site.z);
        break;
      }

      case 'chryslerGCT': {
        const site = window.NYC.LANDMARK_SITES?.['San Francisco City Hall'] || { x: 0, z: 0, base: 0 };
        desiredPos.set(site.x + (0), groundY(site.x + (0), site.z + (240)) + 70, site.z + (240));
        desiredLook.set(site.x, (site.base || 0) + 35, site.z);
        break;
      }

      case 'observatory': {
        const site = window.NYC.LANDMARK_SITES?.['Transamerica Pyramid'] || { x: 0, z: 0, base: 0 };
        desiredPos.set(site.x + (-450), groundY(site.x + (-450), site.z + (400)) + 360, site.z + (400));
        desiredLook.set(site.x, (site.base || 0) + 80, site.z);
        break;
      }

      case 'bryantPark': {
        const site = window.NYC.LANDMARK_SITES?.['Lombard Street'] || { x: 0, z: 0, base: 0 };
        desiredPos.set(site.x + (0), groundY(site.x + (0), site.z + (160)) + 100, site.z + (160));
        desiredLook.set(site.x, (site.base || 0) + 5, site.z);
        break;
      }

      case 'waterfront': {
        const site = window.NYC.LANDMARK_SITES?.['Oracle Park'] || { x: 0, z: 0, base: 0 };
        desiredPos.set(site.x + (170), groundY(site.x + (170), site.z + (190)) + 100, site.z + (190));
        desiredLook.set(site.x, (site.base || 0) + 20, site.z);
        break;
      }

      case 'drone': {
        const angle = elapsed * 0.07 + 0.65;
        const radius = 720.0 + Math.sin(elapsed * 0.23) * 140.0;
        const alt = 330.0 + Math.cos(elapsed * 0.19) * 90.0;
        desiredPos.set(
          Math.cos(angle) * radius + 60.0,
          alt,
          Math.sin(angle) * radius + 250.0
        );
        desiredLook.set(60.0, 160.0, 250.0);
        break;
      }
    }

    if (!this.initialized || this.activePresetId === 'pov') {
      this.currentPos.copy(desiredPos);
      this.currentLookAt.copy(desiredLook);
      this.initialized = true;
      this.followEntity = null; // the follow cameras re-anchor from here
    } else if (this.activePresetId === 'chase' || this.activePresetId === 'action') {
      // Smoothed in the followed entity's frame rather than in world space. A world-space follower trails a moving
      // target by a distance that depends on the frame time (about speed x dt), so with uneven frame times the camera
      // surged back and forth behind an accelerating or fast car. Relative to the entity a steady drive keeps the
      // camera steady, while turns, orbit drags, zoom & the speed pull-back are still eased. The entity's height is
      // eased in world space (curbs, park lawns, jumps, the helicopter climbing).
      if (this.followEntity !== entity) {
        // preset or mode switch: start from where the camera is and glide over to the new framing
        this.followEntity = entity;
        this.followBaseY = entity.position.y;
        this.followOffset.subVectors(this.currentPos, entity.position);
        this.followLookOffset.subVectors(this.currentLookAt, entity.position);
      }
      const k = 1 - Math.exp(-dt * 8.5);
      this.followBaseY += (entity.position.y - this.followBaseY) * k;
      this.followOffset.lerp(desiredPos.sub(entity.position), k);
      this.followLookOffset.lerp(desiredLook.sub(entity.position), k);
      this.currentPos.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followOffset);
      this.currentLookAt.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followLookOffset);
      this.currentPos.y = Math.max(groundY(this.currentPos.x, this.currentPos.z) + CAMERA_CLEARANCE, this.currentPos.y);
    } else {
      this.followEntity = null;
      const k = 1 - Math.exp(-dt * 8.5);
      this.currentPos.lerp(desiredPos, k);
      this.currentLookAt.lerp(desiredLook, k);
      this.currentPos.y = Math.max(groundY(this.currentPos.x, this.currentPos.z) + CAMERA_CLEARANCE, this.currentPos.y);
    }

    this.currentPos.y = Math.min(this.currentPos.y, roofY(this.currentPos.x, this.currentPos.z) - 0.4);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}

Object.assign(window.NYC, { CAMERA_PRESETS, CameraSystem });
})();
