ALTER TABLE "billing_payments" ADD COLUMN "credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "facilities" ADD COLUMN "download_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "downloaded_version" integer DEFAULT 0 NOT NULL;