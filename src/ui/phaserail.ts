// フェーズの目盛り(rail)。シーケンス全体を5つのフェーズに区切って俯瞰させ、
// 現在地と各フェーズの進み具合を示す。目盛りを押すとそのフェーズの先頭へ飛ぶ。
// 色はフェーズの意味色に対応する。進行表示は幅の付け替えだけで行う。

import { phaseSegments, type Timeline } from '../lib/timeline';

interface RailRow {
  start: number;
  last: number;
  count: number;
  button: HTMLButtonElement;
  fill: HTMLElement;
}

export class PhaseRail {
  private readonly host: HTMLElement;
  private readonly onJump: (index: number) => void;
  private rows: RailRow[] = [];

  constructor(host: HTMLElement, onJump: (index: number) => void) {
    this.host = host;
    this.onJump = onJump;
  }

  setTimeline(timeline: Timeline): void {
    this.rows = [];
    this.host.replaceChildren();

    for (const segment of phaseSegments(timeline.steps)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rail-item';
      button.dataset.phase = segment.phase;
      button.setAttribute('aria-label', `${segment.name}(${segment.count}手)の先頭へ移動`);

      const tick = document.createElement('span');
      tick.className = 'rail-tick';
      tick.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'rail-name';
      name.textContent = segment.name;

      const count = document.createElement('span');
      count.className = 'rail-count';
      count.textContent = `${segment.count}手`;

      const bar = document.createElement('span');
      bar.className = 'rail-bar';
      bar.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.className = 'rail-fill';
      bar.append(fill);

      button.append(tick, name, count, bar);

      const start = segment.start;
      button.addEventListener('click', () => this.onJump(start));

      this.host.append(button);
      this.rows.push({ start, last: start + segment.count - 1, count: segment.count, button, fill });
    }
  }

  setActive(index: number): void {
    for (const row of this.rows) {
      const isActive = index >= row.start && index <= row.last;
      const isDone = index > row.last;
      row.button.classList.toggle('active', isActive);
      row.button.classList.toggle('done', isDone);
      if (isActive) row.button.setAttribute('aria-current', 'step');
      else row.button.removeAttribute('aria-current');

      const ratio = isDone ? 1 : isActive ? (index - row.start + 1) / row.count : 0;
      row.fill.style.width = `${Math.round(ratio * 100)}%`;
    }
  }
}
