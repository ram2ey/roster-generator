CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"kind" text NOT NULL,
	"payment_reference" text,
	"roster_id" text,
	"roster_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_delta_nonzero" CHECK ("credit_ledger"."delta" <> 0),
	CONSTRAINT "credit_ledger_balance_nonnegative" CHECK ("credit_ledger"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "roster_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"roster_id" text NOT NULL,
	"version" integer NOT NULL,
	"csv" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_exports_version_positive" CHECK ("roster_exports"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_payment_reference_billing_payments_reference_fk" FOREIGN KEY ("payment_reference") REFERENCES "public"."billing_payments"("reference") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_roster_id_rosters_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."rosters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_exports" ADD CONSTRAINT "roster_exports_roster_id_rosters_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."rosters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_facility_idx" ON "credit_ledger" USING btree ("facility_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_payment_unique" ON "credit_ledger" USING btree ("payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_roster_version_unique" ON "credit_ledger" USING btree ("roster_id","roster_version");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_exports_roster_version_unique" ON "roster_exports" USING btree ("roster_id","version");--> statement-breakpoint
CREATE INDEX "sessions_facility_idx" ON "sessions" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
-- Keep the most useful row when older clients created the same period more
-- than once: prefer a downloaded roster, then the most recently generated.
WITH ranked AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "facility_id", "start_date", "end_date"
		ORDER BY ("downloaded_version" = "version") DESC, "generated_at" DESC, "id" DESC
	) AS position
	FROM "rosters"
)
DELETE FROM "rosters" WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "rosters_facility_period_unique" ON "rosters" USING btree ("facility_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_credits_nonnegative" CHECK ("billing_payments"."credits" >= 0);--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_amount_positive" CHECK ("billing_payments"."amount" > 0);--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_download_credits_nonnegative" CHECK ("facilities"."download_credits" >= 0);--> statement-breakpoint
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_version_positive" CHECK ("rosters"."version" > 0);--> statement-breakpoint
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_downloaded_version_nonnegative" CHECK ("rosters"."downloaded_version" >= 0);
--> statement-breakpoint
-- Establish an auditable opening balance for accounts that bought credits
-- before the ledger existed. All later changes are recorded individually.
INSERT INTO "credit_ledger" ("id", "facility_id", "delta", "balance_after", "kind")
SELECT gen_random_uuid()::text, "id", "download_credits", "download_credits", 'adjustment'
FROM "facilities" WHERE "download_credits" > 0;
