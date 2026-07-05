import React from 'react';

interface PdfLoadingOverlayProps {
  percent: number;
}

const VIEWBOX_SIZE = 200;
const CENTER = 100;
const RADIUS = 88;
const BOTTOM_Y = CENTER + RADIUS;
const TOP_Y = CENTER - RADIUS;
const FILL_RANGE = BOTTOM_Y - TOP_Y;

// A single repeating wave tile (400 wide = 4 wavelengths of 100), reused for
// both wave layers - only their vertical position, opacity, and horizontal
// animation speed/direction differ (see the liquid-wave-front/back CSS
// keyframes in index.css), which is what gives the layered water look.
const WAVE_PATH =
  'M-100,0 C-75,14 -25,-14 0,0 C25,14 75,-14 100,0 C125,14 175,-14 200,0 ' +
  'C225,14 275,-14 300,0 C325,14 375,-14 400,0 L400,40 L-100,40 Z';

/**
 * Purely presentational - takes a percent (0-100) and draws a circular
 * "liquid fill" gauge. Has no knowledge of PDF.js, loading tasks, or
 * anything else - PdfViewer.tsx is entirely responsible for computing what
 * percent to pass in, so this component can't affect loading behavior at all.
 */
export const PdfLoadingOverlay: React.FC<PdfLoadingOverlayProps> = ({ percent }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillTop = BOTTOM_Y - (clamped / 100) * FILL_RANGE;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#1a1d1e]">
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="w-40 h-40 sm:w-48 sm:h-48" role="img" aria-label={`Loading PDF, ${Math.round(clamped)}%`}>
        <defs>
          <clipPath id="liquid-loader-clip">
            <circle cx={CENTER} cy={CENTER} r={RADIUS} />
          </clipPath>
        </defs>

        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={3}
        />

        <g clipPath="url(#liquid-loader-clip)">
          <rect x={-10} y={fillTop + 6} width={VIEWBOX_SIZE + 20} height={FILL_RANGE + 20} fill="#e6cc9f" style={{ transition: 'y 0.4s ease-out' }} />

          <g style={{ transform: `translateY(${fillTop}px)`, transition: 'transform 0.4s ease-out' }}>
            <g className="liquid-wave-back" style={{ opacity: 0.55 }}>
              <path d={WAVE_PATH} fill="#e6cc9f" />
            </g>
            <g className="liquid-wave-front" style={{ opacity: 0.9 }}>
              <path d={WAVE_PATH} fill="#e6cc9f" />
            </g>
          </g>
        </g>

        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2} />

        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={32}
          fontWeight={700}
          fill="#ffffff"
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.45)', strokeWidth: 4 }}
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      <p className="text-brand-muted text-sm font-bold uppercase tracking-[0.2em]">Loading your PDF…</p>
    </div>
  );
};
