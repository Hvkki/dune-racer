import { CONFIG } from './config.js';

// Drives the HTML/CSS HUD overlay from game state.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      spd: document.getElementById('spd'),
      fill: document.getElementById('nitroFill'),
      lapNum: document.getElementById('lapNum'),
      lapTotal: document.getElementById('lapTotal'),
      lapTime: document.getElementById('lapTime'),
      bestTime: document.getElementById('bestTime'),
      cpHint: document.getElementById('cpHint'),
    };
    this.el.lapTotal.textContent = CONFIG.TOTAL_LAPS;
    this._cpTimer = 0;
  }

  show() { this.el.hud.classList.remove('hidden'); }

  pingCheckpoint() {
    // retrigger the CSS animation
    const c = this.el.cpHint;
    c.classList.remove('hidden');
    c.style.animation = 'none';
    // force reflow
    void c.offsetWidth;
    c.style.animation = '';
    this._cpTimer = 0.7;
  }

  update(car, track, nowMs, dt) {
    this.el.spd.textContent = Math.round(car.speed * 3.6);

    const pct = (car.boost.meter * 100).toFixed(0);
    this.el.fill.style.width = pct + '%';
    this.el.fill.style.filter = car.boost.active ? 'brightness(1.5)' : 'none';

    const lap = track.lap;
    this.el.lapNum.textContent = Math.min(lap.count + (lap.count === 0 ? 1 : 0) || 1, CONFIG.TOTAL_LAPS);
    // show current lap (count starts at 0 before crossing start once)
    const displayLap = Math.min(Math.max(lap.count, 1), CONFIG.TOTAL_LAPS);
    this.el.lapNum.textContent = displayLap;

    const cur = ((nowMs - lap.startTime) / 1000);
    this.el.lapTime.textContent = (lap.startTime > 0 ? cur : 0).toFixed(2);
    this.el.bestTime.textContent = lap.bestTime != null ? lap.bestTime.toFixed(2) : '--.--';

    if (this._cpTimer > 0) {
      this._cpTimer -= dt;
      if (this._cpTimer <= 0) this.el.cpHint.classList.add('hidden');
    }
  }
}
