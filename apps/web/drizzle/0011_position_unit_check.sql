ALTER TABLE "sync_books" ADD CONSTRAINT "sync_books_position_unit_check" CHECK ("position_unit" IN ('byte', 'word'));
