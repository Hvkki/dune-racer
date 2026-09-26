import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { CONFIG } from './config.js';
import { initInput, readInput, consumeReset } from './input.js';
import { Environment } from './environment.js';
import { Track } from './track.js';
import { Car } from './car.js';
import { ChaseCamera } from './camera.js';
import { DustSystem } from './particles.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';

class Game {
  constructor() {
    this.running = false;
    this._acc = 0;
    this._last = performance.now();
    this.FIXED = 1 / 60;

    this._initRenderer();
    this._initScene();
    this._initPost();

    initInput();
    this.hud = new HUD();
    this.audio = new Audio();

    window.addEventListener('resize', () => this._onResize());

    // hide loading, show menu (scene is ready)
    document.getElementById('loading').classList.add('hidden');

    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 2000
    );

    this.env = new Environment(this.scene);
    // track needs the height function; env needs track for flattening -> wire both
    this.track = new Track(this.scene, this.env.heightFn);
    this.env.attachTrack(this.track);

    this.car = new Car(this.scene, this.env.heightFn);
    this.car.reset(this.track.startPos, this.track.startHeading);

    this.chase = new ChaseCamera(this.camera);
    this.chase.snapTo(this.car);

    this.dust = new DustSystem(this.scene);
  }

  _initPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55, 0.4, 0.85
    );
    this.composer.addPass(this.bloom);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  startRace() {
    document.getElementById('menu').classList.add('hidden');
    this.hud.show();
    this.audio.start();
    this.car.reset(this.track.startPos, this.track.startHeading);
    this.chase.snapTo(this.car);
    this.track.resetRace(performance.now());
    this.running = true;
  }

  _frame(now) {
    requestAnimationFrame(this._frame);
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.25) dt = 0.25;

    if (this.running) {
      const cmd = readInput();

      // handle reset key
      if (consumeReset()) {
        this.car.reset(this.track.startPos, this.track.startHeading);
        this.chase.snapTo(this.car);
      }

      // fixed-timestep physics
      this._acc += dt;
      let guard = 0;
      while (this._acc >= this.FIXED && guard < 6) {
        this.car.step(cmd, this.FIXED, this.track);
        this._acc -= this.FIXED;
        guard++;
      }
      if (guard >= 6) this._acc = 0; // avoid spiral of death

      // race progress
      const hit = this.track.update(this.car.pos, now);
      if (hit) this.hud.pingCheckpoint();

      // visuals at frame rate
      this.chase.update(this.car, dt);
      this.dust.update(this.car, dt);
      this.audio.update(this.car);
      this.hud.update(this.car, this.track, now, dt);
    }

    this.composer.render();
  }
}

// Boot
const game = new Game();
document.getElementById('startBtn').addEventListener('click', () => game.startRace());

// expose for debugging / smoke test
window.__DUNE__ = game;
