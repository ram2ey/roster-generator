ALTER TABLE "facilities" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "facilities" ADD COLUMN "paystack_ref" text;--> statement-breakpoint
ALTER TABLE "facilities" ADD COLUMN "generation_count" integer DEFAULT 0 NOT NULL;