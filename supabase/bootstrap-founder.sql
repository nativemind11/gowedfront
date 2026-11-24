-- Run AFTER migration-002-platform.sql, and AFTER you created your own user in
-- Supabase: Authentication > Users > Add user > Create new user (tick "Auto Confirm User").
-- Replace the email below with that user's email, then press Run. Do it once.
select private.bootstrap_founder('ahmed.taha88118@gmail.com');
