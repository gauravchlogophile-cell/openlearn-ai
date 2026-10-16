/** The translation state, read once per build and shared by every page that needs it.
 *  Build time only. See state.js for what is in it, and locales.js for the one rule that
 *  decides what a reader may be shown. */
import { readState } from './state.js';

let memo;
export function getState() {
  memo = memo ?? readState(process.cwd());
  return memo;
}

/** Replace {name} placeholders. @param {string} s @param {Record<string,string|number>} [vars] */
export function fmt(s, vars = {}) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Which languages have a live translation of this English lesson. @param {string} lessonId */
export function liveVersionsOf(lessonId) {
  const st = getState();
  const out = [];
  for (const [code, e] of Object.entries(st.languages)) {
    if (e.lessons.some((x) => x.id === lessonId && x.live)) out.push(code);
  }
  return out;
}
