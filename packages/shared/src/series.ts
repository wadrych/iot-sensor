import { z } from 'zod';

export const seriesSchema = z.object({
  id: z.int(),
  name: z.string(),
  minValue: z.number(),
  maxValue: z.number(),
  color: z.string(),
  icon: z.string().nullable(),
  unit: z.string().nullable(),
});

export const seriesInputSchema = z.object({
  name: z.string().min(1).max(100),
  minValue: z.number(),
  maxValue: z.number(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
});

export type Series = z.infer<typeof seriesSchema>;
export type SeriesInput = z.infer<typeof seriesInputSchema>;
