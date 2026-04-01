// シナリオから、登場ノードと通信ステップの時系列を組み立てる。
// 内容は決定的で、描画や再生速度には関知しない。解説文はここに集約し、
// 教材としての正確さ(TLS 1.3の1-RTT、TLS 1.2の2-RTT、TCPの全二重クローズ等)を保つ。
// 各ステップには、片道遅延を積み上げた概算の経過時間も持たせる。

import type { Scenario } from './scenario';

export type ActorId = 'client' | 'resolver' | 'root' | 'tld' | 'auth' | 'server';

export interface Actor {
  id: ActorId;
  name: string;
  role: string;
}

export type Phase = 'dns' | 'tcp' | 'tls' | 'http' | 'close';

export interface Step {
  phase: Phase;
  from: ActorId;
  to: ActorId;
  label: string;
  title: string;
  detail: string;
  elapsedMs: number;
}

type RawStep = Omit<Step, 'elapsedMs'>;

export interface Timeline {
  actors: Actor[];
  steps: Step[];
}

export const PHASE_NAMES: Record<Phase, string> = {
  dns: 'DNS解決',
  tcp: 'TCPハンドシェイク',
  tls: 'TLSネゴシエーション',
  http: 'HTTPやりとり',
  close: 'TCPクローズ',
};

export interface PhaseSegment {
  phase: Phase;
  name: string;
  start: number;
  count: number;
}

// 連続する同一フェーズのステップをひとまとまりにする。フェーズの目盛り(rail)に使う。
// タイムラインはフェーズが混ざらない前提だが、隣接判定で一般化しておく。
export function phaseSegments(steps: Step[]): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  steps.forEach((step, index) => {
    const last = segments[segments.length - 1];
    if (last && last.phase === step.phase) {
      last.count += 1;
    } else {
      segments.push({ phase: step.phase, name: PHASE_NAMES[step.phase], start: index, count: 1 });
    }
  });
  return segments;
}

const ALL_ACTORS: Record<ActorId, Actor> = {
  client: { id: 'client', name: 'ブラウザ', role: 'クライアント' },
  resolver: { id: 'resolver', name: 'フルリゾルバ', role: 'ISP等のDNSキャッシュ' },
  root: { id: 'root', name: 'ルート', role: 'DNSルートサーバ' },
  tld: { id: 'tld', name: 'TLD', role: 'トップレベルドメイン' },
  auth: { id: 'auth', name: '権威', role: 'ゾーンの権威サーバ' },
  server: { id: 'server', name: 'Webサーバ', role: '接続先' },
};

function tldOf(host: string): string {
  const parts = host.split('.');
  return parts[parts.length - 1] ?? 'com';
}

function dnsSteps(scenario: Scenario): RawStep[] {
  const { host } = scenario;
  const query = `${host} の A レコードは?`;
  if (scenario.dnsCached) {
    return [
      {
        phase: 'dns',
        from: 'client',
        to: 'resolver',
        label: `query ${host} A`,
        title: '名前解決の依頼',
        detail: `ブラウザはOSのスタブリゾルバ経由で、フルリゾルバに「${query}」と問い合わせる。`,
      },
      {
        phase: 'dns',
        from: 'resolver',
        to: 'client',
        label: 'answer 93.184.215.14(キャッシュ)',
        title: 'キャッシュヒット',
        detail:
          'フルリゾルバはTTLが残っている回答をキャッシュから即座に返す。ルートやTLDへの問い合わせは発生しない。',
      },
    ];
  }
  return [
    {
      phase: 'dns',
      from: 'client',
      to: 'resolver',
      label: `query ${host} A`,
      title: '名前解決の依頼',
      detail: `ブラウザはOSのスタブリゾルバ経由で、フルリゾルバに「${query}」と問い合わせる。ここから先の反復問い合わせはフルリゾルバが代行する。`,
    },
    {
      phase: 'dns',
      from: 'resolver',
      to: 'root',
      label: `query ${host} A`,
      title: 'ルートへの問い合わせ',
      detail:
        'キャッシュに答えがないので、フルリゾルバはまず13系統あるルートサーバのひとつに尋ねる。',
    },
    {
      phase: 'dns',
      from: 'root',
      to: 'resolver',
      label: `referral: .${tldOf(scenario.host)} のNS`,
      title: '委任応答(ルート)',
      detail: `ルートサーバは答えそのものではなく「.${tldOf(scenario.host)} のことはTLDサーバに聞け」という委任情報を返す。`,
    },
    {
      phase: 'dns',
      from: 'resolver',
      to: 'tld',
      label: `query ${host} A`,
      title: 'TLDへの問い合わせ',
      detail: `教えられた .${tldOf(scenario.host)} のTLDサーバに同じ質問を繰り返す。`,
    },
    {
      phase: 'dns',
      from: 'tld',
      to: 'resolver',
      label: `referral: ${host} のNS`,
      title: '委任応答(TLD)',
      detail: `TLDサーバも委任を返す。「${host} のゾーンは権威サーバが知っている」。`,
    },
    {
      phase: 'dns',
      from: 'resolver',
      to: 'auth',
      label: `query ${host} A`,
      title: '権威への問い合わせ',
      detail: 'ゾーンの中身を持つ権威サーバに、三度目の同じ質問をする。',
    },
    {
      phase: 'dns',
      from: 'auth',
      to: 'resolver',
      label: 'answer 93.184.215.14 TTL=300',
      title: '権威応答',
      detail:
        '権威サーバがAレコードを返す。フルリゾルバはこれをTTLの間キャッシュし、次回は即答できる。',
    },
    {
      phase: 'dns',
      from: 'resolver',
      to: 'client',
      label: 'answer 93.184.215.14',
      title: '解決完了',
      detail:
        'フルリゾルバがブラウザにIPアドレスを返す。ここまでがDNS解決で、以降は直接サーバと話す。',
    },
  ];
}

