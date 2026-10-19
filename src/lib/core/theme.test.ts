import { describe, it, expect } from 'vitest';
import {
  PALETTES,
  BACKGROUND_PRESETS,
  MIN_BACKING_OPACITY,
  hexToRgb,
  rgba,
  contrastRatio,
  capsuleAlpha,
  backgroundKind,
  type ThemeMode,
} from './theme';

const MODES: ThemeMode[] = ['dark', 'light'];

describe('hexToRgb / rgba', () => {
  it('解析 #RRGGBB(不分大小寫)', () => {
    expect(hexToRgb('#E8B04A')).toEqual([232, 176, 74]);
    expect(hexToRgb('#e8b04a')).toEqual([232, 176, 74]);
  });

  it('非法 hex 丟錯而不是算出 NaN', () => {
    expect(() => hexToRgb('#fff')).toThrow();
    expect(() => hexToRgb('red')).toThrow();
  });

  it('rgba 輸出並夾住 alpha', () => {
    expect(rgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(rgba('#FFFFFF', 2)).toBe('rgba(255, 255, 255, 1)');
    expect(rgba('#FFFFFF', -1)).toBe('rgba(255, 255, 255, 0)');
  });
});

describe('contrastRatio', () => {
  it('黑白 = 21,同色 = 1,且與順序無關', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });
});

describe('PALETTES 對比(同 basesmall 的樣式驗收線)', () => {
  for (const mode of MODES) {
    const p = PALETTES[mode];

    it(`${mode}:文字坐在膠囊上 ≥ 4.5、次要文字 ≥ 3`, () => {
      expect(contrastRatio(p.text, p.panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.muted, p.panel)).toBeGreaterThanOrEqual(3);
    });

    it(`${mode}:文字坐在視窗底上 ≥ 4.5(面板、彈出卡片直接用 background)`, () => {
      expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.muted, p.background)).toBeGreaterThanOrEqual(3);
    });

    it(`${mode}:強調色與逾期色當文字用時 ≥ 4.5(膠囊與視窗底兩種底都要)`, () => {
      for (const bg of [p.panel, p.background]) {
        expect(contrastRatio(p.accent, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.strike, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${mode}:所有顏色都是合法 hex(shadow 例外)`, () => {
      for (const [key, value] of Object.entries(p)) {
        if (key === 'shadow') continue;
        expect(() => hexToRgb(value)).not.toThrow();
      }
    });
  }
});

describe('capsuleAlpha', () => {
  it('視窗實底 → 膠囊實底', () => {
    expect(capsuleAlpha(1)).toBe(1);
  });

  it('文字背後的總不透明度在任何視窗不透明度下都 ≥ MIN_BACKING_OPACITY', () => {
    for (let i = 0; i <= 100; i++) {
      const o = i / 100;
      const c = capsuleAlpha(o);
      const backing = 1 - (1 - o) * (1 - c);
      expect(backing).toBeGreaterThanOrEqual(MIN_BACKING_OPACITY - 1e-9);
    }
  });

  it('全透明視窗 → 膠囊 = MIN_BACKING_OPACITY;預設 90% 視窗 → 保留 0.7 的膠囊外觀', () => {
    expect(capsuleAlpha(0)).toBeCloseTo(MIN_BACKING_OPACITY, 9);
    expect(capsuleAlpha(0.9)).toBeCloseTo(0.7, 9);
  });

  it('視窗越不透明,膠囊不會更實(o ∈ [0, 0.99] 單調不增;實底另計)', () => {
    let prev = capsuleAlpha(0);
    for (let i = 1; i <= 99; i++) {
      const c = capsuleAlpha(i / 100);
      expect(c).toBeLessThanOrEqual(prev + 1e-9);
      prev = c;
    }
  });

  it('實底是刻意的特例:0.99 → 0.7,1 → 1', () => {
    expect(capsuleAlpha(0.99)).toBeCloseTo(0.7, 9);
    expect(capsuleAlpha(1)).toBe(1);
  });

  it('超出範圍的輸入被夾住,不產生 NaN', () => {
    expect(capsuleAlpha(-5)).toBeCloseTo(MIN_BACKING_OPACITY, 9);
    expect(capsuleAlpha(5)).toBe(1);
  });
});

describe('backgroundKind / BACKGROUND_PRESETS', () => {
  it('三檔分界', () => {
    expect(backgroundKind(1)).toBe('solid');
    expect(backgroundKind(0.95)).toBe('solid');
    expect(backgroundKind(0.9)).toBe('semi');
    expect(backgroundKind(0.5)).toBe('semi');
    expect(backgroundKind(0.15)).toBe('clear');
    expect(backgroundKind(0)).toBe('clear');
  });

  it('每個預設值回推出自己的檔位', () => {
    for (const [kind, value] of Object.entries(BACKGROUND_PRESETS)) {
      expect(backgroundKind(value)).toBe(kind);
    }
  });
});
