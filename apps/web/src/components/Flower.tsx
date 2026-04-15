type Phase = "seed" | "sprout" | "bloom";

interface FlowerProps {
  hue: number;
  yieldUsd: number;
  principalUsd: number;
  phase: Phase;
  sway?: boolean;
  size?: number;
  petalColor?: string;
  petalShade?: string;
  coreColor?: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Pixel-art petal shape, rendered as a grid of squares.
// Rows go tip (top, row 0) -> base (bottom, last row). Petal is rendered
// translated above core so row 0 is farthest from center.
// 0 = empty, 1 = fill, 2 = highlight, 3 = shade.
const PETAL_PATTERN: number[][] = [
  [0, 0, 1, 0, 0],
  [0, 1, 1, 1, 0],
  [1, 2, 1, 1, 3],
  [1, 2, 1, 3, 3],
  [1, 1, 1, 1, 3],
  [0, 1, 1, 1, 0],
  [0, 0, 1, 0, 0],
];

export function Flower({
  hue,
  yieldUsd,
  principalUsd,
  phase,
  sway = true,
  size = 84,
  petalColor,
  petalShade,
  coreColor,
}: FlowerProps) {
  const yieldT = clamp(yieldUsd / 10, 0.25, 1);
  void principalUsd;

  const petalCount = 6;

  const center = size / 2;
  const px = Math.max(2, Math.round(size * (0.03 + yieldT * 0.02)));
  const petalCols = PETAL_PATTERN[0].length;
  const petalRows = PETAL_PATTERN.length;
  const petalW = petalCols * px;
  const petalH = petalRows * px;
  const coreR = px * 1.8 + yieldT * px;

  const fill = petalColor ?? `hsl(${hue} 80% 60%)`;
  const shade = petalShade ?? `hsl(${hue} 85% 38%)`;
  const highlight = petalColor ? "rgba(255,255,255,0.5)" : `hsl(${hue} 95% 80%)`;
  const core = coreColor ?? `hsl(${(hue + 40) % 360} 95% 65%)`;
  const coreShade = `hsl(${(hue + 40) % 360} 80% 35%)`;

  if (phase === "seed") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g
          className="seed-drop-anim"
          style={{
            animation: "seed-drop 300ms cubic-bezier(0.34,1.56,0.64,1) both",
            transformOrigin: `${center}px ${center}px`,
          }}
        >
          <rect
            x={center - px}
            y={center - px}
            width={px * 2}
            height={px * 2}
            fill={shade}
            shapeRendering="crispEdges"
          />
        </g>
      </svg>
    );
  }

  // pixel coords for one upright petal, with base at (0,0)
  const petalCells: { x: number; y: number; c: string }[] = [];
  for (let r = 0; r < petalRows; r++) {
    for (let c = 0; c < petalCols; c++) {
      const v = PETAL_PATTERN[r][c];
      if (!v) continue;
      const color = v === 2 ? highlight : v === 3 ? shade : fill;
      // base row is bottom (r = petalRows-1). Petal grows upward.
      petalCells.push({
        x: (c - (petalCols - 1) / 2) * px,
        y: -(petalRows - r) * px,
        c: color,
      });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
      shapeRendering="crispEdges"
    >
      <g
        className={sway ? "flower-sway-anim" : undefined}
        style={
          sway
            ? {
                animation: `flower-sway ${4 + (hue % 30) / 15}s ease-in-out infinite`,
                animationDelay: `${(hue % 100) / 100}s`,
                transformOrigin: `${center}px ${size}px`,
                transformBox: "fill-box",
              }
            : undefined
        }
      >
        {Array.from({ length: petalCount }).map((_, i) => {
          const angle = (i / petalCount) * 360;
          // place petal: rotate around center, then translate up so base sits at coreR from center
          const tx = center;
          const ty = center - coreR;
          return (
            <g key={i} transform={`rotate(${angle} ${center} ${center}) translate(${tx} ${ty})`}>
              <g
                className="petal-bloom-anim"
                style={{
                  transformOrigin: "50% 100%",
                  transformBox: "fill-box",
                  animation:
                    phase === "bloom"
                      ? `petal-bloom 600ms cubic-bezier(0.22,1,0.36,1) both`
                      : undefined,
                  animationDelay: `${i * 40}ms`,
                }}
              >
                {petalCells.map((cell, j) => (
                  <rect key={j} x={cell.x} y={cell.y} width={px} height={px} fill={cell.c} />
                ))}
                {/* invisible anchor box so transform-box: fill-box has full petal extent */}
                <rect
                  x={-petalW / 2}
                  y={-petalH}
                  width={petalW}
                  height={petalH}
                  fill="transparent"
                />
              </g>
            </g>
          );
        })}
        {/* core: 2x2 block of pixels with shade ring */}
        <g>
          {[
            { dx: -1, dy: -1, c: core },
            { dx: 0, dy: -1, c: core },
            { dx: -1, dy: 0, c: core },
            { dx: 0, dy: 0, c: coreShade },
          ].map((b, i) => (
            <rect
              key={i}
              x={center + b.dx * coreR}
              y={center + b.dy * coreR}
              width={coreR}
              height={coreR}
              fill={b.c}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
