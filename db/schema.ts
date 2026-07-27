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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('worlds_created_at_idx').on(t.createdAt)],
)

export type World = typeof worlds.$inferSelect
export type NewWorld = typeof worlds.$inferInsert
