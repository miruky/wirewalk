// シナリオ(何への接続を眺めるか)の定義。ホスト名と2つのスイッチだけの
// 小さな状態で、URLハッシュと相互変換できるようにしておく。

export interface Scenario {
  host: string;
  tls: boolean;
  dnsCached: boolean;
}

export const DEFAULT_SCENARIO: Scenario = {
  host: 'example.com',
  tls: true,
  dnsCached: false,
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

export function scenarioToHash(scenario: Scenario): string {
  const params = new URLSearchParams();
  params.set('host', scenario.host);
  if (!scenario.tls) params.set('tls', 'off');
  if (scenario.dnsCached) params.set('cache', 'on');
  return `#${params.toString()}`;
}

export function scenarioFromHash(hash: string): Scenario | null {
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const host = normalizeHost(params.get('host') ?? '');
  if (!host) return null;
  return {
    host,
    tls: params.get('tls') !== 'off',
    dnsCached: params.get('cache') === 'on',
  };
}
