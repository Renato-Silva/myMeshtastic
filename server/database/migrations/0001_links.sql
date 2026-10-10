CREATE TABLE `links` (
	`from_num` int unsigned NOT NULL,
	`to_num` int unsigned NOT NULL,
	`source` enum('direct','relay','neighbor') NOT NULL,
	`snr` float,
	`rssi` int,
	`count` int unsigned NOT NULL DEFAULT 1,
	`first_seen` datetime NOT NULL,
	`last_seen` datetime NOT NULL,
	CONSTRAINT `links_from_num_to_num_pk` PRIMARY KEY(`from_num`,`to_num`)
);
--> statement-breakpoint
ALTER TABLE `nodes` ADD `monitored` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `links_to` ON `links` (`to_num`);