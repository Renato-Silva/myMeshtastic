CREATE TABLE `extra_metrics` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`node_num` int unsigned NOT NULL,
	`ts` datetime NOT NULL,
	`kind` enum('local','power','air') NOT NULL,
	`data` json NOT NULL,
	CONSTRAINT `extra_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`packet_id` int unsigned NOT NULL,
	`from` int unsigned NOT NULL,
	`to` int unsigned NOT NULL,
	`channel` varchar(32),
	`text` text NOT NULL,
	`reply_id` int unsigned,
	`emoji` boolean NOT NULL DEFAULT false,
	`gateway` varchar(9),
	`rssi` int,
	`snr` float,
	`hops` int,
	`ts` datetime NOT NULL,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `traceroutes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`packet_id` int unsigned NOT NULL,
	`from` int unsigned NOT NULL,
	`to` int unsigned NOT NULL,
	`route` json NOT NULL,
	`snr_towards` json NOT NULL,
	`route_back` json NOT NULL,
	`snr_back` json NOT NULL,
	`gateway` varchar(9),
	`ts` datetime NOT NULL,
	CONSTRAINT `traceroutes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `links` MODIFY COLUMN `source` enum('direct','relay','neighbor','traceroute') NOT NULL;--> statement-breakpoint
ALTER TABLE `nodes` ADD `firmware_version` varchar(32);--> statement-breakpoint
ALTER TABLE `nodes` ADD `region` varchar(16);--> statement-breakpoint
ALTER TABLE `nodes` ADD `modem_preset` varchar(24);--> statement-breakpoint
ALTER TABLE `nodes` ADD `has_default_channel` boolean;--> statement-breakpoint
ALTER TABLE `nodes` ADD `online_local_nodes` int;--> statement-breakpoint
ALTER TABLE `nodes` ADD `map_report_at` datetime;--> statement-breakpoint
ALTER TABLE `nodes` ADD `local_stats` json;--> statement-breakpoint
ALTER TABLE `nodes` ADD `power_metrics` json;--> statement-breakpoint
ALTER TABLE `nodes` ADD `air_quality` json;--> statement-breakpoint
CREATE INDEX `extra_node_kind_ts` ON `extra_metrics` (`node_num`,`kind`,`ts`);--> statement-breakpoint
CREATE INDEX `messages_from_id` ON `messages` (`from`,`packet_id`);--> statement-breakpoint
CREATE INDEX `messages_ts` ON `messages` (`ts`);--> statement-breakpoint
CREATE INDEX `traceroutes_from_id` ON `traceroutes` (`from`,`packet_id`);--> statement-breakpoint
CREATE INDEX `traceroutes_ts` ON `traceroutes` (`ts`);