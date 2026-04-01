// 画面の組み立てと再生制御。シナリオからタイムラインを作り、現在ステップの解説と
// 図の進行を同期させる。シナリオはURLハッシュに残し、テーマは描画前に解決済み。

import './style.css';
import {
  DEFAULT_SCENARIO,
  exportBasename,
  normalizeHost,
  RTT_CHOICES,
  scenarioFromHash,
  scenarioToHash,
  type Scenario,
} from './lib/scenario';
import { buildTimeline, phaseSegments, PHASE_NAMES, type Timeline } from './lib/timeline';
import {
  nextPref,
  PREF_LABEL,
  readPref,
  resolveTheme,
  THEME_KEY,
  type ThemePref,
} from './lib/theme';
import { Diagram } from './ui/diagram';
import { PhaseRail } from './ui/phaserail';

const BRAND_MARK = `
  <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" class="mark-bg" />
    <path d="M 14 20 H 50 M 14 32 H 50 M 14 44 H 50" class="mark-wire" />
    <circle cx="24" cy="20" r="4.5" class="mark-packet mark-packet-accent" />
    <circle cx="40" cy="32" r="4.5" class="mark-packet" />
    <circle cx="30" cy="44" r="4.5" class="mark-packet" />
  </svg>`;

const THEME_ICON = `
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" class="icon-ring" />
    <path d="M 12 4 A 8 8 0 0 0 12 20 Z" class="icon-fill" />
  </svg>`;

const SHARE_ICON = `
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="12" r="2.4" />
    <circle cx="18" cy="6" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
    <path d="M 8.1 11 L 15.9 7 M 8.1 13 L 15.9 17" class="icon-link" />
  </svg>`;

const SAVE_ICON = `
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M 12 4 V 14 M 8 10.5 L 12 14.5 L 16 10.5" class="icon-link" />
    <path d="M 5 18.5 H 19" class="icon-link" />
  </svg>`;

const KEYS_ICON = `
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2.5" y="6.5" width="19" height="11" rx="2.2" class="icon-ring" />
    <path d="M 7.5 14 H 16.5" class="icon-link" />
    <circle cx="6.5" cy="10.4" r="0.9" class="icon-fill" />
    <circle cx="10" cy="10.4" r="0.9" class="icon-fill" />
    <circle cx="13.5" cy="10.4" r="0.9" class="icon-fill" />
    <circle cx="17" cy="10.4" r="0.9" class="icon-fill" />
  </svg>`;

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const rttOptions = RTT_CHOICES.map(
  (ms) =>
    `<option value="${ms}"${ms === DEFAULT_SCENARIO.rttMs ? ' selected' : ''}>往復 ${ms}ms</option>`,
).join('');

