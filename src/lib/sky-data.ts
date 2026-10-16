/** Fetchers for the small files Sky's practice needs. Each is requested once per
 *  page and kept; each is a copy of public content, with nothing about a learner
 *  in it. Built by scripts/build-buddy-index.mjs. */
import { drawAndShuffle } from './shuffle.js';

const memo = new Map<string, Promise<any>>();
function get(url: string): Promise<any> {
  let p = memo.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    p.catch(() => memo.delete(url));     // a failed fetch may be retried
    memo.set(url, p);
  }
  return p;
}

export type BuddyLesson = { s: string; t: string; m: string; o: number; min: number; c: number };
export type BuddyIndex = { v: number; modules: Record<string, string>; quizzes: string[]; lessons: BuddyLesson[] };
export type QuizItem = { id: string; q: string; o: string[]; a: number; why: string };
export type CardItem = { k: string; f: string; b: string; t: string; s: string };

export const loadIndex = (): Promise<BuddyIndex> => get('/buddy-index.json');
export const loadQuiz = (m: string): Promise<{ module: string; title: string; items: QuizItem[] }> => get(`/buddy/quiz-${m}.json`);
export const loadCards = (m: string): Promise<{ module: string; cards: CardItem[] }> => get(`/buddy/cards-${m}.json`);

/** Five questions from one module, options shuffled so position gives nothing
 *  away (the same rule the module quizzes follow). */
export function drawQuick(items: QuizItem[], n = 5) {
  const asBank = items.map((i) => ({ ...i, options: i.o, answer: i.a }));
  return drawAndShuffle(asBank, Math.min(n, asBank.length)).map((i: any) => ({
    id: i.id as string, q: i.q as string, options: i.options as string[], answer: i.answer as number, why: i.why as string,
  }));
}
