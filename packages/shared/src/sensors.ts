import { z } from 'zod';

export const sensorInputSchema = z.object({
  name: z.string().min(1).max(100),
  seriesId: z.int().positive(),
});

export const sensorSchema = z.object({
  id: z.int(),
  name: z.string(),
  seriesId: z.int(),
  createdAt: z.iso.datetime(),
  lastMeasurementAt: z.iso.datetime().nullable(),
});

export const sensorCreatedSchema = sensorSchema.extend({
  apiKey: z.string().min(32),
});

export type SensorInput = z.infer<typeof sensorInputSchema>;
export type Sensor = z.infer<typeof sensorSchema>;
export type SensorCreated = z.infer<typeof sensorCreatedSchema>;
