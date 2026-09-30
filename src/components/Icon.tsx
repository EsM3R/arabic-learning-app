/**
 * Çizgi ikonlar — emojinin yerine.
 *
 * Emoji her telefonda başka çizilir (Samsung'da bir, Pixel'de başka) ve
 * arayüze oyuncak havası verir. Bu ikonlar tek çizgi kalınlığında, rengi
 * metinle aynı akar. Yollar Lucide ikon setinden (ISC lisansı) uyarlandı;
 * yeni bir paket eklemek yerine buraya gömülü: yerel modül yok, derleme
 * riski yok.
 */
import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

type Shape =
  | { d: string }
  | { circle: [number, number, number]; fill?: boolean }
  | { rect: [number, number, number, number, number]; fill?: boolean };

const ICONS = {
  home: [{ d: "M3 10.5 12 3l9 7.5" }, { d: "M5 9.5V21h14V9.5" }],
  grid: [
    { rect: [3, 3, 7, 7, 1.5] },
    { rect: [14, 3, 7, 7, 1.5] },
    { rect: [3, 14, 7, 7, 1.5] },
    { rect: [14, 14, 7, 7, 1.5] },
  ],
  book: [{ d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" }],
  bookOpen: [
    { d: "M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" },
    { d: "M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" },
  ],
  user: [{ circle: [12, 8, 4] }, { d: "M4 21a8 8 0 0 1 16 0" }],
  mic: [
    { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" },
    { d: "M19 10v2a7 7 0 0 1-14 0v-2" },
    { d: "M12 19v3" },
  ],
  message: [{ d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }],
  sentence: [{ d: "M4 7h10" }, { d: "M4 12h16" }, { d: "M4 17h7" }],
  repeat: [
    { d: "M3 12a9 9 0 0 1 15-6.7L21 8" },
    { d: "M21 3v5h-5" },
    { d: "M21 12a9 9 0 0 1-15 6.7L3 16" },
    { d: "M8 16H3v5" },
  ],
  replay: [{ d: "M3 12a9 9 0 1 0 3-6.7L3 8" }, { d: "M3 3v5h5" }],
  chevronRight: [{ d: "m9 18 6-6-6-6" }],
  chevronLeft: [{ d: "m15 18-6-6 6-6" }],
  chevronDown: [{ d: "m6 9 6 6 6-6" }],
  close: [{ d: "M18 6 6 18M6 6l12 12" }],
  check: [{ d: "M20 6 9 17l-5-5" }],
  flame: [
    {
      d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z",
    },
  ],
  volume: [{ d: "M11 5 6 9H2v6h4l5 4z" }, { d: "M15.5 8.5a5 5 0 0 1 0 7" }, { d: "M19 5a10 10 0 0 1 0 14" }],
  keyboard: [{ rect: [2, 5, 20, 14, 2] }, { d: "M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10" }],
  stop: [{ rect: [6, 6, 12, 12, 2] }],
  clock: [{ circle: [12, 12, 9] }, { d: "M12 7v5l3 2" }],
  headphones: [
    {
      d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
    },
  ],
  wave: [{ d: "M2 12h2" }, { d: "M6 8v8" }, { d: "M10 5v14" }, { d: "M14 8v8" }, { d: "M18 10v4" }, { d: "M22 12h-2" }],
  bulb: [{ d: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" }],
  settings: [
    { circle: [12, 12, 3] },
    {
      d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    },
  ],
  globe: [{ circle: [12, 12, 9] }, { d: "M3 12h18" }, { d: "M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" }],
  sparkles: [
    { d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" },
    { d: "M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" },
  ],
  award: [{ circle: [12, 9, 6] }, { d: "M8.5 13.5 7 22l5-3 5 3-1.5-8.5" }],
  alert: [{ d: "M12 3 2 20h20z" }, { d: "M12 10v4" }, { d: "M12 17.5h.01" }],
  trash: [{ d: "M3 6h18" }, { d: "M8 6V4h8v2" }, { d: "M19 6l-1 14H6L5 6" }],
  plus: [{ d: "M12 5v14M5 12h14" }],
  play: [{ d: "M7 4v16l13-8z" }],
  pause: [{ rect: [6, 4, 4, 16, 1] }, { rect: [14, 4, 4, 16, 1] }],
  slow: [{ circle: [12, 13, 8] }, { d: "M12 9v4l2 2" }, { d: "M9 2h6" }],
  target: [{ circle: [12, 12, 9] }, { circle: [12, 12, 5] }, { circle: [12, 12, 1], fill: true }],
  arrowRight: [{ d: "M5 12h14" }, { d: "m13 6 6 6-6 6" }],
  info: [{ circle: [12, 12, 9] }, { d: "M12 16v-5" }, { d: "M12 8h.01" }],
  eye: [{ d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" }, { circle: [12, 12, 3] }],
  eyeOff: [{ d: "M3 3l18 18" }, { d: "M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" }],
  layers: [{ d: "m12 2 10 5-10 5L2 7z" }, { d: "m2 17 10 5 10-5" }, { d: "m2 12 10 5 10-5" }],
  zap: [{ d: "M13 2 3 14h9l-1 8 10-12h-9z" }],
  pen: [{ d: "M12 20h9" }, { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" }],
  chart: [{ d: "M3 3v18h18" }, { d: "M7 15l4-4 3 3 5-6" }],
  bell: [{ d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" }, { d: "M10.3 21a1.9 1.9 0 0 0 3.4 0" }],
  download: [{ d: "M12 3v12" }, { d: "m7 10 5 5 5-5" }, { d: "M5 21h14" }],
  upload: [{ d: "M12 21V9" }, { d: "m7 14 5-5 5 5" }, { d: "M5 3h14" }],
  scene: [{ rect: [3, 4, 18, 14, 2] }, { d: "M8 21h8" }, { d: "M12 18v3" }],
  timer: [{ circle: [12, 13, 8] }, { d: "M12 9v4" }, { d: "M9 2h6" }],
  note: [{ d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }, { d: "M14 2v6h6" }, { d: "M8 13h8M8 17h5" }],
  bookmark: [{ d: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" }],
  key: [{ circle: [7.5, 15.5, 4.5] }, { d: "M10.7 12.3 21 2" }, { d: "m16 7 3 3" }],
  wallet: [{ rect: [3, 6, 18, 14, 2] }, { d: "M3 10h18" }, { d: "M16 15h2" }],
  moreH: [{ circle: [5, 12, 1.2], fill: true }, { circle: [12, 12, 1.2], fill: true }, { circle: [19, 12, 1.2], fill: true }],
  refresh: [{ d: "M21 12a9 9 0 1 1-3-6.7L21 8" }, { d: "M21 3v5h-5" }],
  hand: [{ d: "M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" }, { d: "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" }],
  ear: [{ d: "M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 0 1-7 0" }, { d: "M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 0 1 0 4" }],
  logout: [{ d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }, { d: "m16 17 5-5-5-5" }, { d: "M21 12H9" }],
  // Cümle Kurma: hikâyenin zirve ve sentez cümleleri (yol çizelgesi noktaları).
  mountain: [{ d: "m8 3 4 8 5-5 5 15H2L8 3z" }],
  star: [{ d: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z" }],
  // Bağlacı cümlede bulup ikiye ayırmak.
  scissors: [{ circle: [6, 6, 3] }, { circle: [6, 18, 3] }, { d: "M20 4 8.1 15.9" }, { d: "M14.5 14.5 20 20" }, { d: "M8.1 8.1 12 12" }],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export default function Icon({
  name,
  size = 22,
  color = "#15201C",
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const shapes: Shape[] = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {shapes.map((s, i) => {
        if ("d" in s) {
          return (
            <Path
              key={i}
              d={s.d}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          );
        }
        if ("circle" in s) {
          const [cx, cy, r] = s.circle;
          return (
            <Circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              stroke={color}
              strokeWidth={strokeWidth}
              fill={s.fill ? color : "none"}
            />
          );
        }
        const [x, y, w, h, rx] = s.rect;
        return (
          <Rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={rx}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            fill={s.fill ? color : "none"}
          />
        );
      })}
    </Svg>
  );
}
