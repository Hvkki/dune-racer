// Procedural engine audio via the Web Audio API — no sound files needed.
// Engine = sawtooth oscillator whose pitch/volume track speed. Boost adds a
// brighter layer. Must be started from a user gesture (browser autoplay policy).

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // audio unsupported; game still runs
    this.ctx = new AC();

    // master
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);

    // engine oscillator
    this.engine = this.ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 60;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.08;
    this.engine.connect(this.engineGain).connect(this.master);
    this.engine.start();

    // sub layer for body
    this.sub = this.ctx.createOscillator();
    this.sub.type = 'square';
    this.sub.frequency.value = 40;
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.04;
    this.sub.connect(this.subGain).connect(this.master);
    this.sub.start();

    // boost noise layer
    this.boostGain = this.ctx.createGain();
    this.boostGain.gain.value = 0.0;
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = noiseBuf;
    this.noise.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    this.noise.connect(bp).connect(this.boostGain).connect(this.master);
    this.noise.start();

    // fade master in
    this.master.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 0.4);
    this.enabled = true;
  }

  update(car) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const speedT = Math.min(car.speed / 62, 1.2);
    // engine pitch rises with speed
    const target = 60 + speedT * 220 + (car.boost.active ? 40 : 0);
    this.engine.frequency.setTargetAtTime(target, t, 0.08);
    this.sub.frequency.setTargetAtTime(target * 0.5, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.06 + speedT * 0.05, t, 0.1);
    // boost whoosh
    this.boostGain.gain.setTargetAtTime(car.boost.active ? 0.12 : 0.0, t, 0.1);
  }

  stop() {
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
  }
}
