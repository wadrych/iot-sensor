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

export type Series = z.infer<typeof seriesSchema>;
