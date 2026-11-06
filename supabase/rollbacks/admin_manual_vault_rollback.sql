-- Desfaz 20261130000005_admin_manual_vault.sql (APAGA o manual cifrado e os aparelhos cadastrados)
DROP TABLE IF EXISTS public.admin_manual_access_log;
DROP TABLE IF EXISTS public.admin_manual_chapters;
DROP TABLE IF EXISTS public.admin_webauthn_challenges;
DROP TABLE IF EXISTS public.admin_trusted_devices;
