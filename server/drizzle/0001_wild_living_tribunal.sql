-- rosters moves from PK (facility_id, year, month) to a synthetic id, with
-- an arbitrary start_date/end_date range replacing the calendar-month key.
-- year/month are kept (nullable, unused going forward) as a rollback net.
-- Existing rows are backfilled to the full calendar month they were keyed
-- by, rather than dropped or left null.
ALTER TABLE "rosters" DROP CONSTRAINT "rosters_facility_id_year_month_pk";--> statement-breakpoint
ALTER TABLE "rosters" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ALTER COLUMN "month" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "id" text;--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "start_date" text;--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "end_date" text;--> statement-breakpoint
UPDATE "rosters" SET
  "id" = gen_random_uuid()::text,
  "start_date" = make_date("year", "month", 1)::text,
  "end_date" = ((make_date("year", "month", 1) + interval '1 month' - interval '1 day')::date)::text
WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "rosters" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ALTER COLUMN "end_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_id_pk" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "hospital_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "ward_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "support_ranks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "rank" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "rosters_facility_start_idx" ON "rosters" USING btree ("facility_id","start_date");