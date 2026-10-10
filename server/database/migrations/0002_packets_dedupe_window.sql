ALTER TABLE `packets` DROP INDEX `packets_from_id`;--> statement-breakpoint
CREATE INDEX `packets_from_id` ON `packets` (`from`,`packet_id`);