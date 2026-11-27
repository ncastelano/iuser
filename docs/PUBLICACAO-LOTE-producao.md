# Lote de publicação em PRODUÇÃO: migrations pendentes (desde 14/11/2026)

Gerado a partir de `supabase/migrations/`, em ordem de nome. O workflow **Banco de produção** aplica nesta ordem (`supabase db push`), depois do dry-run e da aprovação do revisor. Todas estas já foram aplicadas no **staging** (último run com sucesso: commit `afe0a978`, que inclui a `...135`).

Total: **67** migrations.

| # | Migration | O que faz |
|---|---|---|
| 1 | `20261130000069_delivery_cash_trust.sql` | Delivery cash trust |
| 2 | `20261130000070_flash_location.sql` | Flash location |
| 3 | `20261130000071_profile_type.sql` | Profile type |
| 4 | `20261130000072_driver_profile_quote.sql` | Driver profile quote |
| 5 | `20261130000073_vehicle_photo_focus.sql` | Vehicle photo focus |
| 6 | `20261130000074_order_payments.sql` | Order payments |
| 7 | `20261130000075_postpaid_monthly_cap.sql` | Postpaid monthly cap |
| 8 | `20261130000076_store_delivery_min_freight.sql` | Store delivery min freight |
| 9 | `20261130000077_order_tracking.sql` | Order tracking |
| 10 | `20261130000078_delivery_rules_admin.sql` | Delivery rules admin |
| 11 | `20261130000079_security_hardening.sql` | Security hardening |
| 12 | `20261130000080_order_payment_after_release.sql` | Order payment after release |
| 13 | `20261130000081_report_stores_profiles_products.sql` | Report stores profiles products |
| 14 | `20261130000082_legal_acceptances_seller.sql` | Legal acceptances seller |
| 15 | `20261130000083_api_rate_limits.sql` | Api rate limits |
| 16 | `20261130000084_ai_assistant_expense.sql` | Ai assistant expense |
| 17 | `20261130000085_iuser_credit_cards.sql` | Iuser credit cards |
| 18 | `20261130000086_store_table_qr.sql` | Store table qr |
| 19 | `20261130000087_forum.sql` | Forum |
| 20 | `20261130000088_forum_release_itens.sql` | Forum release itens |
| 21 | `20261130000089_forum_release_itens2.sql` | Forum release itens2 |
| 22 | `20261130000090_order_favorites.sql` | Order favorites |
| 23 | `20261130000091_order_payment_receipt.sql` | Order payment receipt |
| 24 | `20261130000092_order_agreement.sql` | Order agreement |
| 25 | `20261130000093_forum_release_pix_stages.sql` | Forum release pix stages |
| 26 | `20261130000094_forum_release_vehicle_page.sql` | Forum release vehicle page |
| 27 | `20261130000095_forum_release_canal.sql` | Forum release canal |
| 28 | `20261130000096_forum_release_canal2.sql` | Forum release canal2 |
| 29 | `20261130000097_forum_release_canal2_fix.sql` | acerta o texto da novidade 3.0.9 (a aba Canal saiu para quem entrou). Só DADOS; reaplicável. |
| 30 | `20261130000098_forum_release_canal3.sql` | novidade 3.0.10 no Fórum (só DADOS; reaplicável). |
| 31 | `20261130000099_forum_release_offer_privacy.sql` | novidade 3.0.11 no Fórum (só DADOS; reaplicável). |
| 32 | `20261130000100_forum_release_layout.sql` | novidade 3.0.12 no Fórum (só DADOS; reaplicável). |
| 33 | `20261130000101_forum_release_bar_color.sql` | novidade 3.0.13 no Fórum (só DADOS; reaplicável). |
| 34 | `20261130000102_driver_one_ride_at_a_time.sql` | Driver one ride at a time |
| 35 | `20261130000103_forum_release_one_ride.sql` | novidade 3.0.14 no Fórum (só DADOS; reaplicável). |
| 36 | `20261130000104_people_places_center.sql` | People places center |
| 37 | `20261130000105_forum_release_radar.sql` | novidade 3.0.15 no Fórum (só DADOS; reaplicável). |
| 38 | `20261130000106_store_checkins.sql` | Store checkins |
| 39 | `20261130000107_forum_release_estou_aqui.sql` | novidade 3.0.16 no Fórum (só DADOS; reaplicável). |
| 40 | `20261130000108_forum_release_store_services.sql` | novidade 3.0.17 no Fórum (só DADOS; reaplicável). |
| 41 | `20261130000109_forum_release_crop.sql` | novidade 3.0.18 no Fórum (só DADOS; reaplicável). |
| 42 | `20261130000110_forum_release_share_links.sql` | novidade 3.0.19 no Fórum (só DADOS; reaplicável). |
| 43 | `20261130000111_vehicle_slug_profile.sql` | Vehicle slug profile |
| 44 | `20261130000112_forum_release_vehicle_link.sql` | novidade 3.0.20 no Fórum (só DADOS; reaplicável). |
| 45 | `20261130000113_forum_release_call_extras.sql` | novidade 3.0.21 no Fórum (só DADOS; reaplicável). |
| 46 | `20261130000114_forum_release_call_extras_fix.sql` | acerta a novidade 3.0.21: as TAREFAS saíram; a parada fica entre a partida e a chegada e, com a corrida em andamento, |
| 47 | `20261130000115_forum_release_orders_page.sql` | novidade 3.0.22 no Fórum (só DADOS; reaplicável). |
| 48 | `20261130000116_private_store.sql` | Private store |
| 49 | `20261130000117_forum_release_private_store.sql` | novidade 3.0.23 no Fórum (só DADOS; reaplicável). |
| 50 | `20261130000118_private_store_gaps.sql` | Private store gaps |
| 51 | `20261130000119_store_unique_visitors.sql` | Total de PESSOAS que visitaram a página da loja (não o número de visitas). |
| 52 | `20261130000120_ride_min_per_km.sql` | Piso POR QUILÔMETRO da corrida de passageiro: nenhuma tarifa (a da plataforma ou a do motorista) deixa a corrida |
| 53 | `20261130000121_people_places_avatar_people.sql` | Locais com mais pessoas: cada foto precisa do id da pessoa para mostrar a BORDA e a COROA (PlanAvatarRing). |
| 54 | `20261130000122_driver_public_stores.sql` | Perfil do motorista: mostra TODAS as lojas ativas da pessoa, como uma pequena propaganda (só se ela tiver loja). |
| 55 | `20261130000123_driver_active_fresh.sql` | Perfil do motorista: "Dirigindo agora" só com o modo motorista LIGADO e posição recente (10 min). |
| 56 | `20261130000124_vehicle_brand.sql` | Marca do veículo (além do modelo e da placa). Coluna pública, como as outras da ficha do carro. |
| 57 | `20261130000125_my_invitees.sql` | Painel do perfil: a lista de QUEM EU CONVIDEI (quem entrou pelo meu link) e a pontuação de cada um, sem abrir a página de convidados. |
| 58 | `20261130000126_vehicle_photo_zoom.sql` | Enquadramento da foto do carro: zoom (1 = foto inteira preenchendo o topo; até 3x). O ponto do enquadramento já é car_photo_pos_x/y. |
| 59 | `20261130000127_vehicle_photo_zoom_min.sql` | Zoom do enquadramento da foto do carro: agora também pode DIMINUIR (mínimo 60%); antes o mínimo era 100%. |
| 60 | `20261130000128_forum_release_3_0_24.sql` | novidade 3.0.24 no Fórum (só DADOS; reaplicável). Reúne o que mudou desde a 3.0.23. |
| 61 | `20261130000129_store_slot_limit.sql` | LIMITE DE LOJAS POR PESSOA (decisão do dono, 26/11/2026): cada pessoa tem até 3 lojas SEM pagar; |
| 62 | `20261130000130_forum_release_3_0_25.sql` | novidade 3.0.25 no Fórum (só DADOS; reaplicável). Reúne o que mudou desde a 3.0.24. |
| 63 | `20261130000131_seo_public_lists.sql` | leituras de SEO no servidor sem tocar colunas privadas de profiles (bloqueio). Só o SERVIÇO executa |
| 64 | `20261130000132_seo_profiles_with_id.sql` | o sitemap precisa do id do perfil para ligar as publicações pessoais ao endereço delas. Só o serviço executa. |
| 65 | `20261130000133_store_owner_push.sql` | avisos do DONO da loja no celular (notificação do aparelho): alguém visitou a loja, viu um produto ou |
| 66 | `20261130000134_store_notification_settings.sql` | interruptores dos avisos do DONO da loja no celular (visita, produto visto, item na sacola). |
| 67 | `20261130000135_driver_mode_needs_vehicle.sql` | o modo motorista só liga com um veículo cadastrado (decisão do dono, 26/11/2026). A tela já manda cadastrar; |
