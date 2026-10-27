import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sessions = pgTable('sessions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const series = pgTable('series', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  minValue: doublePrecision('min_value').notNull(),
  maxValue: doublePrecision('max_value').notNull(),
  color: varchar('color', { length: 7 }).notNull(),
  icon: text('icon'),
  unit: varchar('unit', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sensors = pgTable('sensors', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 100 }).notNull(),
  seriesId: integer('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const measurements = pgTable('measurements', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  seriesId: integer('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  sensorId: integer('sensor_id')
    .notNull()
    .references(() => sensors.id),
  value: doublePrecision('value').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
