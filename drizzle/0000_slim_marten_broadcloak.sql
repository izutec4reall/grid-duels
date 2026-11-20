CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`kind` text NOT NULL,
	`player_a` text NOT NULL,
	`player_b` text,
	`first_seat` text NOT NULL,
	`moves` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`winner_seat` text,
	`rematch_a` integer DEFAULT false NOT NULL,
	`rematch_b` integer DEFAULT false NOT NULL,
	`rematch_id` text,
	`tournament_id` text,
	`round` integer,
	`slot` integer,
	`attempt` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`started_at` text,
	`finished_at` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `matches_player_a` ON `matches` (`player_a`,`status`);--> statement-breakpoint
CREATE INDEX `matches_player_b` ON `matches` (`player_b`,`status`);--> statement-breakpoint
CREATE INDEX `matches_tournament` ON `matches` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_bracket_slot` ON `matches` (`tournament_id`,`round`,`slot`,`attempt`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_match` ON `messages` (`match_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `queue` (
	`user_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`match_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`rating` real DEFAULT 1200 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `game`)
);
--> statement-breakpoint
CREATE TABLE `tournament_players` (
	`tournament_id` text NOT NULL,
	`user_id` text NOT NULL,
	`current_match_id` text,
	`joined_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`tournament_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`game` text NOT NULL,
	`mode` text NOT NULL,
	`organizer_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`winner_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`started_at` text,
	`finished_at` text
);
