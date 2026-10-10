CREATE TABLE `device_metrics` (
	`id` integer PRIMARY KEY NOT NULL,
	`node_num` integer NOT NULL,
	`ts` integer NOT NULL,
	`battery` integer,
	`voltage` real,
	`ch_util` real,
	`air_util_tx` real,
	`uptime` integer
);
--> statement-breakpoint
CREATE INDEX `device_node_ts` ON `device_metrics` (`node_num`,`ts`);--> statement-breakpoint
CREATE TABLE `env_metrics` (
	`id` integer PRIMARY KEY NOT NULL,
	`node_num` integer NOT NULL,
	`ts` integer NOT NULL,
	`temperature` real,
	`humidity` real,
	`pressure` real,
	`gas_resistance` real,
	`iaq` integer,
	`lux` real
);
--> statement-breakpoint
CREATE INDEX `env_node_ts` ON `env_metrics` (`node_num`,`ts`);--> statement-breakpoint
CREATE TABLE `extra_metrics` (
	`id` integer PRIMARY KEY NOT NULL,
	`node_num` integer NOT NULL,
	`ts` integer NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `extra_node_kind_ts` ON `extra_metrics` (`node_num`,`kind`,`ts`);--> statement-breakpoint
CREATE TABLE `links` (
	`from_num` integer NOT NULL,
	`to_num` integer NOT NULL,
	`source` text NOT NULL,
	`snr` real,
	`rssi` integer,
	`count` integer DEFAULT 1 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`from_num`, `to_num`)
);
--> statement-breakpoint
CREATE INDEX `links_to` ON `links` (`to_num`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY NOT NULL,
	`packet_id` integer NOT NULL,
	`from` integer NOT NULL,
	`to` integer NOT NULL,
	`channel` text,
	`text` text NOT NULL,
	`reply_id` integer,
	`emoji` integer DEFAULT false NOT NULL,
	`gateway` text,
	`rssi` integer,
	`snr` real,
	`hops` integer,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_from_id` ON `messages` (`from`,`packet_id`);--> statement-breakpoint
CREATE INDEX `messages_ts` ON `messages` (`ts`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`num` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`monitored` integer DEFAULT false NOT NULL,
	`long_name` text,
	`short_name` text,
	`hw_model` text,
	`role` text,
	`last_heard` integer,
	`last_gateway` text,
	`snr` real,
	`rssi` integer,
	`hops` integer,
	`lat` real,
	`lon` real,
	`alt` integer,
	`position_at` integer,
	`battery` integer,
	`voltage` real,
	`ch_util` real,
	`air_util_tx` real,
	`uptime` integer,
	`device_at` integer,
	`temperature` real,
	`humidity` real,
	`pressure` real,
	`gas_resistance` real,
	`iaq` integer,
	`lux` real,
	`env_at` integer,
	`firmware_version` text,
	`region` text,
	`modem_preset` text,
	`has_default_channel` integer,
	`online_local_nodes` integer,
	`map_report_at` integer,
	`local_stats` text,
	`power_metrics` text,
	`air_quality` text
);
--> statement-breakpoint
CREATE TABLE `packets` (
	`id` integer PRIMARY KEY NOT NULL,
	`packet_id` integer NOT NULL,
	`from` integer NOT NULL,
	`to` integer NOT NULL,
	`portnum` text NOT NULL,
	`channel` text,
	`gateway` text,
	`rssi` integer,
	`snr` real,
	`hops` integer,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `packets_from_id` ON `packets` (`from`,`packet_id`);--> statement-breakpoint
CREATE INDEX `packets_ts` ON `packets` (`ts`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` integer PRIMARY KEY NOT NULL,
	`node_num` integer NOT NULL,
	`ts` integer NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`alt` integer,
	`sats` integer
);
--> statement-breakpoint
CREATE INDEX `positions_node_ts` ON `positions` (`node_num`,`ts`);--> statement-breakpoint
CREATE TABLE `traceroutes` (
	`id` integer PRIMARY KEY NOT NULL,
	`packet_id` integer NOT NULL,
	`from` integer NOT NULL,
	`to` integer NOT NULL,
	`route` text NOT NULL,
	`snr_towards` text NOT NULL,
	`route_back` text NOT NULL,
	`snr_back` text NOT NULL,
	`gateway` text,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `traceroutes_from_id` ON `traceroutes` (`from`,`packet_id`);--> statement-breakpoint
CREATE INDEX `traceroutes_ts` ON `traceroutes` (`ts`);