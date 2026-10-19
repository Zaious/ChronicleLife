/**
 * 配色 token 與對比計算 — 純函式,無 DOM / 平台依賴(CLAUDE.md 硬規則 3)。
 * 視覺語言沿用 Basesmall / SmalLoL:藍灰近黑底 + 單一琥珀強調色,
 * 文字一律坐在「膠囊」上,不論桌布或網頁背景都讀得清。
 * 分類色是資料色,不在這裡;這裡只有介面本身的顏色。
 */

export type ThemeMode = 'dark' | 'light';

export interface Palette {
  /** 視窗底色(不透明模式的實底) */
  background: string;
  /** 膠囊、輸入框、面板的底色 —— 所有文字都坐在這上面 */
  panel: string;
  border: string;
  text: string;
  /** 次要文字(日期、提示) */
  muted: string;
  /** 強調(文字與控制項用):倒數時間、勾選、滑桿 —— 對比 ≥ 4.5 */
  accent: string;
  /** 強調(填色用):「下一件」的底色與外框、主按鈕的邊框;淺色主題比 accent 亮,才不會把底色染髒 */
  accentFill: string;
  /** 逾期、到期檢查點、危險操作 */
  strike: string;
  /** 膠囊與卡片的陰影色 */
  shadow: string;
}

/** 深色 = basesmall / smallol 的預設風格;淺色是同一套邏輯的反相,強調色加深以維持對比。 */
export const PALETTES: Record<ThemeMode, Palette> = {
  dark: {
    background: '#15171C',
    panel: '#1B1E24',
    border: '#2A2E37',
    text: '#E8EAEE',
    muted: '#A0A6B1',
    accent: '#E8B04A',
    accentFill: '#E8B04A',
    strike: '#D9643F',
    shadow: 'rgba(0, 0, 0, 0.35)',
  },
  light: {
    background: '#F2F3F6',
    panel: '#FFFFFF',
    border: '#D5D9E1',
    text: '#1B1E24',
    muted: '#5A6272',
    accent: '#9A6200',
    accentFill: '#D99A1E',
    strike: '#BF3F0F',
    shadow: 'rgba(20, 24, 40, 0.14)',
  },
};

/** #RRGGBB → [r, g, b](0–255)。輸入非法就丟錯,不靜默算出 NaN。 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`invalid hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** hex + alpha(夾在 0~1)→ "rgba(r, g, b, a)"。 */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x 相對亮度。 */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 對比值(1~21),與前後景順序無關。 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** 文字背後的總不透明度下限:視窗底 + 膠囊疊起來至少這麼實,任何桌布上都讀得清。 */
export const MIN_BACKING_OPACITY = 0.88;

/** 膠囊本身至少保留的不透明度,否則在 90% 視窗底上膠囊會消失、失去「一格一格」的外觀。 */
const MIN_CAPSULE_ALPHA = 0.7;

/**
 * 膠囊底色的不透明度,依視窗不透明度而定:
 * - 視窗實底(≥ 0.995):膠囊也實底,只靠 panel 與 background 的色差分出層次。
 * - 視窗越透明,膠囊越實,讓 1 − (1 − 視窗)(1 − 膠囊) ≥ MIN_BACKING_OPACITY。
 */
export function capsuleAlpha(windowOpacity: number): number {
  const o = Math.min(1, Math.max(0, windowOpacity));
  if (o >= 0.995) return 1;
  const needed = 1 - (1 - MIN_BACKING_OPACITY) / (1 - o);
  return Math.min(1, Math.max(MIN_CAPSULE_ALPHA, needed));
}

export type BackgroundKind = 'solid' | 'semi' | 'clear';

/** 不透明度 → 背景模式(對應設定面板的「不透明 / 半透明 / 透明」三檔)。 */
export function backgroundKind(windowOpacity: number): BackgroundKind {
  if (windowOpacity >= 0.95) return 'solid';
  if (windowOpacity <= 0.15) return 'clear';
  return 'semi';
}

/** 三檔背景的代表不透明度(設定面板的快速切換用)。 */
export const BACKGROUND_PRESETS: Record<BackgroundKind, number> = {
  solid: 1,
  semi: 0.62,
  clear: 0,
};
