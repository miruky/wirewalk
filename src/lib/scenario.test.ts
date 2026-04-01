import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO,
  exportBasename,
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
    const scenario = {
      host: 'blog.example.jp',
      tls: false,
      tlsVersion: '1.3' as const,
      dnsCached: true,
      rttMs: 200,
    };
    expect(scenarioFromHash(scenarioToHash(scenario))).toEqual(scenario);
  });

  it('TLS1.2と遅延の指定も往復する', () => {
    const scenario = {
      host: 'shop.example.com',
      tls: true,
      tlsVersion: '1.2' as const,
      dnsCached: false,
      rttMs: 20,
    };
    const hash = scenarioToHash(scenario);
    expect(hash).toContain('tlsv=1.2');
    expect(hash).toContain('rtt=20');
    expect(scenarioFromHash(hash)).toEqual(scenario);
  });

  it('既定値はhostだけの短いハッシュになる', () => {
    expect(scenarioToHash(DEFAULT_SCENARIO)).toBe('#host=example.com');
  });

  it('TLSを切るとTLSバージョンはハッシュに出さず1.3に倒れる', () => {
    const hash = scenarioToHash({
      host: 'example.org',
      tls: false,
      tlsVersion: '1.2',
      dnsCached: false,
      rttMs: 80,
    });
    expect(hash).toBe('#host=example.org&tls=off');
    expect(scenarioFromHash(hash)?.tlsVersion).toBe('1.3');
  });

  it('範囲外の遅延は既定に丸める', () => {
    expect(scenarioFromHash('#host=example.com&rtt=99999')?.rttMs).toBe(2000);
    expect(scenarioFromHash('#host=example.com&rtt=abc')?.rttMs).toBe(80);
  });

  it('壊れたハッシュはnull', () => {
    expect(scenarioFromHash('')).toBeNull();
    expect(scenarioFromHash('#host=bad host')).toBeNull();
    expect(scenarioFromHash('#tls=off')).toBeNull();
  });
});

describe('exportBasename', () => {
  it('既定はホスト名とTLSバージョンを連ねる', () => {
    expect(exportBasename(DEFAULT_SCENARIO)).toBe('wirewalk-example.com-tls13');
  });

  it('TLSを切るとhttp、キャッシュ命中は接尾辞が付く', () => {
    expect(exportBasename({ ...DEFAULT_SCENARIO, tls: false })).toBe('wirewalk-example.com-http');
    expect(exportBasename({ ...DEFAULT_SCENARIO, tlsVersion: '1.2', dnsCached: true })).toBe(
      'wirewalk-example.com-tls12-cached',
    );
  });
});
