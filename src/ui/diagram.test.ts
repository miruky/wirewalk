// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../lib/timeline';
import { Diagram } from './diagram';

const SCENARIO = {
  host: 'example.com',
  tls: true,
  tlsVersion: '1.3' as const,
  dnsCached: false,
  rttMs: 80,
};

function mount(): { host: HTMLElement; diagram: Diagram } {
  const host = document.createElement('div');
  document.body.append(host);
  const diagram = new Diagram(host);
  diagram.setTimeline(buildTimeline(SCENARIO));
  return { host, diagram };
}

describe('Diagram', () => {
  it('ノードの数だけライフラインと名札を描く', () => {
    const { host } = mount();
    expect(host.querySelectorAll('.lifeline').length).toBe(6);
    expect(host.querySelectorAll('.actor-name').length).toBe(6);
    expect(host.querySelector('svg')?.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
  });

  it('ステップの数だけ矢印を用意し、最初はすべて隠れている', () => {
    const { host, diagram } = mount();
    expect(host.querySelectorAll('.arrow').length).toBe(diagram.stepCount());
    expect(host.querySelectorAll('.arrow.hidden').length).toBe(diagram.stepCount());
  });

  it('setProgressで現在までの矢印が見え、現在だけcurrentになる', () => {
    const { host, diagram } = mount();
    diagram.setProgress(4);
    expect(host.querySelectorAll('.arrow.hidden').length).toBe(diagram.stepCount() - 5);
    expect(host.querySelectorAll('.arrow.current').length).toBe(1);
    expect(host.querySelectorAll('.arrow.done').length).toBe(4);
  });

  it('進めてから戻すと表示も巻き戻る', () => {
    const { host, diagram } = mount();
    diagram.setProgress(10);
    diagram.setProgress(0);
    expect(host.querySelectorAll('.arrow.done').length).toBe(0);
    expect(host.querySelectorAll('.arrow.current').length).toBe(1);
  });

  it('フェーズの切り替わりにだけ見出しチップが付く', () => {
    const { host } = mount();
    const chips = [...host.querySelectorAll('.phase-chip')].map((el) => el.textContent);
    expect(chips).toEqual([
      'DNS解決',
      'TCPハンドシェイク',
      'TLSネゴシエーション',
      'HTTPやりとり',
      'TCPクローズ',
    ]);
  });

  it('タイムラインを差し替えると矢印が作り直される', () => {
    const { host, diagram } = mount();
    diagram.setTimeline(buildTimeline({ ...SCENARIO, dnsCached: true, tls: false }));
    expect(host.querySelectorAll('.arrow').length).toBe(diagram.stepCount());
    expect(host.querySelectorAll('.lifeline').length).toBe(3);
  });
});
