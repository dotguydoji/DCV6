import React, { useEffect, useRef } from 'react';

export const NeuralNetwork: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isVisible = useRef(true);
  const isPageVisible = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let resizeFrameId = 0;
    let particles: Particle[] = [];
    let isAnimating = false;
    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 25 : 50;
    const connectionDistance = 150;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      blinkSpeed: number;
      opacity: number;

      constructor(w: number, h: number) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.2;
        this.size = Math.random() * 1.5 + 0.5;
        this.blinkSpeed = Math.random() * 0.01 + 0.005;
        this.opacity = 1;
      }

      update(w: number, h: number) {
        this.x += this.vx;
        this.y += this.vy;
        this.opacity = 0.3 + Math.abs(Math.sin(Date.now() * this.blinkSpeed)) * 0.7;

        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, 6.28);
        ctx.fillStyle = `rgba(255, 107, 0, ${this.opacity * 0.4})`;
        ctx.fill();
      }
    }

    const resize = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight || 400;
        particles = Array.from({ length: particleCount }, () => new Particle(canvas.width, canvas.height));
      }
    };

    const scheduleResize = () => {
      if (resizeFrameId) return;
      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = 0;
        resize();
      });
    };

    const drawConnections = () => {
      if (!ctx) return;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < connectionDistance * connectionDistance) {
            const dist = Math.sqrt(distSq);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            const alpha = (1 - (dist / connectionDistance)) * 0.2 * Math.min(p1.opacity, p2.opacity);
            ctx.strokeStyle = `rgba(255, 107, 0, ${alpha})`;
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      if (!isVisible.current || !isPageVisible.current) {
        isAnimating = false;
        return;
      }

      isAnimating = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update(canvas.width, canvas.height);
        particles[i].draw();
      }
      drawConnections();
      animationFrameId = requestAnimationFrame(animate);
    };

    const ensureAnimation = () => {
      if (!isAnimating && isVisible.current && isPageVisible.current) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    // Performance: Only animate when visible
    const observer = new IntersectionObserver((entries) => {
      isVisible.current = entries[0].isIntersecting;
      ensureAnimation();
    });
    observer.observe(canvas);

    const handleVisibilityChange = () => {
      isPageVisible.current = !document.hidden;
      ensureAnimation();
    };

    resize();
    ensureAnimation();

    window.addEventListener('resize', scheduleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('resize', scheduleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (resizeFrameId) {
        cancelAnimationFrame(resizeFrameId);
      }
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};
