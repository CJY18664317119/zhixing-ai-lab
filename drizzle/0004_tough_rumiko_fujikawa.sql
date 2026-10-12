CREATE TABLE "models" (
	"id" serial PRIMARY KEY NOT NULL,
	"task" text DEFAULT 'classification' NOT NULL,
	"classes" text DEFAULT '[]' NOT NULL,
	"payload" text NOT NULL,
	"accuracy" text DEFAULT '0' NOT NULL,
	"train_count" integer DEFAULT 0 NOT NULL,
	"val_count" integer DEFAULT 0 NOT NULL,
	"metrics" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer,
	"source" text DEFAULT 'image' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"confidence" text DEFAULT '0' NOT NULL,
	"command" text DEFAULT '' NOT NULL,
	"boxes" text DEFAULT '[]' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"task" text DEFAULT 'classification' NOT NULL,
	"data_url" text NOT NULL,
	"boxes" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