function tcpSteps(): RawStep[] {
  return [
    {
      phase: 'tcp',
      from: 'client',
      to: 'server',
      label: 'SYN seq=1000',
      title: 'SYN',
      detail:
        'クライアントが接続開始を宣言し、自分の初期シーケンス番号(ここでは1000)を伝える。ポートは宛先443、送信元は一時ポート。',
    },
    {
      phase: 'tcp',
      from: 'server',
      to: 'client',
      label: 'SYN-ACK seq=3000 ack=1001',
      title: 'SYN-ACK',
      detail:
        'サーバは自分の初期シーケンス番号を添えて応じ、ack=1001で「seq=1000まで受け取った」と確認する。',
    },
    {
      phase: 'tcp',
      from: 'client',
      to: 'server',
      label: 'ACK ack=3001',
      title: 'ACK(確立)',
      detail:
        '3つ目のセグメントで両方向の番号合わせが済み、接続が確立する。これが3ウェイハンドシェイクで、所要は1往復半。',
    },
  ];
}

function tls13Steps(scenario: Scenario): RawStep[] {
  return [
    {
      phase: 'tls',
      from: 'client',
      to: 'server',
      label: 'ClientHello + key_share',
      title: 'ClientHello',
      detail: `対応するTLSバージョンと暗号スイートの候補、鍵共有用の公開値、SNI(${scenario.host})を一度に送る。TLS 1.3では最初の便に鍵材料まで載せるのが特徴。`,
    },
    {
      phase: 'tls',
      from: 'server',
      to: 'client',
      label: 'ServerHello + 証明書 + Finished',
      title: 'ServerHello一式',
      detail:
        'サーバは暗号スイートを決め、自分のkey_share・サーバ証明書・署名・Finishedをまとめて返す。この時点で双方が同じ共有鍵を導出できる。',
    },
    {
      phase: 'tls',
      from: 'client',
      to: 'server',
      label: 'Finished',
      title: 'Finished(クライアント)',
      detail:
        '証明書チェーンを検証し、ハンドシェイク全体のハッシュをFinishedで送って完了。TLS 1.3は1往復(1-RTT)で暗号化通信に入れる。',
    },
  ];
}

