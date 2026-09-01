CREATE TABLE IF NOT EXISTS catalog_dict_entry (
	lang        text NOT NULL,
	word_key    text NOT NULL,
	word        text NOT NULL,
	entry_index integer NOT NULL,
	pos         text NOT NULL,
	pos_rank    integer NOT NULL,
	sense_index integer NOT NULL,
	gloss       text NOT NULL,
	example     text,
	form_of     text
);

-- No primary key by design. The source dump has no stable per-sense identity:
-- distinct headwords collapse to the same word_key ("Gift"/"gift") and recur
-- non-adjacently, so any synthetic key collides within a single insert batch.
-- The importer replaces a language wholesale via a staging table instead of
-- upserting, so uniqueness is never needed and a PK index would cost ~250MB.

-- Column order is load-bearing: the fallback-chain lookup filters on word_key across
-- several langs at once. Benchmarked at 0.151ms vs 0.198ms for (lang, word_key), same size.
CREATE INDEX IF NOT EXISTS catalog_dict_entry_lookup ON catalog_dict_entry (word_key, lang);

-- Drives the per-language delete during the swap.
CREATE INDEX IF NOT EXISTS catalog_dict_entry_lang ON catalog_dict_entry (lang);
