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
    flashcards: z.array(z.object({ front: z.string(), back: z.string() })).min(2).max(6),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    contributors: z.array(z.string()).min(1),
    licence: z.literal('CC-BY-SA-4.0'),
  }),
});

export const collections = { lessons };
