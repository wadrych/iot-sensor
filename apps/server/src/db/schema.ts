import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  check,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Chart.js
export const POINT_STYLES = [
  'circle',
  'cross',
  'crossRot',
  'dash',
  'line',
  'rect',
  'rectRounded',
  'rectRot',
  'star',
  'triangle',
] as const;

const pointStyleList = sql.raw(POINT_STYLES.map((s) => `'${s}'`).join(', '));

export const users = pgTable(
  'users',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    username: varchar('username', { length: 100 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check('users_username_not_empty', sql`char_length(${t.username}) > 0`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('sessions_token_hash_sha256', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'sessions_expires_after_created',
      sql`${t.expiresAt} > ${t.createdAt}`,
    ),
    index('sessions_user_id_idx').on(t.userId),
  ],
);

export const series = pgTable(
  'series',
  {
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
  },
  (t) => [
    check('series_name_not_empty', sql`char_length(${t.name}) > 0`),
    check('series_min_below_max', sql`${t.minValue} < ${t.maxValue}`),
    check('series_color_hex', sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check('series_icon_point_style', sql`${t.icon} IN (${pointStyleList})`),
  ],
);

export const sensors = pgTable(
  'sensors',
  {
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
  },
  (t) => [
    check('sensors_name_not_empty', sql`char_length(${t.name}) > 0`),
    check('sensors_key_hash_sha256', sql`${t.keyHash} ~ '^[0-9a-f]{64}$'`),
    index('sensors_series_id_idx').on(t.seriesId),
    uniqueIndex('sensors_active_name_unique')
      .on(t.name)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export const measurements = pgTable(
  'measurements',
  {
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
  },
  (t) => [
    index('measurements_series_id_timestamp_idx').on(t.seriesId, t.timestamp),
    index('measurements_sensor_id_timestamp_idx').on(t.sensorId, t.timestamp),
  ],
);
