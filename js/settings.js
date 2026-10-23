(function () {
const QUALITY_PRESETS = {
  low: { distance: 3000, trees: 2500, reflections: false, shadows: false, reflectionScale: 0.25 },
  medium: { distance: 5000, trees: 4000, reflections: true, shadows: true, reflectionScale: 0.25 },
  high: { distance: 8500, trees: 6000, reflections: true, shadows: true, reflectionScale: 0.5 }
};
function chooseQuality(frameTimes) {
  const sorted = frameTimes.filter(Number.isFinite).sort((a,b) => a-b);
  if (!sorted.length) return 'medium';
  const median = sorted[Math.floor(sorted.length/2)];
  return median > 24 ? 'low' : median > 14 ? 'medium' : 'high';
}
function createSettings({ onPause, onTime, onFog, onQuality, onTraffic, onShadows, getTime, getFog }) {
  const dialog = document.getElementById('settings-dialog');
  const button = document.getElementById('btn-settings');
  const quality = document.getElementById('settings-quality');
  const time = document.getElementById('settings-time');
  const fog = document.getElementById('settings-fog');
  const shadows = document.getElementById('settings-shadows');
  const status = document.getElementById('settings-status');
  let previousFocus, selected = 'auto', automatic = 'high';
  const applyQuality = () => {
    const id = selected === 'auto' ? automatic : selected;
    onQuality(id); shadows.checked = QUALITY_PRESETS[id].shadows;
    status.textContent = selected === 'auto' ? `Automatic quality: ${id}` : `${id[0].toUpperCase()+id.slice(1)} quality`;
  };
  function close() { if (dialog.open) dialog.close(); }
  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    time.value = getTime(); fog.value = getFog();
    onPause(true); dialog.showModal(); document.getElementById('settings-resume').focus();
  }
  button.addEventListener('click', open);
  document.getElementById('settings-resume').addEventListener('click', close);
  dialog.addEventListener('close', () => { onPause(false); previousFocus?.focus(); });
  window.addEventListener('keydown', e => {
    if (dialog.open) { e.stopImmediatePropagation(); return; }
    if (e.code === 'Escape' && !e.repeat && !window.NYC.isTypingInField(e)) {
      const map = document.getElementById('fullmap-modal');
      if (map && !map.classList.contains('hidden')) return;
      if (document.querySelector?.(':popover-open')) return;
      e.preventDefault(); e.stopImmediatePropagation(); open();
    }
  }, true);
  time.addEventListener('change', () => onTime(time.value));
  fog.addEventListener('change', () => onFog(fog.value));
  quality.addEventListener('change', () => { selected = quality.value; applyQuality(); });
  shadows.addEventListener('change', () => onShadows(shadows.checked));
  document.getElementById('settings-traffic').addEventListener('change', e => onTraffic(Number(e.target.value)));
  return {
    get paused() { return dialog.open; },
    setAutomatic(id) { automatic=id; if(selected==='auto') applyQuality(); },
    setQuality(id) { selected=id; quality.value=id; applyQuality(); }
  };
}
Object.assign(window.NYC, { QUALITY_PRESETS, chooseQuality, createSettings });
})();
