ALTER TABLE "assignment_events" DROP CONSTRAINT "assignment_events_assignment_id_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "help_requests" DROP CONSTRAINT "help_requests_assignment_id_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_assignment_id_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "staff_task_links" DROP CONSTRAINT "staff_task_links_assignment_id_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" DROP CONSTRAINT "whatsapp_messages_assignment_id_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "video_path" text;--> statement-breakpoint
ALTER TABLE "assignment_events" ADD CONSTRAINT "assignment_events_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_task_links" ADD CONSTRAINT "staff_task_links_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;