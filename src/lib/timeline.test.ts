import { describe, expect, it } from 'vitest';
import { buildTimeline, type Phase } from './timeline';

const FULL = { host: 'example.com', tls: true, dnsCached: false };

function phases(scenario: typeof FULL): Phase[] {
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
