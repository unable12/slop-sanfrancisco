(function () {
// Scene-linear color grading and lens bloom, composed in the existing final render pass.
const { THREE } = window.NYC;
const { Fn, uniform, float, vec2, vec3, vec4, dot, mix, min, max, pow, smoothstep, length, screenUV, screenSize, If, normalize } = window.NYC.TSL;
const { bloom } = window.NYC.PostFX;

// Exposure and white balance belong to the camera, independently of the physical lighting presets.
// Keep exposure restrained for ACES; stronger bloom stays selective so midtones retain their contrast.
const LOOKS = {
  golden:   { exposure: 1.04, contrast: 1.12, saturation: 1.08, balance: [1.045, 1.00, 0.955], bloom: 0.24, threshold: 1.20 },
  midday:   { exposure: 1.00, contrast: 1.10, saturation: 1.06, balance: [1.015, 1.00, 0.985], bloom: 0.18, threshold: 1.35 },
  twilight: { exposure: 1.06, contrast: 1.10, saturation: 1.08, balance: [1.025, 0.995, 1.015], bloom: 0.28, threshold: 1.05 },
  midnight: { exposure: 1.04, contrast: 1.08, saturation: 1.06, balance: [0.985, 1.00, 1.035], bloom: 0.30, threshold: 1.00 }
};

function createPostProcessing(renderer, sceneColor, reflections, depth, camera, lighting) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Exposure is applied before bloom so its threshold follows the image's exposed brightness.
  // RenderPipeline performs ACES and the output color-space conversion exactly once, after this graph.
  renderer.toneMappingExposure = 1.0;

  const exposure = uniform(1.0);
  const contrast = uniform(1.0);
  const saturation = uniform(1.0);
  const balance = uniform(new THREE.Vector3(1, 1, 1));
  const fogEnabled = uniform(1);
  const inverseProjection = uniform(camera.projectionMatrixInverse);
  const cameraWorld = uniform(camera.matrixWorld);
  // WebGPU clip depth is [0,1], reversed Z clears to zero, and texture V runs downwards.
  // The camera inverse already includes reversed Z. Resolved depth makes fog
  // independent of material count/overdraw. The sky keeps its physical shader above the marine horizon.
  const fogged = Fn(() => {
    const color = sceneColor.rgb.add(reflections.rgb).toVar();
    If(fogEnabled.greaterThan(0.5), () => {
      const clip = vec4(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)), depth.r, 1);
      const view = inverseProjection.mul(clip).toVar();
      const world = cameraWorld.mul(vec4(view.xyz.div(view.w), 1)).xyz;
      const eye = cameraWorld.mul(vec4(0, 0, 0, 1)).xyz;
      // Surface fog uses the resolved opaque depth; the sky only receives horizon haze.
      If(depth.r.greaterThan(0), () => {
        const atmosphere = lighting.createAerialFogNode(world, eye);
        color.assign(mix(color, atmosphere.color, atmosphere.amount));
      }).Else(() => {
        const elevation = normalize(world.sub(eye)).y;
        const horizon = float(1).sub(smoothstep(0.02, 0.3, elevation));
        const marineColor = vec3(0.7, 0.76, 0.8).mul(float(1).sub(lighting.uNightFactor.mul(0.93)));
        color.assign(mix(color, marineColor, lighting.uMarine.mul(horizon).mul(0.95)));
      });
    });
    return color;
  })();
  const exposed = max(fogged, vec3(0)).mul(exposure).mul(balance);

  // Limit only bloom's peak radiance, scaling RGB together to retain neon and lamp colors.
  // The original HDR image keeps its full range for the tone mapper's highlight shoulder.
  const peak = max(max(exposed.r, exposed.g), exposed.b);
  const bloomInput = vec4(exposed.mul(float(8.0).div(max(peak, 8.0))), 1.0);
  const bloomPass = bloom(bloomInput, 0.24, 0.40, 1.20);
  bloomPass.smoothWidth.value = 0.30;
  bloomPass.setResolutionScale(0.5);

  const outputNode = Fn(() => {
    const color = exposed.add(bloomPass.rgb).toVar();
    const luma = dot(color, vec3(0.2126, 0.7152, 0.0722)).toVar();

    // Gentle cool shadow / warm highlight separation; multiply rather than lifting the black level.
    const shadows = mix(vec3(0.965, 1.005, 1.045), vec3(1), smoothstep(0.02, 0.60, luma));
    const highlights = mix(vec3(1), vec3(1.035, 1.005, 0.965), smoothstep(0.60, 3.0, luma));
    color.mulAssign(shadows.mul(highlights));

    // Contrast pivots around middle gray and scales RGB together, avoiding per-channel gamma shifts.
    color.mulAssign(pow(max(luma, 0.0001).div(0.18), contrast.sub(1.0)));
    const gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    const chroma = max(max(color.r, color.g), color.b).sub(min(min(color.r, color.g), color.b));
    const vibrance = float(0.10).mul(float(1).sub(chroma.div(max(max(max(color.r, color.g), color.b), 0.0001))));
    color.assign(max(mix(vec3(gray), color, saturation.add(vibrance)), vec3(0)));

    // Normalize by the corner radius so the lens falloff remains subtle in portrait and landscape.
    const aspect = screenSize.x.div(screenSize.y);
    const radius = length(screenUV.sub(0.5).mul(vec2(aspect, 1))).div(length(vec2(aspect, 1).mul(0.5)));
    const vignette = float(1).sub(smoothstep(0.35, 1.0, radius).mul(0.12));
    return vec4(color.mul(vignette), 1.0);
  })();

  function applyPreset(id) {
    const look = LOOKS[id] || LOOKS.golden;
    exposure.value = look.exposure;
    contrast.value = look.contrast;
    saturation.value = look.saturation;
    balance.value.set(...look.balance);
    bloomPass.strength.value = look.bloom;
    bloomPass.threshold.value = look.threshold;
  }

  applyPreset('golden');
  return { outputNode, fogEnabled, bloomPass, applyPreset, exposure, contrast, saturation, balance };
}

Object.assign(window.NYC, { createPostProcessing });
})();
