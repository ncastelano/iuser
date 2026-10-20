// Colunas de `stores` e `profiles` que QUALQUER pessoa (inclusive sem login) pode ler.
//
// O banco só entrega estas colunas aos papéis anon/authenticated (GRANT SELECT por coluna, migration
// 20261105000000_exposure_lockdown.sql). O resto — Pix, e-mail, CPF/CNPJ, telefone, endereço residencial,
// coordenadas, saldo, bot de WhatsApp, acesso — é privado:
//   • o dono lê a própria linha completa em `my_profile` / `my_stores` (views filtradas por auth.uid());
//   • telefone de terceiros só por RPC com login e motivo (get_profile_whatsapp, get_store_whatsapp,
//     get_store_order_whatsapp);
//   • Pix da loja/motorista só dentro do pagamento V2 (get_delivery_payment_view).
// `select('*')` em profiles/stores falha de propósito: liste as colunas (use estas constantes).
// Mantenha estas listas IGUAIS às do GRANT: `npm run test:security-exposure` confere.

// Literal ÚNICA (não concatenada nem montada) para o supabase-js tipar o resultado da consulta.
export const STORE_PUBLIC_SELECT =
    'id, name, storeSlug, description, logo_url, banner_url, owner_id, is_active, meta_title, meta_description, ratings_avg, ratings_count, prep_time_min, prep_time_max, price_min, price_max, created_at, location, calendar_url, address, business_hours, category, view_count, accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, store_address, store_lat, store_lng, delivery_type, delivery_fee, delivery_distance_rules, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, allow_scheduling, address_number, address_complement, instagram, share_count, vip_club_enabled, vip_club_price, vip_club_description, iuser_delivery_enabled, whatsapp_orders_enabled, show_whatsapp, scheduling_activated_at, chat_enabled, mutual_reviews, youtube, facebook, x, links'
export const STORE_PUBLIC_COLUMNS = STORE_PUBLIC_SELECT.split(', ')

export const PROFILE_PUBLIC_SELECT =
    'id, name, profileSlug, avatar_url, upline_id, path, created_at, description, banner_url, bio, instagram, calendar_url, theme_mode, background_mode, background_image_url, app_theme, font_size, is_seller, is_active, ratings_avg, ratings_count, view_count, share_count, category, prep_time_min, prep_time_max, price_min, price_max, working_hours, business_hours, accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, delivery_type, delivery_fee, delivery_distance_rules, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, allow_scheduling, level, downline_count, total_network, status_id, avatar_border_id, chat_enabled, service_mode_active, show_location, show_on_map, show_in_social, live_location, public_address, youtube, facebook, x'
export const PROFILE_PUBLIC_COLUMNS = PROFILE_PUBLIC_SELECT.split(', ')
