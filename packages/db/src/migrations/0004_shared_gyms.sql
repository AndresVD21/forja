-- Gyms become ONE shared list (decision 0011). The generated structure is kept; the DATA steps in the middle are
-- hand-written. They are generic: they work on an empty database, on one user with five gyms (production) and on
-- several users who each have a gym with the same name (local and e2e databases).

-- 1. New columns. name_key is nullable for now: existing rows have none until step 3.
ALTER TABLE "locations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "name_key" text;--> statement-breakpoint

-- 2. The owner's five gyms are SmartFit branches: prefix them. Matching ignores case and accents, like the key.
UPDATE "locations"
SET "name" = 'SmartFit ' || btrim("name")
WHERE lower(regexp_replace(normalize(btrim("name"), NFD), '[̀-ͯ]', '', 'g'))
  IN ('hacienda', 'canasgordas', 'pasoancho', 'valle del lili', 'mall plaza');--> statement-breakpoint

-- 3. name_key = the same normalisation as core's normalizeName: strip accents (NFD, then drop combining marks),
-- trim, collapse runs of whitespace, lower-case. (core uses \p{M} for the marks; U+0300-U+036F covers every accent
-- a Spanish or English gym name can carry. New rows always get their key from TypeScript.)
UPDATE "locations"
SET "name_key" = lower(regexp_replace(btrim(regexp_replace(normalize("name", NFD), '[̀-ͯ]', '', 'g')), '\s+', ' ', 'g'));--> statement-breakpoint

-- 4. Merge duplicates. Per name_key the oldest row (ties broken by id) is the keeper; "mapping" says which keeper
-- each row is folded into (keepers map to themselves).
CREATE TEMPORARY TABLE "location_merge" AS
SELECT "id" AS "old_id",
       first_value("id") OVER (PARTITION BY "name_key" ORDER BY "created_at", "id") AS "keeper_id"
FROM "locations";--> statement-breakpoint

-- A reference weight is unique per (user, exercise, location). Folding two gyms into one could make two rows of the
-- same user and exercise collide, so keep only the first of each group (the one at the keeper if it exists, else the
-- oldest) before repointing.
DELETE FROM "reference_weights" rw
USING (
  SELECT rw2."id",
         row_number() OVER (
           PARTITION BY rw2."user_id", rw2."exercise_id", m."keeper_id"
           ORDER BY (rw2."location_id" = m."keeper_id") DESC, rw2."created_at", rw2."id"
         ) AS "rn"
  FROM "reference_weights" rw2
  JOIN "location_merge" m ON m."old_id" = rw2."location_id"
) ranked
WHERE rw."id" = ranked."id" AND ranked."rn" > 1;--> statement-breakpoint

UPDATE "workouts" w SET "location_id" = m."keeper_id" FROM "location_merge" m WHERE w."location_id" = m."old_id" AND m."old_id" <> m."keeper_id";--> statement-breakpoint
UPDATE "reference_weights" r SET "location_id" = m."keeper_id" FROM "location_merge" m WHERE r."location_id" = m."old_id" AND m."old_id" <> m."keeper_id";--> statement-breakpoint

-- Nothing points at the duplicates any more (workouts.location_id is RESTRICT, so this would fail loudly otherwise).
DELETE FROM "locations" l USING "location_merge" m WHERE l."id" = m."old_id" AND m."old_id" <> m."keeper_id";--> statement-breakpoint
DROP TABLE "location_merge";--> statement-breakpoint

-- 5. Remember who added each gym, then drop the owner column (its constraints go first).
UPDATE "locations" SET "created_by" = "user_id";--> statement-breakpoint
ALTER TABLE "locations" DROP CONSTRAINT "locations_user_name_unique";--> statement-breakpoint
ALTER TABLE "locations" DROP CONSTRAINT "locations_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "locations" DROP COLUMN "user_id";--> statement-breakpoint

-- 6. Now that every row has a key and keys are distinct, enforce it.
ALTER TABLE "locations" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_name_key_unique" ON "locations" USING btree ("name_key");