app.innerHTML = `
  <div class="app">
    <header class="app-header">
      <div class="masthead">
        <div class="brand">
          ${BRAND_MARK}
          <div class="brand-text">
            <h1>wirewalk</h1>
            <p class="tagline">URLを開いた瞬間の裏側を、一歩ずつ歩いて眺める</p>
          </div>
        </div>
        <div class="header-actions">
          <button type="button" class="icon-button" id="share-button" aria-label="この条件のURLをコピー">
            ${SHARE_ICON}<span id="share-label">共有</span>
          </button>
          <button type="button" class="icon-button" id="export-button" aria-label="図をSVGで保存">
            ${SAVE_ICON}<span>保存</span>
          </button>
          <button type="button" class="icon-button" id="help-button" aria-label="キーボード操作を表示">
            ${KEYS_ICON}<span>操作</span>
          </button>
          <button type="button" class="icon-button" id="theme-toggle" aria-label="テーマを切り替える">
            ${THEME_ICON}<span id="theme-label">自動</span>
          </button>
        </div>
      </div>
      <form class="scenario-form" id="scenario-form">
        <label class="field">
          <span>ホスト名</span>
          <input id="host-input" type="text" autocomplete="off" spellcheck="false" />
        </label>
        <label class="toggle">
          <input id="tls-input" type="checkbox" />
          <span>HTTPS</span>
        </label>
        <label class="field field-inline" id="tls-version-field">
          <span>TLS</span>
          <select id="tls-version-select">
            <option value="1.3">1.3(1-RTT)</option>
            <option value="1.2">1.2(2-RTT)</option>
          </select>
        </label>
        <label class="toggle">
          <input id="cache-input" type="checkbox" />
          <span>DNSキャッシュ命中</span>
        </label>
        <label class="field field-inline">
          <span>遅延</span>
          <select id="rtt-select">${rttOptions}</select>
        </label>
        <button type="submit" class="button button-primary">この条件で見る</button>
      </form>
    </header>
    <p class="form-error" id="form-error" hidden>ホスト名の形式が正しくありません(例: example.com)</p>
    <main class="panes">
      <section class="pane diagram-pane" aria-label="シーケンス図">
        <div class="diagram-scroll" id="diagram-host"></div>
      </section>
      <aside class="pane side-pane">
        <nav class="phase-rail" id="phase-rail" aria-label="フェーズの一覧と現在地"></nav>
        <div class="controls" aria-label="再生操作">
          <button type="button" class="button button-primary" id="play-button">再生</button>
          <button type="button" class="button" id="back-button" aria-label="ひとつ戻る">戻る</button>
          <button type="button" class="button" id="next-button" aria-label="ひとつ進む">進む</button>
          <button type="button" class="button" id="rewind-button">最初へ</button>
          <label class="speed">
            <span>速度</span>
            <select id="speed-select">
              <option value="0.5">0.5倍</option>
              <option value="1" selected>1倍</option>
              <option value="2">2倍</option>
            </select>
          </label>
        </div>
        <div class="status">
          <p class="progress" id="progress" aria-live="polite"></p>
          <p class="elapsed" id="elapsed" aria-live="polite"></p>
        </div>
        <article class="explain" aria-live="polite">
          <p class="explain-phase" id="explain-phase"></p>
          <h2 id="explain-title"></h2>
          <p id="explain-detail"></p>
        </article>
      </aside>
    </main>
    <footer class="app-footer">
      <p>
        実際の通信は行わず、教材として代表的な流れを再現している。IP・シーケンス番号・TTL・
        経過時間は例示で、経過は各メッセージを片道遅延として積んだ概算。
        <a href="https://github.com/miruky/wirewalk">ソースコード</a>
      </p>
    </footer>
    <dialog class="help-dialog" id="help-dialog" aria-label="キーボード操作">
      <div class="help-head">
        <h2>キーボード操作</h2>
        <button type="button" class="button" id="help-close">閉じる</button>
      </div>
      <dl class="help-list">
        <dt><kbd>Space</kbd></dt>
        <dd>再生 / 一時停止</dd>
        <dt><kbd>&rarr;</kbd> <kbd>&larr;</kbd></dt>
        <dd>1ステップ進む / 戻る</dd>
        <dt><kbd>Home</kbd> <kbd>End</kbd></dt>
        <dd>最初へ / 最後へ</dd>
        <dt><kbd>1</kbd>&ndash;<kbd>5</kbd></dt>
        <dd>各フェーズの先頭へ飛ぶ</dd>
        <dt><kbd>?</kbd></dt>
        <dd>この一覧の表示 / 非表示</dd>
      </dl>
    </dialog>
  </div>`;

const diagram = new Diagram(document.getElementById('diagram-host') as HTMLElement);
const phaseRail = new PhaseRail(document.getElementById('phase-rail') as HTMLElement, (target) =>
  jumpTo(target),
);
const hostInput = document.getElementById('host-input') as HTMLInputElement;
const tlsInput = document.getElementById('tls-input') as HTMLInputElement;
const tlsVersionField = document.getElementById('tls-version-field') as HTMLElement;
const tlsVersionSelect = document.getElementById('tls-version-select') as HTMLSelectElement;
const cacheInput = document.getElementById('cache-input') as HTMLInputElement;
const rttSelect = document.getElementById('rtt-select') as HTMLSelectElement;
const formError = document.getElementById('form-error') as HTMLElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const progressEl = document.getElementById('progress') as HTMLElement;
const elapsedEl = document.getElementById('elapsed') as HTMLElement;
const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;

