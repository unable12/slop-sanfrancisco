(function () {
// js/lighting.js
// Physically-Based Atmospheric Sky (Preetham SkyMesh + Beer-Powder Clouds),
// Live PMREMGenerator IBL Cubemap, Three.js r186 SunLight (2-Cascade CSM),
// and Occlusion-Aware Urban Canyon Global Illumination for Three.js r186 WebGPURenderer

const { THREE } = window.NYC;
const {
  Fn, float, vec3, vec4, uniform, mix, pmremTexture, length, normalize, max, min, exp, abs, select, clamp, smoothstep, sin, If
} = window.NYC.TSL;
const { SkyMesh } = window.NYC.Addons;
const { SunLight } = window.NYC.Addons;
const { SunLightNode } = window.NYC.Addons;
const { cityUniforms } = window.NYC;

const TIME_PRESETS = {
  golden: {
    id: 'golden',
    name: 'Golden Hour · 17:45',
    // Crisp Manhattan canyon sun slicing across avenues & intersections so buildings, cars, trees & pedestrians cast sharp shadows
    sunDir: new THREE.Vector3(-0.44, 0.58, -0.68).normalize(),
    sunColor: 0xffca92,
    sunIntensity: 5.8,
    hemiSky: 0x9abbe6,
    hemiGround: 0xc88a62, // Warm terracotta / limestone upward canyon bounce
    hemiIntensity: 1.48,
    skyTop: 0x2c568c,
    skyHorizon: 0xebd1b5,
    fogColor: 0xdcc5ae,
    fogDensity: 0.00024,
    interiorGlow: 0.48,
    roadWetness: 0.28,
    envIntensity: 0.54,
    canyonBounce: 0.52,
    turbidity: 8.0,
    rayleigh: 2.8,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.88,
    cloudCoverage: 0.36,
    cloudDensity: 0.38,
    skyExposure: 0.148,
    nightFactor: 0.0
  },
  midday: {
    id: 'midday',
    name: 'Sunny Midday · 13:30',
    sunDir: new THREE.Vector3(-0.34, 0.82, -0.46).normalize(),
    sunColor: 0xfff5e8,
    sunIntensity: 6.6,
    hemiSky: 0xaad2ff,
    hemiGround: 0xb89678, // Warm sunlit masonry & pavement bounce
    hemiIntensity: 1.58,
    skyTop: 0x225ea8,
    skyHorizon: 0xc8dff5,
    fogColor: 0xc6dcf2,
    fogDensity: 0.00018,
    interiorGlow: 0.24,
    roadWetness: 0.08,
    envIntensity: 0.58,
    canyonBounce: 0.58,
    turbidity: 6.5,
    rayleigh: 2.4,
    mieCoefficient: 0.006,
    mieDirectionalG: 0.86,
    cloudCoverage: 0.32,
    cloudDensity: 0.35,
    skyExposure: 0.142,
    nightFactor: 0.0
  },
  twilight: {
    id: 'twilight',
    name: 'Blue Hour · 19:15',
    sunDir: new THREE.Vector3(-0.52, 0.36, -0.77).normalize(),
    sunColor: 0xff9466,
    sunIntensity: 3.1,
    hemiSky: 0x4c6ca8,
    hemiGround: 0x6e5048,
    hemiIntensity: 0.85,
    skyTop: 0x102248,
    skyHorizon: 0xb86b6c,
    fogColor: 0x353c58,
    fogDensity: 0.00032,
    interiorGlow: 1.25,
    roadWetness: 0.55,
    envIntensity: 0.36,
    canyonBounce: 0.32,
    turbidity: 9.5,
    rayleigh: 3.4,
    mieCoefficient: 0.010,
    mieDirectionalG: 0.90,
    cloudCoverage: 0.40,
    cloudDensity: 0.42,
    skyExposure: 0.115,
    nightFactor: 0.28
  },
  midnight: {
    id: 'midnight',
    name: 'Manhattan Night · 23:00',
    sunDir: new THREE.Vector3(0.42, 0.68, -0.60).normalize(),
    sunColor: 0x8cb0e8,
    sunIntensity: 1.45,
    hemiSky: 0x263a62,
    hemiGround: 0x382e36,
    hemiIntensity: 0.72,
    skyTop: 0x060c1a,
    skyHorizon: 0x182640,
    fogColor: 0x0c1424,
    fogDensity: 0.00036,
    interiorGlow: 1.55,
    roadWetness: 0.62,
    envIntensity: 0.30,
    canyonBounce: 0.18,
    turbidity: 4.0,
    rayleigh: 1.5,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.80,
    cloudCoverage: 0.22,
    cloudDensity: 0.25,
    skyExposure: 0.022,
    nightFactor: 0.86
  }
};

class LightingSystem {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.activePresetId = 'golden';

    // Assign SunLight its node implementation for WebGPURenderer (Light.registerNode since r187; r186 used the library)
    if (SunLight.registerNode) {
      SunLight.registerNode(SunLightNode);
    } else if (renderer && renderer.library) {
      renderer.library.addLight(SunLightNode, SunLight);
    }

    this.scene.fog = new THREE.FogExp2(0xdcc5ae, 0.00024);
    // Leave scene.background = null because SkyMesh renders the 360° sky dome, and setting
    // a THREE.Color on scene.background sets forceClear=true in WebGPURenderer's Background.update,
    // which would otherwise clear Cascade 0 when rendering Cascade 1 in SunShadowNode!
    this.scene.background = null;

    // Physical Preetham SkyMesh + Beer-Powder Clouds (from three/addons/objects/SkyMesh.js). Its unit box must contain
    // the camera wherever it flies over the 1:1 harbour (Manhattan alone is 13.6 km long; it renders at the far plane
    // whatever its size)
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(200000);
    this.sky.turbidity.value = 8.0;
    this.sky.rayleigh.value = 2.8;
    this.sky.mieCoefficient.value = 0.008;
    this.sky.mieDirectionalG.value = 0.88;
    this.sky.cloudScale.value = 0.00018;
    this.sky.cloudSpeed.value = 0.000015;
    this.sky.cloudCoverage.value = 0.36;
    this.sky.cloudDensity.value = 0.38;
    this.sky.cloudElevation.value = 0.52;

    // Calibrate SkyMesh raw radiance (EE=1000 * 0.04) into standard exposure=1.0 HDR range
    this.uSkyExposure = uniform(0.148);
    this.uNightFactor = uniform(0.0);
    this.uNightSkyColor = uniform(new THREE.Color(0x0b1528));
    const rawSkyNode = this.sky.material.colorNode;
    this.sky.material.colorNode = Fn(() => {
      const raw = rawSkyNode;
      const dayCol = raw.rgb.mul(this.uSkyExposure);
      const finalSky = mix(dayCol, this.uNightSkyColor, this.uNightFactor);
      return vec4(finalSky, float(1.0));
    })();

    // In reversedDepthBuffer mode ([1..0]), camera.far is z = 0.0 (whereas SkyMesh defaults to z = w)
    if (renderer && renderer.reversedDepthBuffer) {
      const rawSkyVertexNode = this.sky.material.vertexNode;
      this.sky.material.vertexNode = Fn(() => {
        const pos = rawSkyVertexNode.toVar();
        pos.z.assign(0.0);
        return pos;
      })();
    }

    this.scene.add(this.sky);

    // Reusable PMREMGenerator & offscreen envScene (mirrors webgpu_generator_city.html)
    this.pmremGenerator = renderer ? new THREE.PMREMGenerator(renderer) : null;
    this.envScene = new THREE.Scene();
    this.envRenderTarget = null;

    // Three.js r186 SunLight with automatic 2-Cascade Shadow Map (SunLightShadow + SunShadowNode)
    // Shines from its position vector toward the origin (no .target needed)
    this.sunLight = new SunLight(0xffca92, 5.8);
    this.sunLight.position.copy(TIME_PRESETS.golden.sunDir);
    this.sunLight.castShadow = true;
    // 3072x3072 per cascade = 6144x3072 2-cascade shadow atlas (an 8192x4096 one cost ~20% fps and caused hitches),
    // 2048 where the device allows less. The near cascade spans ~0.35-80 m of the view at street level (see update)
    const maxTex = (renderer && renderer.backend && renderer.backend.device && renderer.backend.device.limits.maxTextureDimension2D) || 4096;
    const tile = maxTex >= 6144 ? 3072 : 2048;
    this.sunLight.shadow.mapSize.set(tile, tile);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 300;
    // Suppress shadow acne along the surface normal in world units
    // so short casters like cars, curbs, tree trunks, and pedestrians keep crisp contact shadows
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight);

    // Subtle Hemisphere Sky + Warm Terracotta/Limestone Ground Bounce Fill
    // (Kept intentionally lower than sunLight so urban canyon shadows remain deep and crisp)
    this.hemiLight = new THREE.HemisphereLight(0x9abbe6, 0xc88a62, 1.05);
    this.hemiLight.position.set(0, 300, 0);
    this.scene.add(this.hemiLight);

    // Sky-matched aerial perspective (replaces the flat FogExp2 colour): distant surfaces fade into the baked sky
    // radiance just above the horizon in their view direction (sun glow included), through an exponential haze layer
    // so helicopter / observatory views stay clearer than the horizon.
    this.uFogDensity = uniform(TIME_PRESETS.golden.fogDensity);
    this.uFogHeight = uniform(900.0);
    this.uMarine = uniform(0.0);
    this.uLayerTop = uniform(200.0);
    this.uFogTime = uniform(0.0);
    this.fogPreset = 'haze';
    this.applyPreset('golden');
    // Fog is composed from resolved depth in the final image graph and bloom prefilter.
    this.scene.fog = null;
  }

  createAerialFogNode(worldPosition, viewPosition) {
    const positionWorld = worldPosition, cameraPosition = viewPosition;
    const toFrag = positionWorld.sub(cameraPosition);
    const dist = length(toFrag);
    const dir = toFrag.div(max(dist, 0.001));
    const horizonDir = normalize(vec3(dir.x, max(dir.y, 0.015), dir.z));
    // Dense fog is lit diffusely: avoid the filtered environment lookup while inside the marine preset.
    // The original sky-matched aerial colour remains for clear and haze views.
    const skyColor = Fn(() => {
      const color = vec3(0.7, 0.76, 0.8).mul(float(1).sub(this.uNightFactor.mul(0.93))).toVar();
      If(this.uMarine.lessThan(0.5), () => {
        color.assign(pmremTexture(this.envRenderTarget.texture, horizonDir, float(0.3)).rgb);
      });
      return color;
    })();
    const amount = Fn(() => {
      const ya = max(positionWorld.y, 0.0), yb = max(cameraPosition.y, 0.0), dy = yb.sub(ya);
      const opticalDepth = float(0).toVar();
      If(this.uMarine.greaterThan(0.5), () => {
        // Integrate the smooth 80 m ceiling along the ray; only the marine branch pays for this work.
        const primitive = y => {
          const lo = this.uLayerTop.sub(40), t = clamp(y.sub(lo).div(80), 0, 1).toVar();
          return min(y, lo).add(t.mul(float(1).sub(t.mul(t).mul(float(1).sub(t.mul(0.5))))).mul(80));
        };
        const layerMean = select(abs(dy).greaterThan(1), primitive(yb).sub(primitive(ya)).div(dy),
          float(1).sub(smoothstep(this.uLayerTop.sub(40), this.uLayerTop.add(40), ya)));
        const west = float(1).sub(smoothstep(-7000, -500, positionWorld.x.add(cameraPosition.x).mul(0.5)));
        const drift = sin(positionWorld.x.mul(0.0008).sub(this.uFogTime.mul(0.018)))
          .mul(sin(positionWorld.z.mul(0.0011).add(this.uFogTime.mul(0.005)))).mul(0.18).add(0.82);
        // Thin haze above the marine deck uses a cheap rational height falloff.
        const haze = this.uFogDensity.mul(dist).mul(float(900).div(yb.add(900)));
        opticalDepth.assign(dist.mul(layerMean).mul(mix(0.0015, 0.006, west)).mul(drift).add(haze.mul(haze)));
      }).Else(() => {
        // Original sky-matched aerial fog, unchanged for clear and haze presets.
        const H = this.uFogHeight, ea = exp(ya.div(H).negate()), eb = exp(yb.div(H).negate());
        const meanDensity = select(abs(dy).greaterThan(1.0), ea.sub(eb).mul(H).div(dy), ea);
        const tau = this.uFogDensity.mul(dist).mul(meanDensity);
        opticalDepth.assign(tau.mul(tau));
      });
      return float(1).sub(exp(opticalDepth.negate()));
    })();
    return { color: skyColor, amount };
  }

  bakeEnvironmentMap() {
    if (!this.pmremGenerator) return;
    // Bake physical SkyMesh (without solar disc) into scene.environment for realistic canyon IBL.
    // Reuses a single RenderTarget so texture identity never changes.
    this.sky.showSunDisc.value = 0;
    this.envScene.add(this.sky);
    this.envRenderTarget = this.pmremGenerator.fromScene(this.envScene, 0, 0.1, 100, {
      renderTarget: this.envRenderTarget
    });
    this.scene.environment = this.envRenderTarget.texture;
    this.sky.showSunDisc.value = 1;
    this.scene.add(this.sky);
  }

  applyPreset(presetId, force = false) {
    const p = TIME_PRESETS[presetId] || TIME_PRESETS.golden;
    if (!force && this.activePresetId === p.id && this.envRenderTarget !== null) {
      return;
    }
    this.activePresetId = p.id;

    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;
    this.sunLight.position.copy(p.sunDir);
    this.sunLight.updateMatrixWorld();

    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    if (this.scene.fog) {
      this.scene.fog.color.setHex(p.fogColor);
      this.scene.fog.density = p.fogDensity;
    }
    if (this.uFogDensity) this.uFogDensity.value = p.fogDensity;

    // Update physical Preetham SkyMesh uniforms
    this.sky.turbidity.value = p.turbidity;
    this.sky.rayleigh.value = p.rayleigh;
    this.sky.mieCoefficient.value = p.mieCoefficient;
    this.sky.mieDirectionalG.value = p.mieDirectionalG;
    this.sky.cloudCoverage.value = p.cloudCoverage;
    this.sky.cloudDensity.value = p.cloudDensity;
    this.sky.sunPosition.value.copy(p.sunDir);
    this.uSkyExposure.value = p.skyExposure;
    this.uNightFactor.value = p.nightFactor;

    cityUniforms.uSunColor.value.setHex(p.sunColor);
    cityUniforms.uSkyTopColor.value.setHex(p.skyTop);
    cityUniforms.uSkyHorizonColor.value.setHex(p.skyHorizon);
    cityUniforms.uSkySunDir.value.copy(p.sunDir);
    cityUniforms.uInteriorGlow.value = p.interiorGlow;
    cityUniforms.uRoadWetness.value = p.roadWetness;
    if (cityUniforms.uCanyonBounce) {
      cityUniforms.uCanyonBounce.value = p.canyonBounce;
    }

    this.scene.environmentIntensity = p.envIntensity;
    this.bakeEnvironmentMap();
    this.setFogPreset(this.fogPreset);
  }

  setFogPreset(id) {
    this.fogPreset = ['clear', 'haze', 'marine'].includes(id) ? id : 'haze';
    this.uMarine.value = this.fogPreset === 'marine' ? 1 : 0;
    const p = TIME_PRESETS[this.activePresetId] || TIME_PRESETS.golden;
    this.uFogDensity.value = p.fogDensity * (this.fogPreset === 'clear' ? 0.25 : this.fogPreset === 'marine' ? 0.35 : 1);
  }

  update(focusPos, elapsed = 0) {
    this.uFogTime.value = elapsed;
    this.uLayerTop.value = 200 + Math.sin(elapsed * 0.006) * 40;
    const p = TIME_PRESETS[this.activePresetId] || TIME_PRESETS.golden;
    const within = this.fogPreset === 'marine' && focusPos ? 1 - Math.max(0, Math.min(1, (focusPos.y - this.uLayerTop.value + 40) / 80)) : 0;
    this.sunLight.intensity = p.sunIntensity * (1 - within * 0.68);
    this.sky.showSunDisc.value = 1 - within * 0.8;
    // SunLightShadow automatically fits & texel-snaps its 2 cascades to the view camera frustum
    // every frame inside SunShadowNode.renderShadow(), splitting [near, far] halfway between a uniform and a
    // logarithmic split (the near cascade ends at ~far / 4). Keep far at 300 m at street level so the near cascade
    // stays sharp, and expand it with altitude (helicopter / observatory) so shadows reach all the way down to street level.
    // altitude above the ground under the camera (js/terrain.js), not above sea level
    const T = window.NYC.Terrain;
    const ground = T && T.loaded && focusPos ? T.groundAt(focusPos.x, focusPos.z) : 0;
    const altitude = focusPos && Number.isFinite(focusPos.y) ? Math.max(0, focusPos.y - ground) : 0;
    this.sunLight.shadow.camera.far = Math.max(300, Math.min(720, 260 + altitude * 1.6));
  }
}

Object.assign(window.NYC, { LightingSystem });
})();
