/** The languages Lrnon is being translated into, and the rules for showing them.
 *
 *  Approved by the owner on 16 October 2026 (the Wave 1 list in
 *  docs/handbook/languages-proposal.md), with one condition that this whole system
 *  exists to hold: NOTHING MACHINE-TRANSLATED GOES LIVE UNTIL A PERSON HAS READ IT.
 *  Lessons carry dated claims, and a silent mistranslation could distort them.
 *
 *  So a translation has a status, and the site shows a translation only when its
 *  status is "reviewed", it names who reviewed it, and the English it was made from
 *  has not changed since (the source hash still matches). Anything else is a draft:
 *  kept in the repository for a reviewer, never built into a page.
 *
 *  Plain JavaScript, shared by the build scripts, the Astro routes and the tests.
 */

/** @typedef {{code:string, htmlLang:string, name:string, native:string, dir:'ltr'|'rtl', script:string}} Locale */

/** @type {Locale[]} */
export const LOCALES = [
  { code: 'hi', htmlLang: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', script: 'Devanagari' },
  { code: 'bn', htmlLang: 'bn', name: 'Bengali', native: 'বাংলা', dir: 'ltr', script: 'Bengali' },
  { code: 'mr', htmlLang: 'mr', name: 'Marathi', native: 'मराठी', dir: 'ltr', script: 'Devanagari' },
  { code: 'ta', htmlLang: 'ta', name: 'Tamil', native: 'தமிழ்', dir: 'ltr', script: 'Tamil' },
  { code: 'te', htmlLang: 'te', name: 'Telugu', native: 'తెలుగు', dir: 'ltr', script: 'Telugu' },
  { code: 'es', htmlLang: 'es', name: 'Spanish', native: 'Español', dir: 'ltr', script: 'Latin' },
  { code: 'fr', htmlLang: 'fr', name: 'French', native: 'Français', dir: 'ltr', script: 'Latin' },
  { code: 'pt', htmlLang: 'pt-BR', name: 'Portuguese (Brazil)', native: 'Português (Brasil)', dir: 'ltr', script: 'Latin' },
  { code: 'ar', htmlLang: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl', script: 'Arabic' },
  { code: 'zh', htmlLang: 'zh-Hans', name: 'Chinese (Simplified)', native: '简体中文', dir: 'ltr', script: 'Han' },
  { code: 'id', htmlLang: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', dir: 'ltr', script: 'Latin' },
  { code: 'sw', htmlLang: 'sw', name: 'Swahili', native: 'Kiswahili', dir: 'ltr', script: 'Latin' },
];

export const ENGLISH = { code: 'en', htmlLang: 'en', name: 'English', native: 'English', dir: 'ltr', script: 'Latin' };

export const localeFor = (code) => (code === 'en' ? ENGLISH : LOCALES.find((l) => l.code === code) ?? null);
export const isLocaleCode = (code) => LOCALES.some((l) => l.code === code);

/** The states a translation can be in. Only 'reviewed' is ever shown to a learner. */
export const STATUSES = ['draft', 'reviewed'];

/** May this translation be shown to a learner?
 *  @param {{status?:string, reviewedBy?:string, reviewedOn?:string, sourceHash?:string}} meta
 *  @param {string} currentHash  the hash of the English as it is now
 *  @returns {{live:boolean, why:string}}  why is plain words, for the status page */
export function liveStatus(meta, currentHash) {
  if (!meta) return { live: false, why: 'missing' };
  if (meta.status !== 'reviewed') return { live: false, why: 'draft: waiting for a reviewer' };
  if (!String(meta.reviewedBy ?? '').trim()) return { live: false, why: 'marked reviewed but names no reviewer' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.reviewedOn ?? ''))) return { live: false, why: 'marked reviewed but has no review date' };
  if (meta.sourceHash !== currentHash) return { live: false, why: 'stale: the English changed after this was reviewed' };
  return { live: true, why: 'reviewed' };
}

/** A UI catalogue is {_meta:{status,reviewedBy,reviewedOn,sourceHash}, strings…}; its source hash is
 *  the hash of the English catalogue, so a change to an English string takes the translation off the
 *  site until it has been checked again. */
export function catalogueLive(catalogue, englishHash) {
  return liveStatus(catalogue?._meta, englishHash);
}

/** Look a string up in a catalogue, falling back to English, then to the key itself.
 *  @param {Record<string,string>} cat @param {Record<string,string>} en */
export function lookup(cat, en, key) {
  const v = cat?.[key];
  if (typeof v === 'string' && v !== '') return v;
  const e = en?.[key];
  return typeof e === 'string' ? e : key;
}
