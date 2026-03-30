import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO,
  isValidHost,
  normalizeHost,
  scenarioFromHash,
  scenarioToHash,
} from './scenario';

describe('isValidHost', () => {
  it('一般的なドメイン名を受け付ける', () => {
    expect(isValidHost('example.com')).toBe(true);
    expect(isValidHost('www.example.co.jp')).toBe(true);
    expect(isValidHost('a-b.example.dev')).toBe(true);
  });

  it('単一ラベル・不正文字・ハイフン位置を拒否する', () => {
    expect(isValidHost('localhost')).toBe(false);
    expect(isValidHost('exa mple.com')).toBe(false);
    expect(isValidHost('-bad.example.com')).toBe(false);
    expect(isValidHost('bad-.example.com')).toBe(false);
    expect(isValidHost('')).toBe(false);
  });
});

describe('normalizeHost', () => {
  it('スキームとパスを取り除いて小文字化する', () => {
    expect(normalizeHost('https://Example.COM/path?q=1')).toBe('example.com');
    expect(normalizeHost('  www.example.jp  ')).toBe('www.example.jp');
  });

  it('正規化しても不正ならnull', () => {
    expect(normalizeHost('https://')).toBeNull();
    expect(normalizeHost('not a host')).toBeNull();
  });
});

describe('hashとの相互変換', () => {
  it('往復で同じシナリオに戻る', () => {
    const scenario = { host: 'blog.example.jp', tls: false, dnsCached: true };
    expect(scenarioFromHash(scenarioToHash(scenario))).toEqual(scenario);
  });

  it('既定値はhostだけの短いハッシュになる', () => {
    expect(scenarioToHash(DEFAULT_SCENARIO)).toBe('#host=example.com');
  });

  it('壊れたハッシュはnull', () => {
    expect(scenarioFromHash('')).toBeNull();
    expect(scenarioFromHash('#host=bad host')).toBeNull();
    expect(scenarioFromHash('#tls=off')).toBeNull();
  });
});
