// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';

// main.ts はimport時に画面を組み立てるので、先に#appを用意してから読み込む
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('./main');
});

describe('main', () => {
  it('ヘッダー・図・解説・操作が組み上がる', () => {
    expect(document.querySelector('h1')?.textContent).toBe('wirewalk');
    expect(document.querySelector('.diagram-pane svg')).not.toBeNull();
    expect(document.getElementById('progress')?.textContent).toBe('1 / 20');
    expect(document.getElementById('explain-title')?.textContent).toBe('名前解決の依頼');
  });

  it('進むと解説と進捗が動き、戻ると巻き戻る', () => {
    const next = document.getElementById('next-button') as HTMLButtonElement;
    next.click();
    expect(document.getElementById('progress')?.textContent).toBe('2 / 20');
    expect(document.getElementById('explain-title')?.textContent).toBe('ルートへの問い合わせ');
    (document.getElementById('back-button') as HTMLButtonElement).click();
    expect(document.getElementById('progress')?.textContent).toBe('1 / 20');
  });

  it('不正なホスト名はエラー表示し、シナリオを変えない', () => {
    const host = document.getElementById('host-input') as HTMLInputElement;
    host.value = 'not a host';
    (document.getElementById('scenario-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    expect((document.getElementById('form-error') as HTMLElement).hidden).toBe(false);
    expect(document.getElementById('progress')?.textContent).toBe('1 / 20');
  });

  it('HTTPSを切るとTLSが消えて17ステップになり、URLに条件が載る', () => {
    const host = document.getElementById('host-input') as HTMLInputElement;
    host.value = 'example.org';
    (document.getElementById('tls-input') as HTMLInputElement).checked = false;
    (document.getElementById('scenario-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    expect((document.getElementById('form-error') as HTMLElement).hidden).toBe(true);
    expect(document.getElementById('progress')?.textContent).toBe('1 / 17');
    expect(location.hash).toBe('#host=example.org&tls=off');
  });

  it('最初へで先頭に戻る', () => {
    const next = document.getElementById('next-button') as HTMLButtonElement;
    next.click();
    next.click();
    (document.getElementById('rewind-button') as HTMLButtonElement).click();
    expect(document.getElementById('progress')?.textContent).toBe('1 / 17');
  });
});
