import { describe, expect, it } from 'vitest';
import type { Scenario } from './scenario';
import { buildTimeline, phaseSegments, type Phase } from './timeline';

const FULL: Scenario = {
  host: 'example.com',
  tls: true,
  tlsVersion: '1.3',
  dnsCached: false,
  rttMs: 80,
};

function phases(scenario: Scenario): Phase[] {
  return buildTimeline(scenario).steps.map((step) => step.phase);
}

describe('buildTimeline', () => {
  it('フルコースはDNS8 + TCP3 + TLS3 + HTTP2 + クローズ4の20ステップ', () => {
    const timeline = buildTimeline(FULL);
    expect(timeline.steps.length).toBe(20);
    const counts = timeline.steps.reduce<Record<string, number>>((acc, step) => {
      acc[step.phase] = (acc[step.phase] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ dns: 8, tcp: 3, tls: 3, http: 2, close: 4 });
  });

  it('フェーズはDNS→TCP→TLS→HTTP→クローズの順で混ざらない', () => {
    const order = [...new Set(phases(FULL))];
    expect(order).toEqual(['dns', 'tcp', 'tls', 'http', 'close']);
  });

  it('DNSキャッシュ命中なら問い合わせは2ステップで、ルート群が登場しない', () => {
    const timeline = buildTimeline({ ...FULL, dnsCached: true });
    expect(timeline.steps.filter((step) => step.phase === 'dns').length).toBe(2);
    const ids = timeline.actors.map((actor) => actor.id);
    expect(ids).toEqual(['client', 'resolver', 'server']);
  });

  it('HTTP(TLSなし)ではTLSフェーズが丸ごと消える', () => {
    const timeline = buildTimeline({ ...FULL, tls: false });
    expect(timeline.steps.some((step) => step.phase === 'tls')).toBe(false);
    expect(timeline.steps.length).toBe(17);
  });

  it('TLS1.2はハンドシェイクが4ステップ(2-RTT)になり全体は21ステップ', () => {
    const timeline = buildTimeline({ ...FULL, tlsVersion: '1.2' });
    expect(timeline.steps.filter((step) => step.phase === 'tls').length).toBe(4);
    expect(timeline.steps.length).toBe(21);
    const last = timeline.steps.filter((step) => step.phase === 'tls').at(-1);
    expect(last?.title).toContain('暗号化開始(サーバ)');
  });

  it('経過時間は片道遅延を積み上げ、往復遅延を変えると比例して伸びる', () => {
    const slow = buildTimeline({ ...FULL, rttMs: 200 });
    const fast = buildTimeline({ ...FULL, rttMs: 20 });
    expect(slow.steps[0]?.elapsedMs).toBe(100);
    expect(fast.steps[0]?.elapsedMs).toBe(10);
    const slowLast = slow.steps.at(-1)?.elapsedMs ?? 0;
    const fastLast = fast.steps.at(-1)?.elapsedMs ?? 0;
    expect(slowLast).toBeGreaterThan(fastLast);
  });

  it('TCPの番号が応答で正しく確認される', () => {
    const tcp = buildTimeline(FULL).steps.filter((step) => step.phase === 'tcp');
    expect(tcp[0]?.label).toContain('SYN seq=1000');
    expect(tcp[1]?.label).toContain('ack=1001');
    expect(tcp[2]?.label).toContain('ack=3001');
  });

  it('ホスト名がDNSの問い合わせとSNI・Hostヘッダに現れる', () => {
    const timeline = buildTimeline({ ...FULL, host: 'shop.example.jp' });
    const dnsQuery = timeline.steps[0];
    expect(dnsQuery?.label).toContain('shop.example.jp');
    const hello = timeline.steps.find((step) => step.title === 'ClientHello');
    expect(hello?.detail).toContain('shop.example.jp');
    const request = timeline.steps.find((step) => step.phase === 'http');
    expect(request?.label).toContain('Host: shop.example.jp');
  });

  it('委任応答にはTLDが反映される', () => {
    const timeline = buildTimeline({ ...FULL, host: 'www.example.jp' });
    const referral = timeline.steps.find((step) => step.title === '委任応答(ルート)');
    expect(referral?.label).toContain('.jp');
  });

  it('最初はクライアント発、最後はクローズのACKで終わる', () => {
    const { steps } = buildTimeline(FULL);
    expect(steps[0]?.from).toBe('client');
    expect(steps[steps.length - 1]?.phase).toBe('close');
    expect(steps[steps.length - 1]?.label).toContain('ACK');
  });

  it('登場ノードはステップに現れるものだけで、固定の並び順', () => {
    const timeline = buildTimeline(FULL);
    expect(timeline.actors.map((actor) => actor.id)).toEqual([
      'client',
      'resolver',
      'root',
      'tld',
      'auth',
      'server',
    ]);
  });
});

describe('phaseSegments', () => {
  it('連続フェーズをまとめ、開始位置と手数を返す', () => {
    const segments = phaseSegments(buildTimeline(FULL).steps);
    expect(segments.map((s) => s.phase)).toEqual(['dns', 'tcp', 'tls', 'http', 'close']);
    expect(segments.map((s) => s.count)).toEqual([8, 3, 3, 2, 4]);
    expect(segments.map((s) => s.start)).toEqual([0, 8, 11, 14, 16]);
    expect(segments[0]?.name).toBe('DNS解決');
  });

  it('手数の合計はステップ数に一致する', () => {
    const steps = buildTimeline({ ...FULL, tlsVersion: '1.2' }).steps;
    const total = phaseSegments(steps).reduce((sum, s) => sum + s.count, 0);
    expect(total).toBe(steps.length);
  });

  it('TLSなしではTLS区間が現れない', () => {
    const segments = phaseSegments(buildTimeline({ ...FULL, tls: false }).steps);
    expect(segments.some((s) => s.phase === 'tls')).toBe(false);
    expect(segments.map((s) => s.phase)).toEqual(['dns', 'tcp', 'http', 'close']);
  });
});
