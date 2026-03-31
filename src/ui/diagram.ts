// シーケンス図のSVG描画。タイムラインを一度に組み立てておき、
// 進行状況(何ステップ目まで見えるか)はクラスの付け替えだけで切り替える。
// 現在のステップにはパケットの粒が矢印に沿って流れる。

import { PHASE_NAMES, type Step, type Timeline } from '../lib/timeline';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN_X = 24;
const HEADER_H = 64;
const ROW_GAP = 46;
const LANE_MIN_GAP = 132;
const FOOTER = 24;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

export class Diagram {
  private readonly svg: SVGSVGElement;
  private arrowEls: SVGGElement[] = [];
  private steps: Step[] = [];

  constructor(host: HTMLElement) {
    this.svg = svgEl('svg', { role: 'img', 'aria-label': '通信シーケンス図' });
    host.append(this.svg);
  }

  setTimeline(timeline: Timeline): void {
    this.steps = timeline.steps;
    this.arrowEls = [];
    this.svg.replaceChildren();

    const laneX = new Map<string, number>();
    timeline.actors.forEach((actor, index) => {
      laneX.set(actor.id, MARGIN_X + 60 + index * LANE_MIN_GAP);
    });
    const width = MARGIN_X * 2 + 120 + (timeline.actors.length - 1) * LANE_MIN_GAP;
    const height = HEADER_H + timeline.steps.length * ROW_GAP + FOOTER;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));

    const defs = svgEl('defs');
    const marker = svgEl('marker', {
      id: 'wire-arrow',
      viewBox: '0 0 8 8',
      refX: '7',
      refY: '4',
      markerWidth: '6.5',
      markerHeight: '6.5',
      orient: 'auto',
    });
    marker.append(svgEl('path', { d: 'M 0 0 L 8 4 L 0 8 z', class: 'arrow-head' }));
    defs.append(marker);
    this.svg.append(defs);

    for (const actor of timeline.actors) {
      const x = laneX.get(actor.id) as number;
      const lane = svgEl('g', { class: 'lane' });
      lane.append(
        svgEl('line', {
          x1: String(x),
          y1: String(HEADER_H - 8),
          x2: String(x),
          y2: String(height - FOOTER + 8),
          class: 'lifeline',
        }),
      );
      const box = svgEl('g', { class: 'actor' });
      box.append(
        svgEl('rect', {
          x: String(x - 56),
          y: '8',
          width: '112',
          height: '42',
          rx: '9',
          class: 'actor-box',
        }),
      );
      const name = svgEl('text', {
        x: String(x),
        y: '27',
        'text-anchor': 'middle',
        class: 'actor-name',
      });
      name.textContent = actor.name;
      const role = svgEl('text', {
        x: String(x),
        y: '42',
        'text-anchor': 'middle',
        class: 'actor-role',
      });
      role.textContent = actor.role;
      box.append(name, role);
      lane.append(box);
      this.svg.append(lane);
    }

    let lastPhase = '';
    timeline.steps.forEach((step, index) => {
      const y = HEADER_H + index * ROW_GAP + ROW_GAP / 2;
      const x1 = laneX.get(step.from) as number;
      const x2 = laneX.get(step.to) as number;
      const group = svgEl('g', { class: `arrow phase-${step.phase} hidden` });

      // 現在の行を薄い帯で示す。図の幅いっぱいに敷き、currentのときだけ見せる
      group.append(
        svgEl('rect', {
          x: '0',
          y: String(y - ROW_GAP / 2),
          width: String(width),
          height: String(ROW_GAP),
          class: 'row-band',
        }),
      );

      if (step.phase !== lastPhase) {
        lastPhase = step.phase;
        const chip = svgEl('text', {
          x: String(MARGIN_X),
          y: String(y + 4),
          class: 'phase-chip',
        });
        chip.textContent = PHASE_NAMES[step.phase];
        group.append(chip);
      }

      const direction = x2 > x1 ? 1 : -1;
      group.append(
        svgEl('line', {
          x1: String(x1),
          y1: String(y),
          x2: String(x2 - direction * 4),
          y2: String(y),
          class: 'wire',
          'marker-end': 'url(#wire-arrow)',
        }),
      );
      const label = svgEl('text', {
        x: String((x1 + x2) / 2),
        y: String(y - 7),
        'text-anchor': 'middle',
        class: 'wire-label',
      });
      label.textContent = step.label;
      group.append(label);

      const packet = svgEl('circle', { cx: String(x1), cy: String(y), r: '4.5', class: 'packet' });
      packet.style.setProperty('--dx', `${x2 - x1}px`);
      group.append(packet);

      this.svg.append(group);
      this.arrowEls.push(group);
    });
  }

  // index番目を「いま起きている」ステップとして見せ、それ以前は跡として残す
  setProgress(index: number): void {
    this.arrowEls.forEach((el, i) => {
      el.classList.toggle('hidden', i > index);
      el.classList.toggle('current', i === index);
      el.classList.toggle('done', i < index);
    });
    const current = this.arrowEls[index];
    if (current && typeof current.scrollIntoView === 'function') {
      current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  stepCount(): number {
    return this.steps.length;
  }
}
