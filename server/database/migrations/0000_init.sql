CREATE TABLE `device_metrics` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`node_num` int unsigned NOT NULL,
	`ts` datetime NOT NULL,
	`battery` int,
	`voltage` float,
	`ch_util` float,
	`air_util_tx` float,
	`uptime` int unsigned,
	CONSTRAINT `device_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `env_metrics` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`node_num` int unsigned NOT NULL,
	`ts` datetime NOT NULL,
	`temperature` float,
	`humidity` float,
	`pressure` float,
	`gas_resistance` float,
	`iaq` int,
	`lux` float,
	CONSTRAINT `env_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`num` int unsigned NOT NULL,
	`id` varchar(9) NOT NULL,
	`long_name` varchar(64),
	`short_name` varchar(8),
	`hw_model` varchar(48),
	`role` varchar(32),
	`last_heard` datetime,
	`last_gateway` varchar(9),
	`snr` float,
	`rssi` int,
	`hops` int,
	`lat` double,
	`lon` double,
	`alt` int,
	`position_at` datetime,
	`battery` int,
	`voltage` float,
	`ch_util` float,
	`air_util_tx` float,
	`uptime` int unsigned,
	`device_at` datetime,
	`temperature` float,
	`humidity` float,
	`pressure` float,
	`gas_resistance` float,
	`iaq` int,
	`lux` float,
	`env_at` datetime,
	CONSTRAINT `nodes_num` PRIMARY KEY(`num`)
);
--> statement-breakpoint
CREATE TABLE `packets` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`packet_id` int unsigned NOT NULL,
	`from` int unsigned NOT NULL,
	`to` int unsigned NOT NULL,
	`portnum` varchar(32) NOT NULL,
	`channel` varchar(32),
	`gateway` varchar(9),
	`rssi` int,
	`snr` float,
	`hops` int,
	`ts` datetime NOT NULL,
	CONSTRAINT `packets_id` PRIMARY KEY(`id`),
	CONSTRAINT `packets_from_id` UNIQUE(`from`,`packet_id`)
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`node_num` int unsigned NOT NULL,
	`ts` datetime NOT NULL,
	`lat` double NOT NULL,
	`lon` double NOT NULL,
	`alt` int,
	`sats` int,
	CONSTRAINT `positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `device_node_ts` ON `device_metrics` (`node_num`,`ts`);--> statement-breakpoint
CREATE INDEX `env_node_ts` ON `env_metrics` (`node_num`,`ts`);--> statement-breakpoint
CREATE INDEX `packets_ts` ON `packets` (`ts`);--> statement-breakpoint
CREATE INDEX `positions_node_ts` ON `positions` (`node_num`,`ts`);