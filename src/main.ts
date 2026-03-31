// 画面の組み立てと再生制御。シナリオからタイムラインを作り、
// 現在ステップの解説と図の進行を同期させる。シナリオはURLハッシュに残す。

import './style.css';
import {
  DEFAULT_SCENARIO,
  normalizeHost,
  scenarioFromHash,
  scenarioToHash,
  type Scenario,
} from './lib/scenario';
import { buildTimeline, PHASE_NAMES, type Timeline } from './lib/timeline';
import { Diagram } from './ui/diagram';

const BRAND_MARK = `
  <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" class="mark-bg" />
    <path d="M 14 20 H 50 M 14 32 H 50 M 14 44 H 50" class="mark-wire" />
    <circle cx="24" cy="20" r="4.5" class="mark-packet mark-packet-accent" />
    <circle cx="40" cy="32" r="4.5" class="mark-packet" />
    <circle cx="30" cy="44" r="4.5" class="mark-packet" />
  </svg>`;

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

app.innerHTML = `
  <div class="app">
    <header class="app-header">
      <div class="brand">
        ${BRAND_MARK}
        <div class="brand-text">
          <h1>wirewalk</h1>
          <p class="tagline">URLを開いた瞬間の裏側を、一歩ずつ歩いて眺める</p>
        </div>
      </div>
      <form class="scenario-form" id="scenario-form">
        <label class="field">
          <span>ホスト名</span>
          <input id="host-input" type="text" autocomplete="off" spellcheck="false" />
        </label>
        <label class="toggle">
          <input id="tls-input" type="checkbox" />
          <span>HTTPS(TLS 1.3)</span>
        </label>
        <label class="toggle">
          <input id="cache-input" type="checkbox" />
          <span>DNSキャッシュ命中</span>
        </label>
        <button type="submit" class="button">この条件で見る</button>
      </form>
    </header>
    <p class="form-error" id="form-error" hidden>ホスト名の形式が正しくありません(例: example.com)</p>
    <main class="panes">
      <section class="pane diagram-pane" aria-label="シーケンス図">
        <div class="diagram-scroll" id="diagram-host"></div>
      </section>
      <aside class="pane side-pane">
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
        <p class="progress" id="progress" aria-live="polite"></p>
        <article class="explain" aria-live="polite">
          <p class="explain-phase" id="explain-phase"></p>
          <h2 id="explain-title"></h2>
          <p id="explain-detail"></p>
        </article>
      </aside>
    </main>
    <footer class="app-footer">
      <p>
        実際の通信は行わず、教材として代表的な流れを再現している。IP・シーケンス番号・TTLは例示。
        <a href="https://github.com/miruky/wirewalk">ソースコード</a>
      </p>
    </footer>
  </div>`;

const diagram = new Diagram(document.getElementById('diagram-host') as HTMLElement);
const hostInput = document.getElementById('host-input') as HTMLInputElement;
const tlsInput = document.getElementById('tls-input') as HTMLInputElement;
const cacheInput = document.getElementById('cache-input') as HTMLInputElement;
const formError = document.getElementById('form-error') as HTMLElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const progressEl = document.getElementById('progress') as HTMLElement;

let scenario: Scenario = scenarioFromHash(location.hash) ?? DEFAULT_SCENARIO;
let timeline: Timeline = buildTimeline(scenario);
let index = 0;
let timer: number | null = null;
let speed = 1;

function syncForm(): void {
  hostInput.value = scenario.host;
  tlsInput.checked = scenario.tls;
  cacheInput.checked = scenario.dnsCached;
}

function render(): void {
  diagram.setProgress(index);
  const step = timeline.steps[index];
  if (step) {
    (document.getElementById('explain-phase') as HTMLElement).textContent = PHASE_NAMES[step.phase];
    (document.getElementById('explain-phase') as HTMLElement).dataset.phase = step.phase;
    (document.getElementById('explain-title') as HTMLElement).textContent = step.title;
    (document.getElementById('explain-detail') as HTMLElement).textContent = step.detail;
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
  index = 0;
  history.replaceState(null, '', scenarioToHash(scenario));
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
    loadScenario({ host, tls: tlsInput.checked, dnsCached: cacheInput.checked });
  },
);

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

(document.getElementById('speed-select') as HTMLSelectElement).addEventListener('change', (e) => {
  speed = Number.parseFloat((e.target as HTMLSelectElement).value) || 1;
  if (timer !== null) {
    pause();
    play();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return;
  }
  if (event.key === 'ArrowRight') {
    pause();
    advance();
  } else if (event.key === 'ArrowLeft') {
    pause();
    if (index > 0) {
      index -= 1;
      render();
    }
  } else if (event.key === ' ') {
    event.preventDefault();
    playButton.click();
  }
});

loadScenario(scenario);
