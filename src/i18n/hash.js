import { createHash } from 'node:crypto';

/** The fingerprint of an English lesson, which a translation records.
 *
 *  When the English changes, the fingerprint changes, and the translation stops
 *  being shown until a person has checked it against the new English. Two lines
 *  are left out because changing them does not change what the lesson says: the
 *  date it was last verified, and who contributed.
 *  @param {string} raw the whole English file, frontmatter included */
export function sourceHash(raw) {
  const text = String(raw).replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^(lastVerified|contributors):/.test(l))
    .join('\n')
    .trim();
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** The fingerprint of a UI catalogue's English source: its strings, in key order, without the _meta block. */
export function catalogueHash(en) {
  const keys = Object.keys(en).filter((k) => k !== '_meta').sort();
  return createHash('sha256').update(JSON.stringify(keys.map((k) => [k, en[k]]))).digest('hex').slice(0, 12);
}
