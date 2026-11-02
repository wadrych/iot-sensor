import { z } from 'zod';

export const measurementInputSchema = z.object({
  value: z.number(),
  timestamp: z.iso.datetime({ offset: true }).optional(),
});

export const measurementSchema = z.object({
  id: z.int(),
  seriesId: z.int(),
  sensorId: z.int(),
  value: z.number(),
  timestamp: z.iso.datetime(),
});

export type MeasurementInput = z.infer<typeof measurementInputSchema>;
export type Measurement = z.infer<typeof measurementSchema>;
