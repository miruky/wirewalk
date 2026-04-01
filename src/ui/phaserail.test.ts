// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../lib/scenario';
import { buildTimeline } from '../lib/timeline';
import { PhaseRail } from './phaserail';

const SCENARIO: Scenario = {
  host: 'example.com',
  tls: true,
  tlsVersion: '1.3',
  dnsCached: false,
  rttMs: 80,
};

function mount(): { host: HTMLElement; rail: PhaseRail; jumps: number[] } {
  const host = document.createElement('div');
  const jumps: number[] = [];
  const rail = new PhaseRail(host, (i) => jumps.push(i));
  rail.setTimeline(buildTimeline(SCENARIO));
  return { host, rail, jumps };
}

describe('PhaseRail', () => {
  it('フェーズごとに目盛りを作り、手数を表示する', () => {
    const { host } = mount();
    expect(host.querySelectorAll('.rail-item').length).toBe(5);
    expect([...host.querySelectorAll('.rail-count')].map((el) => el.textContent)).toEqual([
      '8手',
      '3手',
      '3手',
      '2手',
      '4手',
    ]);
  });

  it('現在地のフェーズだけがactiveになり、過ぎた区間はdone', () => {
    const { host, rail } = mount();
    rail.setActive(9); // TCP区間(8〜10)の途中
    const items = [...host.querySelectorAll('.rail-item')];
    expect(items[0]?.classList.contains('done')).toBe(true);
    expect(items[1]?.classList.contains('active')).toBe(true);
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[2]?.classList.contains('active')).toBe(false);
    expect(items[2]?.hasAttribute('aria-current')).toBe(false);
  });

  it('進捗バーは区間内の到達度を幅で表す', () => {
    const { host, rail } = mount();
    rail.setActive(8); // TCP区間の1手目(3手中1手)
    const tcpFill = host.querySelectorAll<HTMLElement>('.rail-fill')[1];
    expect(tcpFill?.style.width).toBe('33%');
    rail.setActive(20); // 最後まで進めるとDNS区間は満了
    const dnsFill = host.querySelectorAll<HTMLElement>('.rail-fill')[0];
    expect(dnsFill?.style.width).toBe('100%');
  });

  it('目盛りをクリックするとそのフェーズの先頭へ飛ぶ', () => {
    const { host, jumps } = mount();
    (host.querySelectorAll('.rail-item')[2] as HTMLButtonElement).click(); // TLS
    expect(jumps).toEqual([11]); // DNS8 + TCP3
  });

  it('差し替えで目盛りが作り直される(TLSなし)', () => {
    const { host, rail } = mount();
    rail.setTimeline(buildTimeline({ ...SCENARIO, tls: false }));
    expect([...host.querySelectorAll('.rail-name')].map((el) => el.textContent)).toEqual([
      'DNS解決',
      'TCPハンドシェイク',
      'HTTPやりとり',
      'TCPクローズ',
    ]);
  });
});
