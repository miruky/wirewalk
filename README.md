# wirewalk

[![CI](https://github.com/miruky/wirewalk/actions/workflows/ci.yml/badge.svg)](https://github.com/miruky/wirewalk/actions/workflows/ci.yml)
[![Deploy](https://github.com/miruky/wirewalk/actions/workflows/deploy.yml/badge.svg)](https://github.com/miruky/wirewalk/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**URLを開いた瞬間に起きるDNS解決・TCPハンドシェイク・TLSネゴシエーションを、ステップ実行で歩いて眺めるシーケンスビューア**

## 概要

wirewalk は、ブラウザがWebサーバと話し始めるまでの裏側をシーケンス図のアニメーションで見せる教材である。ブラウザ・フルリゾルバ・ルート/TLD/権威DNSサーバ・Webサーバの6者を縦のライフラインとして並べ、DNSの反復問い合わせ、TCPの3ウェイハンドシェイク、TLS 1.3の1-RTTネゴシエーション、HTTPのやりとり、TCPの全二重クローズまで最大20ステップを一歩ずつ進められる。各ステップには「いま何が起きていて、なぜ必要か」の解説が付く。

ホスト名は自由に変えられ、HTTPSを切るとTLSフェーズが図から消え、DNSキャッシュ命中にするとルートへの旅が2ステップの即答に縮む。違いを並べて見せることで、キャッシュやTLSが何を省き何を足しているのかが伝わる。条件はURLハッシュに載るので、授業や記事には「この条件の図」へのリンクをそのまま貼れる。

公開先: https://miruky.github.io/wirewalk/

### なぜ作ったのか

「URLを打ってからページが出るまでに何が起きるか」は定番の面接質問になるほど基本でありながら、文字で読むと退屈で、パケットキャプチャで見ると情報過多になる。中間にある「動く絵で、一歩ずつ、日本語の説明付き」が欲しかった。実際の通信を観測するツールではなく、代表的な流れを正確に再現する教材に振り切っている。

## アーキテクチャ

![wirewalk の構成図](docs/architecture.svg)

シナリオ(ホスト名と2つのスイッチ)から `buildTimeline` が登場ノードとステップ列を決定的に生成する。ステップ列はラベル・解説・フェーズ順序まで純粋なデータなので、教材としての正確さはすべてユニットテストで担保できる。描画側の `Diagram` は全ステップ分の矢印を先に組み立てておき、進行はクラスの付け替えだけで切り替えるため、巻き戻しも一瞬で終わる。

## 技術スタック

| カテゴリ             | 技術                                  |
| :------------------- | :------------------------------------ |
| 言語                 | TypeScript 5(strict、実行時依存なし)  |
| ビルド               | Vite 6                                |
| テスト               | Vitest 2 + happy-dom                  |
| リンタ・フォーマッタ | ESLint 9(typescript-eslint)+ Prettier |
| CI / 配信            | GitHub Actions + GitHub Pages         |

## 使い方

ホスト名を入れて「この条件で見る」を押し、再生か「進む」で歩を進める。スペースキーで再生/一時停止、左右の矢印キーで段送りできる。速度は0.5倍から2倍まで選べる。

| 条件              | 図の変化                                                       |
| :---------------- | :------------------------------------------------------------- |
| HTTPS(既定)       | TLS 1.3の3ステップが入り、HTTPは暗号化された便として説明される |
| HTTPSを外す       | TLSフェーズが消え、平文で流れる危うさが解説に変わる            |
| DNSキャッシュ命中 | ルート・TLD・権威への反復問い合わせが消え、リゾルバが即答する  |

たとえば既定の `example.com` への接続は次の20ステップになる。

```
DNS解決            8ステップ(スタブ→フルリゾルバ→ルート→TLD→権威の反復)
TCPハンドシェイク   3ステップ(SYN / SYN-ACK / ACK)
TLSネゴシエーション 3ステップ(ClientHello / ServerHello一式 / Finished)
HTTPやりとり        2ステップ(GET / 200 OK)
TCPクローズ         4ステップ(FIN / ACK / FIN / ACK)
```

実際の通信は一切行わない。表示されるIPアドレス・シーケンス番号・TTLは説明のための例示で、ポート番号や再送・輻輳制御などは扱わない。

## プロジェクト構成

- `src/lib/` — DOM非依存のロジック。シナリオ定義とURLハッシュ変換(`scenario.ts`)、ステップ列の生成(`timeline.ts`)
- `src/ui/` — DOMを扱う層。シーケンス図のSVG構築と進行表示(`diagram.ts`)
- `src/main.ts` — 画面の組み立てと再生制御
- `docs/` — 構成図
- `public/` — ロゴ・ファビコン
- `.github/workflows/` — CI(lint・テスト・ビルド)とGitHub Pagesへのデプロイ

## はじめ方

### 前提条件

Node.js 22以上。

### セットアップ

```bash
git clone https://github.com/miruky/wirewalk.git
cd wirewalk
npm ci
npm run dev
```

### テストの実行

```bash
npm test
```

### Lintの実行

```bash
npm run lint
```

### ビルドとデプロイ

```bash
npm run build
```

GitHub Pagesのようにサブパスへ配信する場合は `WIREWALK_BASE=/wirewalk/` を付けてビルドする。`main` へのpushで `deploy.yml` がビルドとPagesへの反映まで行う。

## 設計方針

- **タイムラインは純粋なデータ** — どのノードが登場し、どんなラベルと解説で何ステップ進むかをすべて `buildTimeline` の戻り値に閉じ込めた。教材の正確さ(TLS 1.3が1-RTTであること、TCPクローズが4ステップであること等)は文章ではなくテストで固定している。
- **描画は組み立てと進行を分離** — 矢印は最初に全ステップ分作り、進行はインデックスに応じたクラス切替だけにした。再生・巻き戻し・段送りが同じ操作に落ち、状態の食い違いが起きない。
- **観測ツールではなく教材** — 実トラフィックには触れない。その代わり数値や順序を固定して再現性を持たせ、同じ図を何度でも見返せるようにした。
- **モーションは意味のある箇所だけ** — いま起きているステップにだけパケットの粒を流し、`prefers-reduced-motion: reduce` では止める。

## ライセンス

[MIT](LICENSE)
