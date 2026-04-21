ALTER TABLE `settings` ADD `default_reader_mode` text DEFAULT 'scroll' NOT NULL CHECK (`default_reader_mode` IN ('scroll', 'rsvp'));