// localStorageは環境やプライベートモードで使えないことがある。失敗は握り潰し、
// その場合は現在のセッションにだけ反映する(永続化はしない)。
const LAST_KEY = 'wirewalk:last';
const SPEED_KEY = 'wirewalk:speed';
const SPEED_CHOICES = [0.5, 1, 2];

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても動作は続ける
  }
}

// URLハッシュを最優先。無ければ前回の条件、それも無ければ既定から始める。
let scenario: Scenario =
  scenarioFromHash(location.hash) ??
  scenarioFromHash(readStored(LAST_KEY) ?? '') ??
  DEFAULT_SCENARIO;
let timeline: Timeline = buildTimeline(scenario);
let index = 0;
let timer: number | null = null;
const storedSpeed = Number(readStored(SPEED_KEY));
let speed = SPEED_CHOICES.includes(storedSpeed) ? storedSpeed : 1;
speedSelect.value = String(speed);

function syncForm(): void {
  hostInput.value = scenario.host;
  tlsInput.checked = scenario.tls;
  tlsVersionSelect.value = scenario.tlsVersion;
  cacheInput.checked = scenario.dnsCached;
  rttSelect.value = String(scenario.rttMs);
  tlsVersionField.hidden = !scenario.tls;
}

function render(): void {
  diagram.setProgress(index);
  phaseRail.setActive(index);
  const step = timeline.steps[index];
  if (step) {
    (document.getElementById('explain-phase') as HTMLElement).textContent = PHASE_NAMES[step.phase];
    (document.getElementById('explain-phase') as HTMLElement).dataset.phase = step.phase;
    (document.getElementById('explain-title') as HTMLElement).textContent = step.title;
    (document.getElementById('explain-detail') as HTMLElement).textContent = step.detail;
    elapsedEl.textContent = `経過 ~${step.elapsedMs}ms`;
  }
  progressEl.textContent = `${index + 1} / ${timeline.steps.length}`;
  (document.getElementById('back-button') as HTMLButtonElement).disabled = index === 0;
  (document.getElementById('next-button') as HTMLButtonElement).disabled =
    index >= timeline.steps.length - 1;
}

function pause(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  playButton.textContent = '再生';
}

function advance(): void {
  if (index >= timeline.steps.length - 1) {
    pause();
    return;
  }
  index += 1;
  render();
}

// 任意のステップへ移動する。再生は止め、範囲内に丸める。フェーズ目盛りや
// キーボードのジャンプ操作から呼ぶ。
function jumpTo(target: number): void {
  pause();
  index = Math.max(0, Math.min(target, timeline.steps.length - 1));
  render();
}

function play(): void {
  if (timer !== null) return;
  if (index >= timeline.steps.length - 1) index = -1;
  advance();
  timer = window.setInterval(() => advance(), 1600 / speed);
  playButton.textContent = '一時停止';
}

function loadScenario(next: Scenario): void {
  pause();
  scenario = next;
  timeline = buildTimeline(scenario);
  diagram.setTimeline(timeline);
  phaseRail.setTimeline(timeline);
  index = 0;
  const hash = scenarioToHash(scenario);
  history.replaceState(null, '', hash);
  writeStored(LAST_KEY, hash);
  syncForm();
  render();
}

(document.getElementById('scenario-form') as HTMLFormElement).addEventListener(
  'submit',
  (event) => {
    event.preventDefault();
    const host = normalizeHost(hostInput.value);
    formError.hidden = host !== null;
    if (!host) return;
    loadScenario({
      host,
      tls: tlsInput.checked,
      tlsVersion: tlsVersionSelect.value === '1.2' ? '1.2' : '1.3',
      dnsCached: cacheInput.checked,
      rttMs: Number(rttSelect.value) || DEFAULT_SCENARIO.rttMs,
    });
  },
);

tlsInput.addEventListener('change', () => {
  tlsVersionField.hidden = !tlsInput.checked;
});

