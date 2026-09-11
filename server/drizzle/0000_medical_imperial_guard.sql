CREATE TABLE "facilities" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"type" text NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rosters" (
	"facility_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"grid" jsonb NOT NULL,
	"seed" text NOT NULL,
	"generated_at" text NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"notes" jsonb NOT NULL,
	CONSTRAINT "rosters_facility_id_year_month_pk" PRIMARY KEY("facility_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"facility_id" text PRIMARY KEY NOT NULL,
	"min_night" integer NOT NULL,
	"allow_two_male_night" boolean NOT NULL,
	"min_afternoon" integer NOT NULL,
	"weekly_off" integer NOT NULL,
	"night_block_lengths" jsonb NOT NULL,
	"off_for_block" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"name" text NOT NULL,
	"sex" text NOT NULL,
	"fixed_morning" boolean DEFAULT false NOT NULL,
	"night_eligible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave" ADD CONSTRAINT "leave_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave" ADD CONSTRAINT "leave_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;