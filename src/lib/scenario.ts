// シナリオ(何への接続を、どんな条件で眺めるか)の定義。ホスト名と数個の
// スイッチだけの小さな状態を、URLハッシュと相互変換できるようにしておく。
// 既定から外れた項目だけをハッシュに載せ、共有URLを短く保つ。

export type TlsVersion = '1.3' | '1.2';

export interface Scenario {
  host: string;
  tls: boolean;
  tlsVersion: TlsVersion;
  dnsCached: boolean;
  rttMs: number;
}

// 往復遅延の想定値。近距離・一般・遠距離の三段で、経過時間の体感を変える
export const RTT_CHOICES = [20, 80, 200] as const;
export const DEFAULT_RTT = 80;

export const DEFAULT_SCENARIO: Scenario = {
  host: 'example.com',
  tls: true,
  tlsVersion: '1.3',
  dnsCached: false,
  rttMs: DEFAULT_RTT,
};

// ラベル用途なので実在検証はしない。形式だけ厳しめに見る
const HOST_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function isValidHost(host: string): boolean {
  return host.length <= 253 && HOST_PATTERN.test(host);
}

export function normalizeHost(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '');
  return isValidHost(host) ? host : null;
}

function normalizeRtt(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RTT;
  return Math.min(2000, Math.max(1, Math.round(value)));
}

export function scenarioToHash(scenario: Scenario): string {
  const params = new URLSearchParams();
  params.set('host', scenario.host);
  if (!scenario.tls) params.set('tls', 'off');
  if (scenario.tls && scenario.tlsVersion === '1.2') params.set('tlsv', '1.2');
  if (scenario.dnsCached) params.set('cache', 'on');
  if (scenario.rttMs !== DEFAULT_RTT) params.set('rtt', String(scenario.rttMs));
  return `#${params.toString()}`;
}

export function scenarioFromHash(hash: string): Scenario | null {
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const host = normalizeHost(params.get('host') ?? '');
  if (!host) return null;
  const tls = params.get('tls') !== 'off';
  const rttParam = params.get('rtt');
  return {
    host,
    tls,
    tlsVersion: tls && params.get('tlsv') === '1.2' ? '1.2' : '1.3',
    dnsCached: params.get('cache') === 'on',
    rttMs: rttParam === null ? DEFAULT_RTT : normalizeRtt(Number(rttParam)),
  };
}
