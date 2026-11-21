export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document): T => r.querySelector(s) as T;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Seconds -> "m:ss" */
export const fmt = (s: number): string => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(m: string): void {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 1700);
}

/** Physical key code -> label printed on a Turkish Q keyboard. */
const TR: Record<string, string> = { Semicolon: 'Ş', Comma: 'Ö', Period: 'Ç' };
export const keyLabel = (c: string): string => TR[c] || c.replace(/^Key|^Digit/, '');

/** Only touch the DOM when the text actually changed (cheap per-frame updates). */
export function setText(el: Element, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}
