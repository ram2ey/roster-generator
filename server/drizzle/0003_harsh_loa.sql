CREATE TABLE "billing_payments" (
	"reference" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'initialized' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payments_facility_idx" ON "billing_payments" USING btree ("facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_paystack_ref_unique" ON "facilities" USING btree ("paystack_ref");