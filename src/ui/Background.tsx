import { useEffect, useRef } from 'preact/hooks';
import { reducedMotion } from '../state/store';

/** Atmospheric canvas background: drifting embers (dawn), spores (umbral), fog and slow light. */
export function Background({ mood = 'menu' }: { mood?: 'menu' | 'dawn' | 'umbral' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!; const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, raf = 0, t = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { w = canvas.width = innerWidth * dpr; h = canvas.height = innerHeight * dpr; };
    resize(); addEventListener('resize', resize);
    const N = reducedMotion() ? 0 : mood === 'menu' ? 90 : 70;
    const parts = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 2.2, vx: (Math.random() - 0.5) * 0.25, vy: -(0.15 + Math.random() * 0.5), a: Math.random(), p: Math.random() * 6 }));
    const col = mood === 'umbral' ? [155, 92, 255] : mood === 'dawn' ? [255, 160, 70] : [243, 201, 105];
    const draw = () => {
      t += 0.004;
      ctx.clearRect(0, 0, w, h);
      // slow moving light
      const g = ctx.createRadialGradient(w * (0.5 + Math.sin(t) * 0.2), h * 0.25, 0, w * 0.5, h * 0.3, w * 0.8);
      g.addColorStop(0, `rgba(${col.join(',')},${mood === 'umbral' ? 0.08 : 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // fog bands
      for (let i = 0; i < 3; i++) {
        const y = h * (0.6 + i * 0.13) + Math.sin(t * 2 + i) * 20 * dpr;
        const fg = ctx.createLinearGradient(0, y - 80 * dpr, 0, y + 80 * dpr);
        fg.addColorStop(0, 'rgba(60,40,80,0)'); fg.addColorStop(0.5, `rgba(60,40,80,${0.07 - i * 0.015})`); fg.addColorStop(1, 'rgba(60,40,80,0)');
        ctx.fillStyle = fg; ctx.fillRect(0, y - 80 * dpr, w, 160 * dpr);
      }
      for (const p of parts) {
        p.x += p.vx * dpr + Math.sin(t * 3 + p.p) * 0.2 * dpr; p.y += p.vy * dpr;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        const alpha = (0.25 + 0.75 * Math.abs(Math.sin(t * 4 + p.p))) * 0.8;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col.join(',')},${alpha})`; ctx.shadowColor = `rgba(${col.join(',')},0.9)`; ctx.shadowBlur = 8 * dpr; ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (N > 0) raf = requestAnimationFrame(draw); 
    };
    draw();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, [mood]);
  return <><canvas ref={ref} class="bg-canvas" aria-hidden="true" /><div class="bg-vignette" aria-hidden="true" /></>;
}
