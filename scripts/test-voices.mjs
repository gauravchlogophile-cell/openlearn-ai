#!/usr/bin/env node
/**
 * Read-aloud voices: Indian and global, natural ones first.
 *
 * The owner asked for human voices, Indian and global. What can honestly be
 * offered today is the best of the voices already on a person's device, found
 * and ranked properly, plus a place for recorded human narration to be dropped
 * in when it exists. These tests pin the ranking, the grouping and the honesty.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isIndian, quality, groupVoices, defaultVoice, labelFor, sampleFor, RATES } from '../src/lib/voices.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failed = 0, passed = 0;
const check = (n, ok, x = '') => { if (ok) passed++; else { failed++; console.error('FAIL', n, x); } };

const V = (name, lang, local = true) => ({ name, lang, voiceURI: name, localService: local });
const voices = [
  V('Microsoft Zira - English (United States)', 'en-US'),
  V('Microsoft Neerja Online (Natural) - English (India)', 'en-IN', false),
  V('Microsoft Prabhat - English (India)', 'en-IN'),
  V('Microsoft Swara Online (Natural) - Hindi (India)', 'hi-IN', false),
  V('Google தமிழ்', 'ta-IN', false),
  V('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB', false),
  V('Google US English', 'en-US', false),
  V('eSpeak English', 'en-US'),
  V('Albert', 'en-US'),
  V('Microsoft Conrad Online (Natural) - Spanish (Spain)', 'es-ES', false),
  V('Microsoft Keita Online (Natural) - Japanese (Japan)', 'ja-JP', false),
  V('Microsoft Pallavi Online (Natural) - Tamil (India)', 'ta-IN', false),
];

check('English counts as Indian only for en-IN', isIndian(V('x', 'en-IN')) && !isIndian(V('x', 'en-GB')) && !isIndian(V('x', 'en-US')));
check('Hindi, Tamil, Bengali and the other Indian languages are Indian', ['hi-IN', 'ta-IN', 'bn-IN', 'te-IN', 'mr-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN'].every((l) => isIndian(V('x', l))));
check('other languages are global', ['es-ES', 'ja-JP', 'fr-FR', 'en-US', 'zh-CN'].every((l) => !isIndian(V('x', l))));
check('underscore language tags are understood', isIndian(V('x', 'hi_IN')) && isIndian(V('x', 'en_IN')));

check('a natural voice outranks a plain one', quality(V('Neerja Online (Natural)', 'en-IN', false)) > quality(V('Prabhat', 'en-IN')));
check('a robotic voice ranks below everything', quality(V('eSpeak English', 'en-US')) < 0 && quality(V('Albert', 'en-US')) < 0);

const g = groupVoices(voices);
check('every voice is in exactly one group', g.indian.length + g.global.length === voices.length);
check('Indian voices are all Indian and global voices are all not', g.indian.every(isIndian) && g.global.every((v) => !isIndian(v)));
check('English (India) comes first among Indian voices, then Hindi', g.indian[0].lang === 'en-IN' && g.indian.findIndex((v) => v.lang === 'hi-IN') > g.indian.findIndex((v) => v.lang === 'en-IN'));
check('the natural English (India) voice leads the plain one', g.indian[0].name.includes('Neerja'));
check('English (UK) then English (US) lead the global voices', g.global[0].lang === 'en-GB' && g.global[1].lang === 'en-US');
{ const us = g.global.filter((v) => v.lang === 'en-US'); check('robotic voices come last among the voices of their own language', us.slice(-2).every((v) => ['eSpeak English', 'Albert'].includes(v.name)), us.map((v) => v.name).join(' | ')); }
check('grouping is stable', JSON.stringify(groupVoices(voices)) === JSON.stringify(groupVoices([...voices].reverse())));
check('no voices is not an error', groupVoices([]).indian.length === 0 && groupVoices(undefined).global.length === 0);

check('on an English page the best English voice is chosen', defaultVoice(voices, 'en')?.name.includes('Neerja') || defaultVoice(voices, 'en')?.name.includes('Sonia'), defaultVoice(voices, 'en')?.name);
check('on a Hindi page the Hindi voice is chosen', defaultVoice(voices, 'hi')?.lang === 'hi-IN');
check('with no voice in the page language, something is still chosen', defaultVoice(voices, 'fr') !== null);
check('with no voices at all, nothing is chosen and nothing breaks', defaultVoice([], 'en') === null);

check('labels are readable and carry the language', labelFor(V('Microsoft Neerja Online (Natural) - English (India)', 'en-IN')).includes('English (India)'));
check('samples are in the voice\'s own language where confident', sampleFor(V('x', 'hi-IN')).includes('नमस्ते') && sampleFor(V('x', 'ta-IN')).includes('வணக்கம்'));
check('and in English otherwise', sampleFor(V('x', 'ja-JP')).startsWith('Hello') && sampleFor(null).startsWith('Hello'));
check('speeds include normal and stay in a sane range', RATES.includes(1) && Math.min(...RATES) >= 0.5 && Math.max(...RATES) <= 2);

// The code: honest about what the voices are, and supports recordings.
const aloud = readFileSync(join(ROOT, 'src/components/ReadAloud.tsx'), 'utf8');
const panel = readFileSync(join(ROOT, 'src/components/AccessibilityPanel.tsx'), 'utf8');
check('read-aloud reads no audio from anywhere except a listed recording', !/fetch\([^)]*(tts|speech|voice)/i.test(aloud) && /narration\/index\.json/.test(readFileSync(join(ROOT, 'src/components/useVoices.ts'), 'utf8')));
check('a recording plays only if a lesson has one and the reader allows it', /prefs\.recorded/.test(aloud) && /recs\.length > 0/.test(aloud));
check('the panel offers Indian and global voices, a speed and a sample', /Indian voices/.test(panel) && /Global voices/.test(panel) && /Hear a sample/.test(panel) && /Speed/.test(panel));
check('the panel says plainly these are the device\'s voices', /already on your device/.test(panel));
check('the voice section appears only when read-aloud is on', /\{aloud && \(\s*<div style=\{\{ display: 'grid', gap: 'var\(--sp-2\)', marginTop/.test(panel));

if (failed) { console.error(`${failed} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`voices: ${passed} checks passed`);
