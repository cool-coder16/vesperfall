// All audio is synthesized with the Web Audio API: no samples, no copyrighted sound.
// `sfx(name)` fires a one-shot; `music.play(mode)` runs a generative ambient score.

type SfxName = 'draw' | 'play' | 'attack' | 'hit' | 'heal' | 'death' | 'spell' | 'click' | 'turn' | 'victory' | 'defeat' | 'pack' | 'reveal' | 'levelup' | 'error' | 'block' | 'wither' | 'coin';

class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxGain!: GainNode;
  musicGain!: GainNode;
  enabled = true;
  musicEnabled = true;
  private musicTimer: number | null = null;
  private musicMode: 'menu' | 'dawn' | 'umbral' | 'off' = 'off';
  private noiseBuf: AudioBuffer | null = null;

  init(): boolean {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch { return false; }
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.35; this.musicGain.connect(this.master);
    return true;
  }
  setVolumes(sfx: number, music: number) { if (!this.ctx) return; this.sfxGain.gain.value = sfx; this.musicGain.gain.value = music; }

  private noise(): AudioBuffer {
    const ctx = this.ctx!;
    if (this.noiseBuf) return this.noiseBuf;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf; return buf;
  }
  private tone(freq: number, type: OscillatorType, t0: number, dur: number, vol: number, dest: AudioNode, opts: { slide?: number; attack?: number; detune?: number } = {}) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  private burst(t0: number, dur: number, vol: number, filterFreq: number, dest: AudioNode, q = 1, slideTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(filterFreq, t0); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t0); src.stop(t0 + dur + 0.05);
  }

  sfx(name: SfxName) {
    if (!this.enabled || !this.init()) return;
    const ctx = this.ctx!, t = ctx.currentTime, d = this.sfxGain;
    switch (name) {
      case 'click': this.tone(880, 'triangle', t, 0.05, 0.12, d); break;
      case 'draw': this.burst(t, 0.18, 0.25, 1800, d, 0.7, 4000); break;
      case 'play': this.burst(t, 0.12, 0.35, 300, d, 0.8, 120); this.tone(220, 'sine', t, 0.2, 0.25, d, { slide: 110 }); this.tone(1320, 'sine', t + 0.03, 0.3, 0.08, d); break;
      case 'attack': this.burst(t, 0.25, 0.4, 900, d, 0.6, 3500); break;
      case 'hit': this.burst(t, 0.2, 0.6, 180, d, 0.9, 60); this.tone(90, 'square', t, 0.15, 0.25, d, { slide: 40 }); break;
      case 'block': this.burst(t, 0.15, 0.5, 2500, d, 2); this.tone(600, 'triangle', t, 0.12, 0.2, d, { slide: 300 }); break;
      case 'heal': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 'sine', t + i * 0.07, 0.5, 0.15, d, { attack: 0.03 })); break;
      case 'death': this.burst(t, 0.4, 0.5, 400, d, 0.5, 80); this.tone(160, 'sawtooth', t, 0.4, 0.15, d, { slide: 50 }); break;
      case 'wither': this.tone(400, 'sawtooth', t, 0.35, 0.12, d, { slide: 120 }); this.burst(t, 0.3, 0.2, 600, d, 1.5, 200); break;
      case 'spell': [0, 0.05, 0.1, 0.15].forEach((o, i) => this.tone(900 + i * 300, 'sine', t + o, 0.4, 0.1, d)); this.burst(t, 0.4, 0.2, 5000, d, 0.4); break;
      case 'turn': this.tone(440, 'sine', t, 0.6, 0.2, d, { attack: 0.02 }); this.tone(660, 'sine', t + 0.1, 0.7, 0.15, d, { attack: 0.02 }); break;
      case 'victory': [523, 659, 784, 1046, 1318].forEach((f, i) => { this.tone(f, 'triangle', t + i * 0.12, 0.8, 0.2, d, { attack: 0.02 }); this.tone(f / 2, 'sine', t + i * 0.12, 1.0, 0.12, d); }); break;
      case 'defeat': [330, 311, 294, 247].forEach((f, i) => this.tone(f, 'sawtooth', t + i * 0.35, 1.2, 0.12, d, { attack: 0.1 })); this.tone(55, 'sine', t, 2.5, 0.3, d, { attack: 0.3 }); break;
      case 'pack': this.burst(t, 0.6, 0.3, 300, d, 0.5, 2000); this.tone(110, 'sine', t, 0.6, 0.3, d, { slide: 220 }); break;
      case 'reveal': this.tone(1200, 'sine', t, 0.5, 0.15, d, { attack: 0.01 }); this.tone(1800, 'sine', t + 0.05, 0.6, 0.1, d); this.burst(t, 0.3, 0.15, 6000, d, 0.5); break;
      case 'levelup': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 'triangle', t + i * 0.08, 0.6, 0.18, d, { attack: 0.01 })); break;
      case 'error': this.tone(200, 'square', t, 0.15, 0.1, d); this.tone(150, 'square', t + 0.15, 0.2, 0.1, d); break;
      case 'coin': this.tone(1760, 'sine', t, 0.25, 0.15, d); this.tone(2217, 'sine', t + 0.06, 0.3, 0.12, d); break;
    }
  }

  /** Generative ambient score: a slow drone, a shimmering pad and a sparse arpeggio in a minor mode. */
  playMusic(mode: 'menu' | 'dawn' | 'umbral' | 'off') {
    if (mode === this.musicMode) return;
    this.stopMusic();
    this.musicMode = mode;
    if (mode === 'off' || !this.musicEnabled || !this.init()) return;
    const ctx = this.ctx!;
    const root = mode === 'dawn' ? 220 : mode === 'umbral' ? 196 : 207.65;
    const scale = mode === 'umbral' ? [0, 1, 3, 5, 7, 8, 10] : mode === 'dawn' ? [0, 2, 3, 5, 7, 8, 11] : [0, 2, 3, 5, 7, 9, 10];
    const dest = this.musicGain;
    let step = 0;
    const tick = () => {
      if (this.musicMode !== mode) return;
      const t = ctx.currentTime + 0.05;
      const bar = 2.4;
      // drone
      this.tone(root / 2, 'sine', t, bar + 0.3, 0.12, dest, { attack: 0.8 });
      this.tone(root / 2 * 1.5, 'sine', t, bar + 0.3, 0.05, dest, { attack: 1.2, detune: 4 });
      if (step % 2 === 0) this.tone(root / 4, 'triangle', t, bar * 2, 0.08, dest, { attack: 1.5 });
      // pad
      const deg = scale[(step * 2) % scale.length];
      this.tone(root * Math.pow(2, deg / 12), 'triangle', t + 0.2, bar, 0.035, dest, { attack: 0.9, detune: -6 });
      this.tone(root * Math.pow(2, (deg + 7) / 12), 'triangle', t + 0.4, bar, 0.025, dest, { attack: 0.9, detune: 6 });
      // arpeggio (sparse)
      for (let i = 0; i < 4; i++) {
        if (Math.random() < 0.55) {
          const n = scale[Math.floor(Math.random() * scale.length)] + 12 * (1 + (Math.random() < 0.3 ? 1 : 0));
          this.tone(root * Math.pow(2, n / 12), 'sine', t + i * (bar / 4), 0.9, mode === 'umbral' ? 0.03 : 0.045, dest, { attack: 0.02 });
        }
      }
      if (mode === 'umbral' && Math.random() < 0.3) this.burst(t + Math.random() * bar, 1.2, 0.03, 200, dest, 0.5, 90);
      if (mode === 'dawn' && Math.random() < 0.25) this.tone(root * 4, 'sine', t + Math.random() * bar, 1.4, 0.02, dest, { attack: 0.3 });
      step++;
      this.musicTimer = window.setTimeout(tick, bar * 1000);
    };
    tick();
  }
  stopMusic() { if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; } this.musicMode = 'off'; }
  setMusicEnabled(on: boolean) { this.musicEnabled = on; if (!on) this.stopMusic(); }
}

export const audio = new Audio();
export const sfx = (n: SfxName) => audio.sfx(n);
