-- Japanese Reading Companion — reference data schema
-- This file is mounted into the postgres container and runs automatically on first init.

CREATE TABLE IF NOT EXISTS jlpt_vocab (
    id          SERIAL PRIMARY KEY,
    expression  TEXT NOT NULL,
    reading     TEXT NOT NULL,
    meaning     TEXT NOT NULL,
    level       TEXT NOT NULL CHECK (level IN ('N1','N2','N3','N4','N5')),
    tags        TEXT,
    UNIQUE (expression)
);

CREATE INDEX IF NOT EXISTS idx_jlpt_vocab_expression ON jlpt_vocab(expression);

CREATE TABLE IF NOT EXISTS jmdict_entry (
    id          SERIAL PRIMARY KEY,
    expression  TEXT NOT NULL,
    readings    TEXT[] NOT NULL,
    meanings    TEXT[] NOT NULL,
    UNIQUE (expression)
);

CREATE INDEX IF NOT EXISTS idx_jmdict_expression ON jmdict_entry(expression);
