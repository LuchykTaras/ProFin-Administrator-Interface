-- SELECT version();
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'projects',
--     'locations',
--     'year_registry',
--     'transfer_routes'
--   )
-- ORDER BY table_name;

SELECT
    ordinal_position,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'year_registry'
ORDER BY ordinal_position;