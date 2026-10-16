import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Universal lesson anatomy — Phase 3 §6. The Zod schema IS the contract;
 *  scripts/validate-content.mjs enforces the same rules dependency-free in CI. */
const lessons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './content' }),
  schema: z.object({
    title: z.string().max(60),
    description: z.string().min(80).max(160),
    track: z.enum(['explorer', 'practitioner', 'builder']),
    module: z.string(),
    order: z.number().int().positive(),
    minutes: z.number().int().min(3).max(15),
    objectives: z.array(z.string()).min(1).max(3),
    concepts: z.array(z.string()).min(1),
    tools: z.array(z.string()).default([]),
    /** Outside sources for facts that are not about a tool — a law, a vendor's
     *  published terms. Rendered under the lesson with the date it was read,
     *  and watched weekly by scripts/check-sources.mjs. */
    sources: z.array(z.object({
      label: z.string(),
      url: z.string().url(),
      retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      kind: z.enum(['official', 'secondary']).default('official'),
    })).default([]),
    flashcards: z.array(z.object({ front: z.string(), back: z.string() })).min(2).max(6),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    contributors: z.array(z.string()).min(1),
    licence: z.literal('CC-BY-SA-4.0'),
  }),
});

/** Translations. One file per lesson per language, in content-i18n/<lang>/.
 *
 *  Only the words are translated. Everything structural (track, module, order, the
 *  tools a lesson names, the sources it cites, the date it was last verified) is read
 *  from the English lesson it translates, so a translator cannot drift from it and does
 *  not have to copy it. A translation is shown to learners only if it passes
 *  liveStatus() in src/i18n/locales.js: reviewed, by a named person, and made from the
 *  English as it stands now. Everything else is a draft, which the build ignores. */
const translations = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './content-i18n' }),
  schema: z.object({
    lang: z.string().min(2).max(3),
    translationOf: z.string(),
    sourceHash: z.string().default(''),
    status: z.enum(['draft', 'reviewed']).default('draft'),
    machineDraft: z.boolean().default(true),
    reviewedBy: z.string().default(''),
    reviewedOn: z.string().default(''),
    title: z.string().max(140),
    description: z.string().min(30).max(320),
    minutes: z.number().int().min(3).max(15),
    objectives: z.array(z.string()).min(1).max(3),
    flashcards: z.array(z.object({ front: z.string(), back: z.string() })).min(2).max(6),
  }),
});

export const collections = { lessons, translations };
