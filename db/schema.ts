import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * A saved world.
 *
 * `params` is the entire artifact — seed plus sliders, under 1KB — and the 3D
 * preview is regenerated from it on demand. There are deliberately no images
 * stored anywhere: a thumbnail would drift out of date the moment the renderer
 * changes, whereas params always render correctly against the current engine.
 */
export const worlds = pgTable(
  'worlds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Short, URL-safe public identifier used in /w/:slug. */
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    params: jsonb('params').notNull(),
    /** Accent colour and caption, denormalised so the gallery needs no joins. */
    dot: text('dot').notNull(),
    sub: text('sub').notNull(),
    /**
     * Secret returned only to the creator, so an anonymous user can edit or
     * delete their own world later without any account.
     */
    editToken: text('edit_token').notNull(),
    /**
     * Which browser saved this. Anonymous and self-issued — see src/lib/owner.ts
     * — so it scopes the gallery without requiring accounts.
     *
     * Nullable only for rows written before the gallery was per-browser: those
     * belong to nobody, so they never match a list query and are reachable by
     * their /w/:slug link alone. Every new row sets it.
     */
    ownerKey: text('owner_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('worlds_created_at_idx').on(t.createdAt),
    // The gallery only ever reads one owner's newest rows.
    index('worlds_owner_created_at_idx').on(t.ownerKey, t.createdAt),
  ],
)

export type World = typeof worlds.$inferSelect
export type NewWorld = typeof worlds.$inferInsert

/**
 * A saved system: a star and the worlds that orbit it.
 *
 * Same bargain as `worlds` — `def` holds the whole thing, including each
 * body's params, so opening a shared system rebuilds it in 3D rather than
 * showing a picture of one. It is a few kilobytes rather than one, because a
 * system is several worlds plus their orbits.
 */
export const systems = pgTable(
  'systems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Short, URL-safe public identifier used in /s/:slug. */
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    def: jsonb('def').notNull(),
    /** Accent colour and caption, denormalised so the list needs no joins. */
    dot: text('dot').notNull(),
    sub: text('sub').notNull(),
    editToken: text('edit_token').notNull(),
    /** Which browser saved this — same bargain as `worlds.ownerKey`. */
    ownerKey: text('owner_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('systems_created_at_idx').on(t.createdAt),
    index('systems_owner_created_at_idx').on(t.ownerKey, t.createdAt),
  ],
)

export type System = typeof systems.$inferSelect
export type NewSystem = typeof systems.$inferInsert
