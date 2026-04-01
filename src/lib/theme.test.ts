import { describe, expect, it } from 'vitest';
import { isThemePref, nextPref, readPref, resolveTheme, THEME_KEY } from './theme';

describe('theme', () => {
  it('保存値が三値以外なら自動に倒す', () => {
    expect(readPref(() => null)).toBe('system');
    expect(readPref(() => 'なにか')).toBe('system');
    expect(readPref((k) => (k === THEME_KEY ? 'dark' : null))).toBe('dark');
  });

  it('自動はシステムの明暗で解決し、明示指定はそのまま返す', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('巡回は自動→ライト→ダーク→自動の輪になる', () => {
    expect(nextPref('system')).toBe('light');
    expect(nextPref('light')).toBe('dark');
    expect(nextPref('dark')).toBe('system');
  });

  it('isThemePrefは三値だけ通す', () => {
    expect(isThemePref('system')).toBe(true);
    expect(isThemePref('light')).toBe(true);
    expect(isThemePref('dark')).toBe(true);
    expect(isThemePref('auto')).toBe(false);
    expect(isThemePref(null)).toBe(false);
  });
});
