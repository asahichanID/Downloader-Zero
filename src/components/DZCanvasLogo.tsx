import React, { useEffect, useRef } from 'react';

interface DZCanvasLogoProps {
  size?: number;
  className?: string;
  showGlow?: boolean;
  showCrown?: boolean;
  animated?: boolean;
}

/**
 * Permanent DZ Cyber-Shield Logo rendered directly via HTML5 Canvas.
 * Supports Retina/HiDPI scaling, specular neon gradients, and crisp vector geometry.
 */
export const DZCanvasLogo: React.FC<DZCanvasLogoProps> = ({
  size = 48,
  className = '',
  showGlow = true,
  showCrown = true,
  animated = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Support Retina / HiDPI crispness
    const dpr = typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 2) : 2;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const s = size / 100; // Normalized scale factor
    const cx = size / 2;
    const cy = size / 2;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // 1. Outer Neon Aura Glow
    if (showGlow) {
      const glowGrad = ctx.createRadialGradient(cx, cy, 20 * s, cx, cy, 48 * s);
      glowGrad.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
      glowGrad.addColorStop(0.6, 'rgba(37, 99, 235, 0.25)');
      glowGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 48 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Hexagonal Cyber Shield Geometry
    // Points: Top flat, angled upper shoulders, sleek vertical sides, tapered downward apex
    const shieldPoints: [number, number][] = [
      [32 * s, 18 * s], // Top-left shoulder
      [68 * s, 18 * s], // Top-right shoulder
      [86 * s, 34 * s], // Upper-right corner
      [82 * s, 68 * s], // Lower-right hip
      [50 * s, 92 * s], // Bottom apex
      [18 * s, 68 * s], // Lower-left hip
      [14 * s, 34 * s]  // Upper-left corner
    ];

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(shieldPoints[0][0], shieldPoints[0][1]);
    for (let i = 1; i < shieldPoints.length; i++) {
      ctx.lineTo(shieldPoints[i][0], shieldPoints[i][1]);
    }
    ctx.closePath();

    // Shield Background: Rich Obsidian to Cyber-Navy Gradient
    const shieldGrad = ctx.createLinearGradient(cx, 16 * s, cx, 92 * s);
    shieldGrad.addColorStop(0, '#040d21');
    shieldGrad.addColorStop(0.4, '#07163a');
    shieldGrad.addColorStop(0.85, '#0b255e');
    shieldGrad.addColorStop(1, '#030814');

    ctx.fillStyle = shieldGrad;
    ctx.fill();

    // Shield Outer Laser Border
    ctx.lineWidth = 2.4 * s;
    const borderGrad = ctx.createLinearGradient(14 * s, 18 * s, 86 * s, 92 * s);
    borderGrad.addColorStop(0, '#38bdf8');
    borderGrad.addColorStop(0.3, '#22d3ee');
    borderGrad.addColorStop(0.7, '#3b82f6');
    borderGrad.addColorStop(1, '#06b6d4');
    ctx.strokeStyle = borderGrad;
    ctx.stroke();

    // Inner Specular Chamfer Line
    ctx.beginPath();
    const innerInset = 4 * s;
    ctx.moveTo(34 * s, 22 * s);
    ctx.lineTo(66 * s, 22 * s);
    ctx.lineTo(81 * s, 36 * s);
    ctx.lineTo(77 * s, 66 * s);
    ctx.lineTo(50 * s, 87 * s);
    ctx.lineTo(23 * s, 66 * s);
    ctx.lineTo(19 * s, 36 * s);
    ctx.closePath();
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
    ctx.stroke();
    ctx.restore();

    // 3. Cyber Circuit Accents (Corner nodes)
    ctx.fillStyle = '#06b6d4';
    const nodes = [
      [22 * s, 38 * s],
      [78 * s, 38 * s],
      [50 * s, 85 * s]
    ];
    nodes.forEach(([nx, ny]) => {
      ctx.beginPath();
      ctx.arc(nx, ny, 1.2 * s, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Crown on Apex (if enabled)
    if (showCrown) {
      ctx.save();
      // Crown Base Line
      const crownY = 17 * s;
      ctx.beginPath();
      ctx.moveTo(36 * s, crownY);
      ctx.lineTo(64 * s, crownY);
      ctx.lineTo(67 * s, crownY - 5 * s); // Right peak
      ctx.lineTo(57 * s, crownY - 2 * s); // Inner right
      ctx.lineTo(50 * s, crownY - 8 * s); // Center high peak
      ctx.lineTo(43 * s, crownY - 2 * s); // Inner left
      ctx.lineTo(33 * s, crownY - 5 * s); // Left peak
      ctx.closePath();

      const crownGrad = ctx.createLinearGradient(33 * s, crownY - 8 * s, 67 * s, crownY);
      crownGrad.addColorStop(0, '#fef08a');
      crownGrad.addColorStop(0.3, '#f59e0b');
      crownGrad.addColorStop(0.7, '#fbbf24');
      crownGrad.addColorStop(1, '#d97706');

      ctx.fillStyle = crownGrad;
      ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
      ctx.shadowBlur = 4 * s;
      ctx.fill();

      // Crown Jewels (Cyan laser dots)
      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = 'rgba(34, 211, 238, 0.9)';
      ctx.shadowBlur = 3 * s;
      ctx.beginPath();
      ctx.arc(50 * s, crownY - 8 * s, 1.2 * s, 0, Math.PI * 2);
      ctx.arc(33 * s, crownY - 5 * s, 1 * s, 0, Math.PI * 2);
      ctx.arc(67 * s, crownY - 5 * s, 1 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. Letter "D" (Aerodynamic Cyber Polygon)
    ctx.save();
    // Shadow for depth
    ctx.shadowColor = 'rgba(6, 182, 212, 0.6)';
    ctx.shadowBlur = 6 * s;

    // "D" Outer Body
    ctx.beginPath();
    ctx.moveTo(23 * s, 33 * s); // Top-left
    ctx.lineTo(42 * s, 33 * s); // Top-right
    ctx.bezierCurveTo(53 * s, 33 * s, 54 * s, 48 * s, 52 * s, 53 * s); // Upper bulge
    ctx.bezierCurveTo(50 * s, 60 * s, 45 * s, 71 * s, 38 * s, 71 * s); // Lower bulge
    ctx.lineTo(23 * s, 71 * s); // Bottom-left
    ctx.closePath();

    // "D" Inner Cutout
    ctx.moveTo(31 * s, 41 * s);
    ctx.lineTo(31 * s, 63 * s);
    ctx.lineTo(38 * s, 63 * s);
    ctx.bezierCurveTo(43 * s, 63 * s, 44 * s, 55 * s, 43 * s, 52 * s);
    ctx.bezierCurveTo(42 * s, 47 * s, 41 * s, 41 * s, 36 * s, 41 * s);
    ctx.closePath();

    const dGrad = ctx.createLinearGradient(23 * s, 33 * s, 54 * s, 71 * s);
    dGrad.addColorStop(0, '#ffffff');
    dGrad.addColorStop(0.2, '#cffafe');
    dGrad.addColorStop(0.55, '#38bdf8');
    dGrad.addColorStop(1, '#1d4ed8');

    ctx.fillStyle = dGrad;
    ctx.fill('evenodd'); // Hollow out the inner loop!
    ctx.restore();

    // 6. Letter "Z" (Dynamic Lightning-Cut)
    ctx.save();
    ctx.shadowColor = 'rgba(34, 211, 238, 0.85)';
    ctx.shadowBlur = 8 * s;

    ctx.beginPath();
    // Top Bar
    ctx.moveTo(49 * s, 33 * s);
    ctx.lineTo(76 * s, 33 * s);
    ctx.lineTo(79 * s, 41 * s);
    ctx.lineTo(63 * s, 41 * s);

    // Diagonal Slash
    ctx.lineTo(76 * s, 63 * s);
    ctx.lineTo(78 * s, 71 * s);

    // Bottom Bar
    ctx.lineTo(47 * s, 71 * s);
    ctx.lineTo(44 * s, 63 * s);
    ctx.lineTo(62 * s, 63 * s);

    // Inner Diagonal Return
    ctx.lineTo(49 * s, 41 * s);
    ctx.closePath();

    const zGrad = ctx.createLinearGradient(46 * s, 33 * s, 79 * s, 71 * s);
    zGrad.addColorStop(0, '#ffffff');
    zGrad.addColorStop(0.25, '#67e8f9');
    zGrad.addColorStop(0.65, '#06b6d4');
    zGrad.addColorStop(1, '#2563eb');

    ctx.fillStyle = zGrad;
    ctx.fill();

    // 7. Core Energy Laser Slit in "Z"
    ctx.beginPath();
    ctx.moveTo(68 * s, 43 * s);
    ctx.lineTo(53 * s, 61 * s);
    ctx.lineWidth = 1.4 * s;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 4 * s;
    ctx.stroke();

    // 8. Lens Flare Star on Top-Right Corner of "Z"
    const fx = 78 * s;
    const fy = 34 * s;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 6 * s;

    // 4-Point Star
    ctx.beginPath();
    ctx.moveTo(fx, fy - 4 * s);
    ctx.quadraticCurveTo(fx, fy, fx + 4 * s, fy);
    ctx.quadraticCurveTo(fx, fy, fx, fy + 4 * s);
    ctx.quadraticCurveTo(fx, fy, fx - 4 * s, fy);
    ctx.quadraticCurveTo(fx, fy, fx, fy - 4 * s);
    ctx.fill();

    ctx.restore();

    // Update browser favicon dynamically with canvas logo for permanent brand identity
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (favicon && !favicon.href.includes('data:image')) {
        favicon.href = dataUrl;
      }
    } catch {}
  }, [size, showGlow, showCrown]);

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="w-full h-full object-contain pointer-events-none drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]"
      />
    </div>
  );
};
