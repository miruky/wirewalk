// テーマの設定値と解決ロジック。DOMには触れず、保存値の検証・自動解決・
// 次の状態への巡回だけを純粋に扱う。実際の適用(data-theme属性の付け替え)は
// main.ts が、描画前の初期適用は index.html のインラインスクリプトが担う。

export type ThemePref = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'wirewalk:theme';

// 巡回順。自動を起点に、明示のライト・ダークへ送る
const ORDER: ThemePref[] = ['system', 'light', 'dark'];

export const PREF_LABEL: Record<ThemePref, string> = {
  system: '自動',
  light: 'ライト',
  dark: 'ダーク',
};

export function isThemePref(value: unknown): value is ThemePref {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readPref(getItem: (key: string) => string | null): ThemePref {
  const stored = getItem(THEME_KEY);
  return isThemePref(stored) ? stored : 'system';
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function nextPref(pref: ThemePref): ThemePref {
  const index = ORDER.indexOf(pref);
  return ORDER[(index + 1) % ORDER.length] as ThemePref;
}