function tls12Steps(scenario: Scenario): RawStep[] {
  return [
    {
      phase: 'tls',
      from: 'client',
      to: 'server',
      label: 'ClientHello',
      title: 'ClientHello',
      detail: `対応バージョン・暗号スイート候補・クライアントランダム・SNI(${scenario.host})を送る。TLS 1.2では鍵共有はまだ始めない。`,
    },
    {
      phase: 'tls',
      from: 'server',
      to: 'client',
      label: 'ServerHello + Certificate + ServerHelloDone',
      title: 'ServerHello一式',
      detail:
        'サーバは暗号スイートとサーバランダムを決め、証明書チェーンと(ECDHEなら)鍵交換パラメータを送り、ServerHelloDoneで一区切りつける。',
    },
    {
      phase: 'tls',
      from: 'client',
      to: 'server',
      label: 'ClientKeyExchange + ChangeCipherSpec + Finished',
      title: '鍵交換と暗号化開始(クライアント)',
      detail:
        'クライアントは鍵交換値を送って共有鍵を確定し、ChangeCipherSpecで暗号化に切り替え、Finishedで合意を確認する。ここで1往復目が終わる。',
    },
    {
      phase: 'tls',
      from: 'server',
      to: 'client',
      label: 'ChangeCipherSpec + Finished',
      title: '暗号化開始(サーバ)',
      detail:
        'サーバも暗号化に切り替えてFinishedを返す。TLS 1.2は2往復(2-RTT)かかり、これがTLS 1.3との所要時間の差になる。',
    },
  ];
}

function tlsSteps(scenario: Scenario): RawStep[] {
  return scenario.tlsVersion === '1.2' ? tls12Steps(scenario) : tls13Steps(scenario);
}

function httpSteps(scenario: Scenario): RawStep[] {
  const scheme = scenario.tls ? 'HTTPS' : 'HTTP';
  return [
    {
      phase: 'http',
      from: 'client',
      to: 'server',
      label: `GET / HTTP/1.1 Host: ${scenario.host}`,
      title: 'リクエスト',
      detail: scenario.tls
        ? 'やっと本来の用件。リクエストはTLSのアプリケーションデータとして暗号化されて運ばれる。'
        : `${scheme}では平文のままリクエストが流れる。経路上の何者でも内容を読める。`,
    },
    {
      phase: 'http',
      from: 'server',
      to: 'client',
      label: 'HTTP/1.1 200 OK',
      title: 'レスポンス',
      detail:
        'ステータス行・ヘッダ・本文が返る。実際のブラウザはこの後も同じ接続を使い回す(keep-alive)。',
    },
  ];
}

function closeSteps(): RawStep[] {
  return [
    {
      phase: 'close',
      from: 'client',
      to: 'server',
      label: 'FIN seq=1501',
      title: 'FIN(クライアント)',
      detail: '送信し終えた側がFINで自分の送信方向を閉じる。TCPは全二重なので、片側ずつ閉じる。',
    },
    {
      phase: 'close',
      from: 'server',
      to: 'client',
      label: 'ACK ack=1502',
      title: 'ACK',
      detail: 'サーバがFINを確認応答する。サーバ側の送信方向はまだ開いている。',
    },
    {
      phase: 'close',
      from: 'server',
      to: 'client',
      label: 'FIN seq=3801',
      title: 'FIN(サーバ)',
      detail: 'サーバも送り終えたらFINを送る。',
    },
    {
      phase: 'close',
      from: 'client',
      to: 'server',
      label: 'ACK ack=3802',
      title: 'ACK(完了)',
      detail:
        '最後のACKで両方向が閉じる。クライアントは遅延セグメントに備えてしばらくTIME_WAITに留まる。',
    },
  ];
}

// 各メッセージを片道遅延(往復の半分)の一区間とみなして経過時間を積む。
// 厳密なモデルではなく、ハンドシェイクの往復が積み上がる感覚を伝えるための概算。
export function oneWayMs(rttMs: number): number {
  return rttMs / 2;
}

export function buildTimeline(scenario: Scenario): Timeline {
  const raw: RawStep[] = [
    ...dnsSteps(scenario),
    ...tcpSteps(),
    ...(scenario.tls ? tlsSteps(scenario) : []),
    ...httpSteps(scenario),
    ...closeSteps(),
  ];
  const hop = oneWayMs(scenario.rttMs);
  const steps: Step[] = raw.map((step, index) => ({
    ...step,
    elapsedMs: Math.round((index + 1) * hop),
  }));
  const present = new Set<ActorId>();
  for (const step of steps) {
    present.add(step.from);
    present.add(step.to);
  }
  const order: ActorId[] = ['client', 'resolver', 'root', 'tld', 'auth', 'server'];
  const actors = order.filter((id) => present.has(id)).map((id) => ALL_ACTORS[id]);
  return { actors, steps };
}
