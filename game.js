/**
 * Harbor Cargo — Containership Salvage
 * Fullscreen, Open-Water, Zero-Scoring, Relaxed Navigation
 */

(function () {
  'use strict';

  // --- AUDIO SYNTHESIZER ---
  class HarborAudio {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      const saved = localStorage.getItem('harbor_game_audio');
      if (saved !== null) this.enabled = saved === 'true';
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem('harbor_game_audio', String(this.enabled));
      return this.enabled;
    }

    playFoghorn() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(108, t);
      osc1.frequency.exponentialRampToValueAtTime(104, t + 1.2);

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(111.5, t);
      osc2.frequency.exponentialRampToValueAtTime(107, t + 1.2);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, t);
      filter.frequency.exponentialRampToValueAtTime(240, t + 1.2);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.15);
      gain.gain.setValueAtTime(0.28, t + 0.85);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.35);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 1.36);
      osc2.stop(t + 1.36);
    }

    playContainerPickup() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // Heavy steel dock clank
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.18);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.23);

      // Bell chime
      const bell = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(880, t + 0.04);
      bell.frequency.setValueAtTime(1174.66, t + 0.12);
      bellGain.gain.setValueAtTime(0.12, t + 0.04);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      bell.connect(bellGain);
      bellGain.connect(this.ctx.destination);
      bell.start(t + 0.04);
      bell.stop(t + 0.56);
    }

    playBumperBump() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  // --- FULLSCREEN CANVAS SETUP ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const sound = new HarborAudio();

  const CONTAINER_COLORS = [
    { name: 'Pacific Blue', hex: '#43bccd', border: '#257a87' },
    { name: 'Strawberry Red', hex: '#e83f40', border: '#9e2526' },
    { name: 'Harbor Gold', hex: '#ffd166', border: '#b89033' },
    { name: 'Jungle Teal', hex: '#679289', border: '#3a5f57' },
    { name: 'Cargo Orange', hex: '#e67e22', border: '#a04000' }
  ];

  let gameState = 'START'; // 'START' | 'PLAYING'

  // Visual deck cargo bays (loaded containers shown on deck, up to 8 slots)
  const deckSlots = [];
  const MAX_DECK_SLOTS = 8;

  // Key states
  const keys = {
    left: false,
    right: false,
    up: false,
    down: false
  };

  // Autopilot waypoint
  let waypoint = null;

  // Containership Entity
  const ship = {
    x: 0,
    y: 0,
    width: 28,
    length: 104,
    angle: -Math.PI / 2, // 0 = pointing right, -PI/2 = pointing UP
    speed: 0,
    maxForwardSpeed: 4.8,
    maxReverseSpeed: -2.0,
    accel: 0.08,
    brake: 0.12,
    friction: 0.985,
    turnRate: 0.042,
    wakeTimer: 0
  };

  let containers = [];
  let particles = [];
  let waterCurrents = [];
  let perimeterBuoys = [];

  let lastTime = performance.now();

  function resizeFullscreenCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (ship.x === 0 && ship.y === 0) {
      ship.x = canvas.width / 2;
      ship.y = canvas.height / 2;
    }

    initPerimeterBuoys();
  }

  window.addEventListener('resize', resizeFullscreenCanvas);
  resizeFullscreenCanvas();
  updateAudioButtonUI();

  // Perimeter navigational safety buoys spanning the full screen edges
  function initPerimeterBuoys() {
    perimeterBuoys = [];
    const pad = 44;
    const w = canvas.width;
    const h = canvas.height;

    const numX = Math.max(3, Math.floor(w / 280));
    const numY = Math.max(2, Math.floor(h / 240));

    // Top and Bottom perimeter buoys
    for (let i = 0; i <= numX; i++) {
      const bx = pad + (i / numX) * (w - pad * 2);
      perimeterBuoys.push({ x: bx, y: pad, color: i % 2 === 0 ? '#e83f40' : '#43bccd', flash: i * 0.3, bob: i * 0.7 });
      perimeterBuoys.push({ x: bx, y: h - pad, color: i % 2 === 0 ? '#43bccd' : '#ffd166', flash: (i + 1) * 0.3, bob: (i + 1) * 0.7 });
    }

    // Left and Right perimeter buoys
    for (let j = 1; j < numY; j++) {
      const by = pad + (j / numY) * (h - pad * 2);
      perimeterBuoys.push({ x: pad, y: by, color: j % 2 === 0 ? '#ffd166' : '#679289', flash: j * 0.4, bob: j * 0.8 });
      perimeterBuoys.push({ x: w - pad, y: by, color: j % 2 === 0 ? '#679289' : '#e83f40', flash: (j + 1) * 0.4, bob: (j + 1) * 0.8 });
    }
  }

  // --- INPUT CONTROLS ---
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'KeyA', 'a'].includes(e.code)) { keys.left = true; waypoint = null; }
    if (['ArrowRight', 'KeyD', 'd'].includes(e.code)) { keys.right = true; waypoint = null; }
    if (['ArrowUp', 'KeyW', 'w'].includes(e.code)) { keys.up = true; waypoint = null; }
    if (['ArrowDown', 'KeyS', 's'].includes(e.code)) { keys.down = true; waypoint = null; }

    if (e.code === 'Space') {
      e.preventDefault();
      sound.init();
      sound.playFoghorn();
      triggerHornWave();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'KeyA', 'a'].includes(e.code)) keys.left = false;
    if (['ArrowRight', 'KeyD', 'd'].includes(e.code)) keys.right = false;
    if (['ArrowUp', 'KeyW', 'w'].includes(e.code)) keys.up = false;
    if (['ArrowDown', 'KeyS', 's'].includes(e.code)) keys.down = false;
  });

  // Click or drag anywhere on the full screen to set course
  canvas.addEventListener('pointerdown', (e) => {
    waypoint = { x: e.clientX, y: e.clientY, pulse: 0 };
    sound.init();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons === 1) {
      waypoint = { x: e.clientX, y: e.clientY, pulse: 0 };
    }
  });

  // Foghorn button
  const btnHorn = document.getElementById('btn-horn');
  if (btnHorn) {
    btnHorn.addEventListener('click', () => {
      sound.init();
      sound.playFoghorn();
      triggerHornWave();
    });
  }

  function triggerHornWave() {
    particles.push({
      x: ship.x,
      y: ship.y,
      radius: 14,
      maxRadius: 220,
      life: 1.0,
      decay: 0.018,
      isSoundWave: true
    });
  }

  // Audio Toggle button
  const btnSound = document.getElementById('btn-sound-toggle');
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      sound.init();
      sound.toggle();
      updateAudioButtonUI();
    });
  }

  function updateAudioButtonUI() {
    const icon = document.getElementById('sound-icon');
    const label = document.getElementById('sound-label');
    if (!icon || !label) return;
    if (sound.enabled) {
      icon.textContent = '🔊';
      label.textContent = 'Audio';
    } else {
      icon.textContent = '🔇';
      label.textContent = 'Muted';
    }
  }

  // Mobile Touch Navigation Controls
  const bindTouch = (id, keyName) => {
    const el = document.getElementById(id);
    if (!el) return;
    const onStart = (e) => { e.preventDefault(); keys[keyName] = true; waypoint = null; sound.init(); };
    const onEnd = (e) => { e.preventDefault(); keys[keyName] = false; };
    el.addEventListener('pointerdown', onStart);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointerleave', onEnd);
    el.addEventListener('pointercancel', onEnd);
  };
  bindTouch('btn-touch-port', 'left');
  bindTouch('btn-touch-starboard', 'right');
  bindTouch('btn-touch-ahead', 'up');
  bindTouch('btn-touch-astern', 'down');

  // Start modal button
  const btnStart = document.getElementById('btn-start-game');
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      sound.init();
      startGame();
    });
  }

  function startGame() {
    gameState = 'PLAYING';
    const modal = document.getElementById('modal-start');
    if (modal) modal.classList.add('hidden');
    sound.playFoghorn();
    resetGame();
  }

  function resetGame() {
    deckSlots.length = 0;
    ship.x = canvas.width / 2;
    ship.y = canvas.height / 2;
    ship.angle = -Math.PI / 2;
    ship.speed = 0;
    waypoint = null;

    particles = [];
    containers = [];

    // Spawn 5 containers across the full screen
    for (let i = 0; i < 5; i++) {
      spawnContainer();
    }

    // Ambient gentle water current streaks
    waterCurrents = [];
    const count = Math.floor((canvas.width * canvas.height) / 36000);
    for (let i = 0; i < count; i++) {
      waterCurrents.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: 30 + Math.random() * 50,
        speed: 0.15 + Math.random() * 0.3
      });
    }
  }

  // --- CONTAINER SPAWNER ---
  function spawnContainer() {
    const margin = 80;
    const w = canvas.width;
    const h = canvas.height;

    let x, y, dist;
    let attempts = 0;
    do {
      x = margin + Math.random() * (w - margin * 2);
      y = margin + Math.random() * (h - margin * 2);
      const dx = x - ship.x;
      const dy = y - ship.y;
      dist = Math.sqrt(dx * dx + dy * dy);
      attempts++;
    } while (dist < 140 && attempts < 25);

    const colorObj = CONTAINER_COLORS[Math.floor(Math.random() * CONTAINER_COLORS.length)];

    containers.push({
      x, y,
      width: 32,
      height: 16,
      angle: Math.random() * Math.PI,
      color: colorObj,
      bobPhase: Math.random() * Math.PI * 2,
      glintTimer: Math.random() * 3,
      spawnScale: 0.05
    });

    // Water splash rings on spawn
    particles.push({
      x, y,
      radius: 4,
      maxRadius: 32,
      life: 1.0,
      decay: 0.035,
      isWaterRing: true
    });
  }

  // --- UPDATE LOGIC ---
  function update(dt) {
    // 1. Autopilot towards waypoint if clicked/tapped
    if (waypoint) {
      waypoint.pulse += 0.08;
      const dx = waypoint.x - ship.x;
      const dy = waypoint.y - ship.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 26) {
        waypoint = null;
      } else {
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - ship.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) > 0.08) {
          ship.angle += Math.sign(angleDiff) * ship.turnRate * (0.8 + Math.abs(ship.speed) * 0.2);
        }

        if (ship.speed < ship.maxForwardSpeed) {
          ship.speed += ship.accel * 0.85;
        }
      }
    }

    // 2. Manual Keyboard / Touch Steering
    if (keys.up) {
      if (ship.speed < ship.maxForwardSpeed) ship.speed += ship.accel;
    } else if (keys.down) {
      if (ship.speed > ship.maxReverseSpeed) ship.speed -= ship.brake;
    } else if (!waypoint) {
      ship.speed *= ship.friction;
      if (Math.abs(ship.speed) < 0.02) ship.speed = 0;
    }

    const effectiveTurn = ship.turnRate * (0.4 + Math.abs(ship.speed) * 0.18);
    if (keys.left) {
      ship.angle -= (ship.speed >= 0 ? effectiveTurn : -effectiveTurn);
    }
    if (keys.right) {
      ship.angle += (ship.speed >= 0 ? effectiveTurn : -effectiveTurn);
    }

    // 3. Move Ship
    ship.x += Math.cos(ship.angle) * ship.speed;
    ship.y += Math.sin(ship.angle) * ship.speed;

    // 4. Fullscreen Boundaries
    const halfLen = ship.length / 2;
    const boundMargin = halfLen * 0.75 + 10;

    let hitEdge = false;
    if (ship.x < boundMargin) {
      ship.x = boundMargin;
      ship.speed *= 0.65;
      hitEdge = true;
    } else if (ship.x > canvas.width - boundMargin) {
      ship.x = canvas.width - boundMargin;
      ship.speed *= 0.65;
      hitEdge = true;
    }

    if (ship.y < boundMargin) {
      ship.y = boundMargin;
      ship.speed *= 0.65;
      hitEdge = true;
    } else if (ship.y > canvas.height - boundMargin) {
      ship.y = canvas.height - boundMargin;
      ship.speed *= 0.65;
      hitEdge = true;
    }

    if (hitEdge && Math.abs(ship.speed) > 0.8) {
      sound.playBumperBump();
    }

    // 5. Propeller Wake Foam
    ship.wakeTimer++;
    if (Math.abs(ship.speed) > 0.4 && ship.wakeTimer % 2 === 0) {
      const sternOffset = -halfLen * 0.82;
      const cos = Math.cos(ship.angle);
      const sin = Math.sin(ship.angle);
      const sternX = ship.x + cos * sternOffset;
      const sternY = ship.y + sin * sternOffset;

      particles.push({
        x: sternX - sin * 6,
        y: sternY + cos * 6,
        vx: -cos * (ship.speed * 0.35) + (Math.random() - 0.5) * 0.5,
        vy: -sin * (ship.speed * 0.35) + (Math.random() - 0.5) * 0.5,
        radius: 2.5 + Math.random() * 2,
        maxRadius: 8 + Math.random() * 6,
        life: 1.0,
        decay: 0.024
      });
      particles.push({
        x: sternX + sin * 6,
        y: sternY - cos * 6,
        vx: -cos * (ship.speed * 0.35) + (Math.random() - 0.5) * 0.5,
        vy: -sin * (ship.speed * 0.35) + (Math.random() - 0.5) * 0.5,
        radius: 2.5 + Math.random() * 2,
        maxRadius: 8 + Math.random() * 6,
        life: 1.0,
        decay: 0.024
      });
    }

    // 6. Water Currents
    for (let c of waterCurrents) {
      c.x += c.speed;
      if (c.x > canvas.width + 50) {
        c.x = -50;
        c.y = Math.random() * canvas.height;
      }
    }

    // 7. Perimeter Buoy Blinking
    for (let b of perimeterBuoys) {
      b.flash += dt;
      b.bob += dt * 2.2;
    }

    // 8. Containers & Collection (Zero Scoring: purely audio + visual deck loading!)
    for (let i = containers.length - 1; i >= 0; i--) {
      const c = containers[i];
      c.bobPhase += dt * 2.5;
      c.glintTimer += dt;

      if (c.spawnScale < 1.0) {
        c.spawnScale += (1.0 - c.spawnScale) * 0.16;
        if (c.spawnScale > 0.99) c.spawnScale = 1.0;
      }

      // Check collision with ship
      const dx = c.x - ship.x;
      const dy = c.y - ship.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 48) {
        // COLLECTED!
        sound.playContainerPickup();

        // Visibly load container into ship's cargo deck bays!
        deckSlots.push(c.color);
        if (deckSlots.length > MAX_DECK_SLOTS) {
          deckSlots.shift();
        }

        // Cargo water ring splash
        particles.push({
          x: c.x,
          y: c.y,
          radius: 8,
          maxRadius: 36,
          life: 1.0,
          decay: 0.035,
          isWaterRing: true
        });

        // Colorful loading sparks
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          particles.push({
            x: c.x,
            y: c.y,
            vx: Math.cos(ang) * (2 + Math.random() * 2.5),
            vy: Math.sin(ang) * (2 + Math.random() * 2.5),
            radius: 3,
            maxRadius: 1,
            life: 1.0,
            decay: 0.04,
            isCargoSpark: true,
            color: c.color.hex
          });
        }

        containers.splice(i, 1);

        // Spawn a replacement container in another open spot
        setTimeout(() => {
          if (containers.length < 5) {
            spawnContainer();
          }
        }, 500);
      }
    }

    // Keep minimum 4 containers active
    if (containers.length < 4) {
      spawnContainer();
    }

    // 9. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.isSoundWave || p.isWaterRing) {
        p.radius += (p.maxRadius - p.radius) * 0.06;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.radius += (p.maxRadius - p.radius) * 0.06;
      }
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // --- RENDERING ---
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Fullscreen Harbor Ocean Background
    const waterGrad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 80,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.8
    );
    waterGrad.addColorStop(0, '#13475e');
    waterGrad.addColorStop(1, '#0a2533');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Faint Chart Grid & Compass Rose
    renderHarborChartGrid();

    // 3. Water Current Streaks
    renderWaterCurrents();

    // 4. Perimeter Navigational Safety Buoys
    renderPerimeterBuoys();

    // 5. Waypoint Beacon
    if (waypoint) {
      renderWaypoint();
    }

    // 6. Particles (Wake & Splashes)
    renderParticles();

    // 7. Floating Shipping Containers
    renderContainers();

    // 8. Containership
    renderContainership();
  }

  function renderHarborChartGrid() {
    ctx.strokeStyle = 'rgba(67, 188, 205, 0.08)';
    ctx.lineWidth = 1;

    const step = 100;
    ctx.beginPath();
    for (let x = step; x < canvas.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = step; y < canvas.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // Compass Rose in Center
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.strokeStyle = 'rgba(244, 237, 219, 0.07)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function renderWaterCurrents() {
    ctx.strokeStyle = 'rgba(244, 237, 219, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let c of waterCurrents) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + c.len, c.y);
      ctx.stroke();
    }
  }

  function renderPerimeterBuoys() {
    for (let b of perimeterBuoys) {
      const bobY = Math.sin(b.bob) * 2;
      const isFlash = Math.sin(b.flash * 4) > 0.45;

      ctx.beginPath();
      ctx.arc(b.x, b.y + bobY, 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(244, 237, 219, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x, b.y + bobY, 6, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.strokeStyle = '#003c57';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isFlash) {
        ctx.beginPath();
        ctx.arc(b.x, b.y + bobY - 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }
  }

  function renderWaypoint() {
    ctx.save();
    ctx.translate(waypoint.x, waypoint.y);

    const r = 16 + Math.sin(waypoint.pulse * 3) * 4;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#43bccd';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(244, 237, 219, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-r - 4, 0); ctx.lineTo(r + 4, 0);
    ctx.moveTo(0, -r - 4); ctx.lineTo(0, r + 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();

    ctx.restore();
  }

  function renderParticles() {
    for (let p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

      if (p.isSoundWave) {
        ctx.strokeStyle = `rgba(67, 188, 205, ${p.life * 0.45})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (p.isWaterRing) {
        ctx.strokeStyle = `rgba(244, 237, 219, ${p.life * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (p.isCargoSpark) {
        ctx.fillStyle = p.color;
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(244, 237, 219, ${p.life * 0.55})`;
        ctx.fill();
      }
    }
  }

  function renderContainers() {
    for (let c of containers) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.scale(c.spawnScale, c.spawnScale);

      const bob = Math.sin(c.bobPhase) * 1.5;

      // Shadow
      ctx.fillStyle = 'rgba(10, 37, 51, 0.4)';
      ctx.fillRect(-c.width / 2 + 3, -c.height / 2 + 3 + bob, c.width, c.height);

      // Steel Container Box
      ctx.fillStyle = c.color.hex;
      ctx.fillRect(-c.width / 2, -c.height / 2 + bob, c.width, c.height);

      // Corrugated ridges
      ctx.strokeStyle = c.color.border;
      ctx.lineWidth = 1.2;
      for (let rx = -c.width / 2 + 5; rx < c.width / 2 - 3; rx += 5) {
        ctx.beginPath();
        ctx.moveTo(rx, -c.height / 2 + bob + 1);
        ctx.lineTo(rx, c.height / 2 + bob - 1);
        ctx.stroke();
      }

      // Border outline
      ctx.strokeStyle = '#003c57';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-c.width / 2, -c.height / 2 + bob, c.width, c.height);

      // Water ripple ring around container
      ctx.strokeStyle = 'rgba(244, 237, 219, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-c.width / 2 - 2, -c.height / 2 + bob - 2, c.width + 4, c.height + 4);

      // Gentle glint
      if (Math.sin(c.glintTimer * 2) > 0.85) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-c.width / 4, -c.height / 4 + bob, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function renderContainership() {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    const halfW = ship.width / 2;
    const halfL = ship.length / 2;

    // 1. Water Shadow
    ctx.beginPath();
    ctx.moveTo(halfL + 4, 0 + 4);
    ctx.quadraticCurveTo(halfL * 0.6 + 4, halfW + 4, -halfL * 0.8 + 4, halfW + 4);
    ctx.lineTo(-halfL + 4, halfW * 0.75 + 4);
    ctx.lineTo(-halfL + 4, -halfW * 0.75 + 4);
    ctx.lineTo(-halfL * 0.8 + 4, -halfW + 4);
    ctx.quadraticCurveTo(halfL * 0.6 + 4, -halfW + 4, halfL + 4, 0 + 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10, 37, 51, 0.45)';
    ctx.fill();

    // 2. Red Waterline Antifouling Trim
    ctx.beginPath();
    ctx.moveTo(halfL + 2, 0);
    ctx.quadraticCurveTo(halfL * 0.6, halfW + 2, -halfL * 0.8, halfW + 2);
    ctx.lineTo(-halfL, halfW * 0.75 + 1);
    ctx.lineTo(-halfL, -halfW * 0.75 - 1);
    ctx.lineTo(-halfL * 0.8, -halfW - 2);
    ctx.quadraticCurveTo(halfL * 0.6, -halfW - 2, halfL + 2, 0);
    ctx.closePath();
    ctx.fillStyle = '#c0392b';
    ctx.fill();

    // 3. Steel Cargo Vessel Hull
    ctx.beginPath();
    ctx.moveTo(halfL, 0);
    ctx.quadraticCurveTo(halfL * 0.6, halfW, -halfL * 0.8, halfW);
    ctx.lineTo(-halfL, halfW * 0.75);
    ctx.lineTo(-halfL, -halfW * 0.75);
    ctx.lineTo(-halfL * 0.8, -halfW);
    ctx.quadraticCurveTo(halfL * 0.6, -halfW, halfL, 0);
    ctx.closePath();
    ctx.fillStyle = '#213a48';
    ctx.fill();
    ctx.strokeStyle = '#003c57';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. White Bullwark Edge Trim
    ctx.beginPath();
    ctx.moveTo(halfL - 2, 0);
    ctx.quadraticCurveTo(halfL * 0.6 - 1, halfW - 1.5, -halfL * 0.8, halfW - 1.5);
    ctx.lineTo(-halfL + 2, halfW * 0.7);
    ctx.lineTo(-halfL + 2, -halfW * 0.7);
    ctx.lineTo(-halfL * 0.8, -halfW + 1.5);
    ctx.quadraticCurveTo(halfL * 0.6 - 1, -halfW + 1.5, halfL - 2, 0);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(244, 237, 219, 0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 5. Forecastle Deck
    ctx.fillStyle = '#2d5165';
    ctx.beginPath();
    ctx.moveTo(halfL - 4, 0);
    ctx.lineTo(halfL * 0.55, halfW - 4);
    ctx.lineTo(halfL * 0.55, -halfW + 4);
    ctx.closePath();
    ctx.fill();

    // Anchor winches
    ctx.fillStyle = '#f4eddb';
    ctx.beginPath();
    ctx.arc(halfL * 0.68, -4, 2, 0, Math.PI * 2);
    ctx.arc(halfL * 0.68, 4, 2, 0, Math.PI * 2);
    ctx.fill();

    // 6. Central Cargo Bays (Containers Stacked on Deck!)
    const bayStartX = halfL * 0.44;
    const bayEndX = -halfL * 0.45;
    const bayStep = (bayStartX - bayEndX) / MAX_DECK_SLOTS;
    const contW = bayStep * 0.86;
    const contH = ship.width * 0.68;

    for (let slot = 0; slot < MAX_DECK_SLOTS; slot++) {
      const bx = bayStartX - slot * bayStep - contW / 2;
      const by = -contH / 2;

      // Bay cell guide
      ctx.fillStyle = '#162b37';
      ctx.fillRect(bx, by, contW, contH);
      ctx.strokeStyle = 'rgba(0, 60, 87, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, contW, contH);

      // If slot has a collected container, render it on deck!
      if (slot < deckSlots.length) {
        const cColor = deckSlots[slot];
        ctx.fillStyle = cColor.hex;
        ctx.fillRect(bx + 1, by + 1, contW - 2, contH - 2);

        ctx.strokeStyle = cColor.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + contW / 2, by + 1);
        ctx.lineTo(bx + contW / 2, by + contH - 1);
        ctx.stroke();

        ctx.strokeStyle = '#003c57';
        ctx.strokeRect(bx + 1, by + 1, contW - 2, contH - 2);
      }
    }

    // 7. Stern Bridge Superstructure
    const bridgeX = -halfL * 0.62;
    const bridgeW = 18;
    const bridgeH = ship.width * 0.85;

    ctx.fillStyle = '#f4eddb';
    ctx.fillRect(bridgeX - bridgeW / 2, -bridgeH / 2, bridgeW, bridgeH);
    ctx.strokeStyle = '#003c57';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bridgeX - bridgeW / 2, -bridgeH / 2, bridgeW, bridgeH);

    // Bridge Windows
    ctx.fillStyle = '#0a2533';
    ctx.fillRect(bridgeX + bridgeW / 2 - 3, -bridgeH / 2 + 2, 2.5, bridgeH - 4);

    // Radar Mast
    ctx.fillStyle = '#e83f40';
    ctx.beginPath();
    ctx.arc(bridgeX - 1, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Exhaust Smokestack Funnel
    const funnelX = bridgeX - bridgeW / 2 - 6;
    ctx.fillStyle = '#003c57';
    ctx.fillRect(funnelX - 3, -4, 6, 8);
    ctx.fillStyle = '#e83f40';
    ctx.fillRect(funnelX - 3, -2, 6, 4);

    ctx.restore();
  }

  // --- ANIMATION LOOP ---
  function gameLoop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (gameState === 'PLAYING') {
      update(dt);
    }
    render();

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);

})();
