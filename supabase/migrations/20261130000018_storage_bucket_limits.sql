-- Controle de uploads, Camada 1 (docs/CONTROLE-DE-UPLOADS.md): limite de TAMANHO e de TIPO imposto pelo próprio Storage nos 12 buckets
-- que não tinham nenhum. Até aqui qualquer pessoa logada podia enviar arquivo de qualquer tamanho e tipo (inclusive SVG/HTML, que ficam
-- servidos no endereço do Supabase) chamando a API direto; a checagem existia só no navegador (~4 pontos) e é contornável.
--
-- Fotos: JPEG, PNG, WebP, GIF e AVIF. SVG, HEIC e o resto ficam de fora (SVG pode carregar script; HEIC não abre em boa parte dos navegadores).
-- O navegador já reduz a foto antes de enviar (lib/optimizeImage.ts: ~300-600 KB), então 5 MB sobra; o limite pega quem pula o app.
-- Só UPDATE: os buckets já existem (produção e staging). flash-media (15 MB), delivery-proofs (8 MB) e digital-files (500 MB) já têm limite
-- próprio nas migrations que os criaram e NÃO são mexidos aqui.
-- A mesma tabela de valores vive em src/lib/uploadLimits.ts; `npm run test:upload-limits` confere que as duas batem.

UPDATE storage.buckets
SET file_size_limit = v.limit_bytes,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
FROM (VALUES
    ('avatars',                5242880),   -- 5 MB
    ('backgrounds',            5242880),
    ('store-logos',            5242880),
    ('product-images',         5242880),
    ('community-photos',       6291456),   -- 6 MB: o formulário da sala já aceitava até 6
    ('service-request-photos', 5242880),
    ('ride-object-photos',     5242880),
    ('driver-car-photos',      5242880),
    ('driver-selfie-photos',   5242880),
    ('mural-images',           5242880),   -- sem ponto de upload no código hoje
    ('posts',                  5242880),
    ('store-links',            5242880)
) AS v(bucket_id, limit_bytes)
WHERE storage.buckets.id = v.bucket_id;