playButton.addEventListener('click', () => {
  if (timer !== null) {
    pause();
  } else {
    play();
  }
});

document.getElementById('next-button')?.addEventListener('click', () => {
  pause();
  advance();
});

document.getElementById('back-button')?.addEventListener('click', () => {
  pause();
  if (index > 0) {
    index -= 1;
    render();
  }
});

document.getElementById('rewind-button')?.addEventListener('click', () => {
  pause();
  index = 0;
  render();
});

speedSelect.addEventListener('change', () => {
  speed = Number.parseFloat(speedSelect.value) || 1;
  writeStored(SPEED_KEY, String(speed));
  if (timer !== null) {
    pause();
    play();
  }
});

// キーボード操作の一覧を示すダイアログ。showModalが無い環境では属性で代替する。
const helpDialog = document.getElementById('help-dialog') as HTMLDialogElement;
function openHelp(): void {
  if (helpDialog.open) return;
  try {
    if (typeof helpDialog.showModal === 'function') helpDialog.showModal();
    else helpDialog.setAttribute('open', '');
  } catch {
    helpDialog.setAttribute('open', '');
  }
}
function closeHelp(): void {
  try {
    if (typeof helpDialog.close === 'function') helpDialog.close();
    else helpDialog.removeAttribute('open');
  } catch {
    helpDialog.removeAttribute('open');
  }
}
document.getElementById('help-button')?.addEventListener('click', openHelp);
document.getElementById('help-close')?.addEventListener('click', closeHelp);
helpDialog.addEventListener('click', (event) => {
  if (event.target === helpDialog) closeHelp();
});

document.addEventListener('keydown', (event) => {
  if (event.key === '?') {
    event.preventDefault();
    if (helpDialog.open) closeHelp();
    else openHelp();
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return;
  }
  if (helpDialog.open) return;
  switch (event.key) {
    case 'ArrowRight':
      pause();
      advance();
      break;
    case 'ArrowLeft':
      jumpTo(index - 1);
      break;
    case 'Home':
      event.preventDefault();
      jumpTo(0);
      break;
    case 'End':
      event.preventDefault();
      jumpTo(timeline.steps.length - 1);
      break;
    case ' ':
      event.preventDefault();
      playButton.click();
      break;
    default:
      if (/^[1-9]$/.test(event.key)) {
        const segment = phaseSegments(timeline.steps)[Number(event.key) - 1];
        if (segment) jumpTo(segment.start);
      }
  }
});

// 図の書き出し。現在の条件のSVGをそのままファイルとして保存する。
function download(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('export-button')?.addEventListener('click', () => {
  download(`${exportBasename(scenario)}.svg`, diagram.toStaticSVG(), 'image/svg+xml');
});

// テーマ。保存値を読み、解決済みのライト/ダークをdata-themeに反映する。
// 描画前の初期適用はindex.htmlのインラインスクリプトが済ませている。
const themeLabel = document.getElementById('theme-label') as HTMLElement;
const systemDark =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
let themePref: ThemePref = readPref((k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
});

function applyTheme(): void {
  const resolved = resolveTheme(themePref, systemDark?.matches ?? false);
  document.documentElement.dataset.theme = resolved;
  themeLabel.textContent = PREF_LABEL[themePref];
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  themePref = nextPref(themePref);
  try {
    localStorage.setItem(THEME_KEY, themePref);
  } catch {
    // 保存できなくても現在のセッションには反映する
  }
  applyTheme();
});

systemDark?.addEventListener('change', () => {
  if (themePref === 'system') applyTheme();
});

applyTheme();

// 共有。現在のURLをクリップボードへ写し、短い手応えを返す
const shareLabel = document.getElementById('share-label') as HTMLElement;
let shareReset: number | null = null;
document.getElementById('share-button')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    shareLabel.textContent = 'コピー済み';
  } catch {
    shareLabel.textContent = location.href;
  }
  if (shareReset !== null) window.clearTimeout(shareReset);
  shareReset = window.setTimeout(() => {
    shareLabel.textContent = '共有';
  }, 1600);
});

loadScenario(scenario);
