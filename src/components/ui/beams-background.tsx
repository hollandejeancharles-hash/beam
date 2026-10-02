import React, { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}
// Adapted from the supplied Beams Background: viewport layer rather than a demo hero.
export function BeamsBackground({
  className,
  intensity = "subtle",
}: {
  className?: string;
  intensity?: "subtle" | "medium" | "strong";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    reduced = useReducedMotion();
  useEffect(() => {
    const canvas = canvasRef.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let width = 0,
      height = 0,
      frame = 0,
      last = 0,
      beams: Beam[] = [];
    const strength = { subtle: 0.7, medium: 0.7, strong: 1 }[intensity];
    function create(): Beam {
      return {
        x: Math.random() * width * 1.5 - width * 0.25,
        y: Math.random() * height * 1.5 - height * 0.25,
        width: 30 + Math.random() * 60,
        length: height * 2.5,
        angle: -35 + Math.random() * 10,
        speed: 0.6 + Math.random() * 1.2,
        opacity: 0.12 + Math.random() * 0.16,
        hue: 190 + Math.random() * 70,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
      };
    }
    function size() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      beams = Array.from({ length: width < 700 ? 12 : 20 }, create);
      if (reduced) draw(0);
    }
    function draw(delta: number) {
      ctx!.clearRect(0, 0, width, height);
      ctx!.filter = "blur(30px)";
      beams.forEach((b, index) => {
        b.y -= b.speed * delta;
        b.pulse += b.pulseSpeed * delta;
        if (b.y + b.length < -100) {
          b.y = height + 100;
          b.x =
            (((index % 3) + 0.5) * width) / 3 +
            ((Math.random() - 0.5) * width) / 6;
          b.width = 100 + Math.random() * 100;
          b.speed = 0.5 + Math.random() * 0.4;
        }
        ctx!.save();
        ctx!.translate(b.x, b.y);
        ctx!.rotate((b.angle * Math.PI) / 180);
        const alpha = b.opacity * (0.8 + Math.sin(b.pulse) * 0.2) * strength,
          g = ctx!.createLinearGradient(0, 0, 0, b.length);
        for (const [at, multiplier] of [
          [0, 0],
          [0.1, 0.5],
          [0.4, 1],
          [0.6, 1],
          [0.9, 0.5],
          [1, 0],
        ])
          g.addColorStop(at, `hsla(${b.hue},85%,65%,${alpha * multiplier})`);
        ctx!.fillStyle = g;
        ctx!.fillRect(-b.width / 2, 0, b.width, b.length);
        ctx!.restore();
      });
    }
    function loop(now: number) {
      const delta = last ? Math.min((now - last) / 16.67, 2) : 0;
      last = now;
      draw(delta);
      frame = requestAnimationFrame(loop);
    }
    function visibility() {
      cancelAnimationFrame(frame);
      last = 0;
      if (!document.hidden && !reduced) frame = requestAnimationFrame(loop);
    }
    size();
    draw(0);
    visibility();
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [intensity, reduced]);
  return (
    <div className={cn("beams-background", className)} aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="beams-veil" />
    </div>
  );
}
