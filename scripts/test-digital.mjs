// Testes das regras puras dos produtos digitais (src/modules/digital/domain.ts). Rodar: npm run test:digital
import test from 'node:test'
import assert from 'node:assert/strict'
import { kindFromFile, isSafeHttps, validateItem, formatDuration, formatSize, groupByModule, curriculumStats, curriculumSummary, isDigitalCart, storagePathFor, DIGITAL_MAX_BYTES, productKindOf, summaryFromCounts, SHOWCASE_FILTERS, PRODUCT_KIND_LABEL, previewPlaySeconds, nextSpotlightId, validateTeaser, autoPreviewAllowed, PREVIEW_PLAY_SECONDS, SPOTLIGHT_MS, TEASER_MAX_SECONDS, isMusicKind, isFreeProduct, freeCtaLabel, APP_PLATFORMS, PROGRAM_EXTENSIONS, isProgramFile, isInstallerFile, bucketForKind, DIGITAL_BUCKETS, DIGITAL_UPLOAD_KIND, DIGITAL_MAX_BYTES_BY_BUCKET, detectPlatform, validateAppInput, groupAppsByPlatform, downloadsLabel, shortHash } from '../src/modules/digital/domain.ts'

const it = (o) => ({ id: 'x', module_title: null, title: 't', kind: 'video', duration_seconds: null, size_bytes: null, position: 0, is_preview: false, unlocked: false, ...o })

test('tipo do arquivo pelo mime ou pela extensão', () => {
    assert.equal(kindFromFile('video/mp4', 'a.mp4'), 'video')
    assert.equal(kindFromFile('', 'aula.MOV'), 'video')
    assert.equal(kindFromFile('audio/mpeg', 'a'), 'audio')
    assert.equal(kindFromFile('application/pdf', 'livro.pdf'), 'document')
    assert.equal(kindFromFile(null, 'planilha.xlsx'), 'document')
})
test('link só https', () => {
    assert.equal(isSafeHttps('https://vimeo.com/123'), true)
    assert.equal(isSafeHttps('http://vimeo.com/123'), false)
    assert.equal(isSafeHttps('javascript:alert(1)'), false)
    assert.equal(isSafeHttps('vimeo.com'), false)
})
test('validar item: nome, tamanho e link', () => {
    assert.match(validateItem({ title: ' ', url: 'https://a.com' }), /nome/i)
    assert.match(validateItem({ title: 'x'.repeat(141), url: 'https://a.com' }), /140/)
    assert.match(validateItem({ title: 'Aula', file: { size: DIGITAL_MAX_BYTES + 1, maxBytes: DIGITAL_MAX_BYTES } }), /50 MB/)
    assert.equal(validateItem({ title: 'Aula', file: { size: DIGITAL_MAX_BYTES + 1 } }), null)   // sem o limite do banco, quem decide é o servidor
    assert.equal(validateItem({ title: 'Aula', file: { size: 10 } }), null)
    assert.match(validateItem({ title: 'Aula' }), /arquivo ou/)
    assert.match(validateItem({ title: 'Aula', url: 'http://x.com' }), /https/)
    assert.equal(validateItem({ title: 'Aula', url: 'https://x.com/v' }), null)
})
test('duração e tamanho legíveis', () => {
    assert.equal(formatDuration(0), '')
    assert.equal(formatDuration(65), '1:05')
    assert.equal(formatDuration(3725), '1h 02min')
    assert.equal(formatSize(512), '1 KB')
    assert.equal(formatSize(2.5 * 1024 * 1024), '2.5 MB')
    assert.equal(formatSize(250 * 1024 * 1024), '250 MB')
})
test('módulos na ordem em que aparecem; itens sem módulo juntos', () => {
    const g = groupByModule([it({ module_title: 'A' }), it({ module_title: null }), it({ module_title: 'B' }), it({ module_title: ' A ' })])
    assert.deepEqual(g.map((x) => [x.title, x.items.length]), [['A', 2], [null, 1], ['B', 1]])
})
test('sumário do que o produto entrega', () => {
    assert.equal(curriculumSummary([]), 'Conteúdo em preparação')
    const items = [it({ kind: 'video', duration_seconds: 600, module_title: 'M1' }), it({ kind: 'video', duration_seconds: 540, module_title: 'M1' }), it({ kind: 'document' }), it({ kind: 'link', is_preview: true })]
    assert.equal(curriculumSummary(items), '2 aulas em vídeo · 1 arquivo · 1 link · 19:00')
    const s = curriculumStats(items)
    assert.equal(s.modules, 1); assert.equal(s.previews, 1); assert.equal(s.total, 4)
})
test('carrinho só digital', () => {
    assert.equal(isDigitalCart([]), false)
    assert.equal(isDigitalCart([{ product: { type: 'digital' } }, { product: { type: 'digital' } }]), true)
    assert.equal(isDigitalCart([{ product: { type: 'digital' } }, { product: { type: 'physical' } }]), false)
})
test('caminho no bucket: pasta da pessoa, nome limpo', () => {
    const p = storagePathFor('u1', 'p1', 'Módulo 1 — Introdução (final).MP4', 123)
    assert.ok(p.startsWith('u1/p1/123-'))
    assert.match(p, /^[A-Za-z0-9/._-]+$/)
})

test('tipo do produto na vitrine', () => {
    const c = (name, videos, docs = 0, audios = 0, links = 0) => ({ name, videos, docs, audios, links })
    assert.equal(productKindOf(c('Curso Pizzaiolo', 8, 1)), 'curso')
    assert.equal(productKindOf(c('Aula Única: Massa', 1)), 'aula')
    assert.equal(productKindOf(c('Playlist: Doces', 5)), 'playlist')
    assert.equal(productKindOf(c('Playlist: com um vídeo só', 1)), 'aula')
    assert.equal(productKindOf(c('E-book: Molhos', 0, 1)), 'ebook')
    assert.equal(productKindOf(c('Planilha de custos', 0, 1)), 'ebook')
    assert.equal(productKindOf(c('Pacote de modelos', 0, 4)), 'arquivo')
    assert.equal(productKindOf(c('Podcast', 0, 0, 6)), 'curso')
    // música: só áudio — 1 faixa é música, 2 ou mais é álbum; podcast/curso de áudio seguem como curso
    assert.equal(productKindOf(c('Noite de Verão', 0, 0, 1)), 'musica')
    assert.equal(productKindOf(c('Noite de Verão (EP)', 0, 0, 4)), 'album')
    assert.equal(productKindOf(c('Aula única de violão', 0, 0, 1)), 'aula')
    assert.equal(productKindOf(c('Álbum com cifras', 0, 3, 5)), 'album')   // áudio + material ainda é álbum (sem vídeo)
})
test('resumo a partir das contagens e filtros da vitrine', () => {
    assert.equal(summaryFromCounts({ videos: 0, audios: 0, docs: 0, links: 0, seconds: 0 }), 'Conteúdo em preparação')
    assert.equal(summaryFromCounts({ videos: 8, audios: 0, docs: 1, links: 0, seconds: 86 }), '8 aulas em vídeo · 1 arquivo · 1:26')
    assert.equal(summaryFromCounts({ videos: 1, audios: 0, docs: 0, links: 0, seconds: 14 }), '1 aula em vídeo · 0:14')
    assert.deepEqual(SHOWCASE_FILTERS.map((f) => f.id), ['todos', 'cursos', 'aulas', 'playlists', 'musicas', 'programas', 'arquivos'])
    assert.ok(SHOWCASE_FILTERS.find((f) => f.id === 'arquivos').kinds.includes('ebook'))
    assert.equal(PRODUCT_KIND_LABEL.aula, 'Aula única')
})

test('prévia: toca no máximo 15 s e o destaque passa de 3 em 3 s', () => {
    assert.equal(PREVIEW_PLAY_SECONDS, 15); assert.equal(SPOTLIGHT_MS, 3000)
    assert.equal(previewPlaySeconds(9), 9)
    assert.equal(previewPlaySeconds(40), 15)
    assert.equal(previewPlaySeconds(null), 15)
    assert.equal(previewPlaySeconds(0), 15)
})
test('destaque: um cartão por vez, em volta', () => {
    assert.equal(nextSpotlightId([], null), null)
    assert.equal(nextSpotlightId(['a', 'b', 'c'], null), 'a')
    assert.equal(nextSpotlightId(['a', 'b', 'c'], 'a'), 'b')
    assert.equal(nextSpotlightId(['a', 'b', 'c'], 'c'), 'a')
    assert.equal(nextSpotlightId(['a', 'b'], 'sumiu'), 'a')
    assert.equal(nextSpotlightId(['só'], 'só'), 'só')
})
test('prévia curta: vídeo de 1 a 30 s', () => {
    assert.equal(TEASER_MAX_SECONDS, 30)
    assert.match(validateTeaser({ isVideo: false, durationSeconds: 10 }), /vídeo ou um áudio/)
    assert.equal(validateTeaser({ isVideo: false, isAudio: true, durationSeconds: 28 }), null)
    assert.match(validateTeaser({ isVideo: false, isAudio: true, durationSeconds: 31 }), /30 segundos/)
    assert.match(validateTeaser({ isVideo: false, isAudio: true, durationSeconds: null }), /áudio/)
    assert.match(validateTeaser({ isVideo: true, durationSeconds: null }), /duração/)
    assert.match(validateTeaser({ isVideo: true, durationSeconds: 31 }), /30 segundos/)
    assert.equal(validateTeaser({ isVideo: true, durationSeconds: 30 }), null)
})
test('movimento automático respeita menos movimento e economia de dados', () => {
    assert.equal(autoPreviewAllowed({ reducedMotion: false, saveData: false }), true)
    assert.equal(autoPreviewAllowed({ reducedMotion: true, saveData: false }), false)
    assert.equal(autoPreviewAllowed({ reducedMotion: false, saveData: true }), false)
})

test('música: faixas, grátis e botões', () => {
    assert.equal(summaryFromCounts({ videos: 0, audios: 3, docs: 0, links: 0, seconds: 600 }), '3 faixas · 10:00')
    assert.equal(summaryFromCounts({ videos: 0, audios: 1, docs: 0, links: 0, seconds: 200 }), '1 faixa · 3:20')
    assert.equal(summaryFromCounts({ videos: 2, audios: 1, docs: 0, links: 0, seconds: 0 }), '2 aulas em vídeo · 1 áudio')
    assert.ok(isMusicKind('musica') && isMusicKind('album') && !isMusicKind('curso'))
    assert.ok(isFreeProduct(0) && isFreeProduct(null) && isFreeProduct('0') && !isFreeProduct(9.9))
    assert.equal(freeCtaLabel('album'), 'Adicionar à minha biblioteca')
    assert.equal(freeCtaLabel('ebook'), 'Pegar grátis')
    assert.equal(PRODUCT_KIND_LABEL.musica, 'Música')
    assert.equal(PRODUCT_KIND_LABEL.album, 'Álbum')
    assert.ok(SHOWCASE_FILTERS.find((f) => f.id === 'musicas').kinds.includes('album'))
})

import { readFileSync } from 'node:fs'
const sqlApps = readFileSync(new URL('../supabase/migrations/20261130000030_digital_apps.sql', import.meta.url), 'utf8')

test('programas: plataformas e extensões são as MESMAS do banco', () => {
    const plat = [...sqlApps.match(/platform IN \(([^)]*)\)/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    assert.deepEqual(APP_PLATFORMS.map((p) => p.code).sort(), plat.sort())
    const exts = sqlApps.match(/~ '\\\.\(([^)]*)\)\$'\n/)[1].split('|').map((e) => e.replace('\\.', '.'))
    assert.deepEqual([...PROGRAM_EXTENSIONS].sort(), exts.sort())
})
test('programas: o tipo do arquivo e o palpite da plataforma', () => {
    assert.ok(isProgramFile('Setup.EXE') && isProgramFile('app-1.0.tar.gz') && isProgramFile('x.apk') && !isProgramFile('musica.mp3') && !isProgramFile('manual.pdf'))
    assert.ok(isInstallerFile('a.dmg') && !isInstallerFile('a.zip') && !isInstallerFile('a.pdf'))
    assert.equal(detectPlatform('Setup.exe'), 'windows')
    assert.equal(detectPlatform('app.APK'), 'android')
    assert.equal(detectPlatform('app.dmg'), 'macos')
    assert.equal(detectPlatform('app.AppImage'), 'linux')
    assert.equal(detectPlatform('app.ipa'), 'ios')
    assert.equal(detectPlatform('arquivo.zip'), null)
})
test('programas: validação de quem publica', () => {
    const ok = { fileName: 'setup.exe', size: 1000, platform: 'windows', version: '1.0.2', notes: '' }
    assert.equal(validateAppInput(ok), null)
    assert.match(validateAppInput({ ...ok, fileName: 'foto.png' }), /não é aceito/)
    assert.match(validateAppInput({ ...ok, size: 60 * 1024 * 1024, maxBytes: 50 * 1024 * 1024 }), /50 MB/)
    assert.match(validateAppInput({ ...ok, platform: '' }), /plataforma/)
    assert.match(validateAppInput({ ...ok, version: '  ' }), /versão/)
    assert.match(validateAppInput({ ...ok, version: 'x'.repeat(31) }), /versão/)
    assert.match(validateAppInput({ ...ok, notes: 'n'.repeat(501) }), /notas/)
})
test('programas: o tipo do produto, o resumo e o agrupamento por plataforma', () => {
    const c = (name, apps, videos = 0, audios = 0) => ({ name, apps, videos, audios, docs: 0, links: 0 })
    assert.equal(productKindOf(c('Cronômetro do Forno', 3)), 'programa')
    assert.equal(productKindOf(c('Curso com programa', 2, 5)), 'curso')
    assert.equal(summaryFromCounts({ videos: 0, audios: 0, docs: 0, links: 0, apps: 3, seconds: 0 }), '3 arquivos para baixar')
    assert.equal(summaryFromCounts({ videos: 0, audios: 0, docs: 0, links: 0, apps: 1, seconds: 0 }), '1 arquivo para baixar')
    assert.equal(summaryFromCounts({ videos: 0, audios: 0, docs: 0, links: 0, seconds: 0 }), 'Conteúdo em preparação')
    const v = (id, platform, version, day) => ({ item_id: id, title: id, platform, version, release_notes: null, sha256: null, size_bytes: 1, download_count: 0, created_at: `2026-11-${day}T10:00:00Z`, unlocked: true })
    const g = groupAppsByPlatform([v('a', 'android', '1.0', '01'), v('b', 'windows', '1.0', '01'), v('c', 'windows', '1.1', '05'), v('d', 'macos', '2.0', '03')])
    assert.deepEqual(g.map((x) => x.platform), ['windows', 'macos', 'android'])   // ordem da lista de plataformas
    assert.deepEqual(g[0].versions.map((x) => [x.item_id, x.latest]), [['c', true], ['b', false]])   // a mais nova primeiro e só ela é "última"
})
test('programas: textos', () => {
    assert.equal(downloadsLabel(0), 'Nenhum download ainda')
    assert.equal(downloadsLabel(1), '1 download')
    assert.equal(downloadsLabel(37), '37 downloads')
    assert.equal(downloadsLabel(1500), '1,5 mil downloads')
    assert.equal(downloadsLabel(25000), '25 mil downloads')
    assert.equal(shortHash('a'.repeat(64)), 'aaaaaaaa…aaaaaa')
    assert.equal(shortHash('abc'), 'abc')
})

const sqlLimits = readFileSync(new URL('../supabase/migrations/20261130000031_digital_limits_split.sql', import.meta.url), 'utf8')
test('limites do digital: um bucket por tipo, com os MESMOS tamanhos do banco', () => {
    assert.equal(bucketForKind('audio'), 'digital-music')
    assert.equal(bucketForKind('app'), 'digital-apps')
    for (const k of ['video', 'document', 'link']) assert.equal(bucketForKind(k), 'digital-files')
    assert.deepEqual(Object.values(DIGITAL_BUCKETS).sort(), ['digital-apps', 'digital-files', 'digital-music', 'iuser-digital'])
    assert.deepEqual(DIGITAL_UPLOAD_KIND, { 'digital-files': 'digital_file', 'digital-music': 'digital_music', 'digital-apps': 'digital_app', 'iuser-digital': 'digital_heavy' })
    // tamanho por arquivo = o do bucket na migration
    for (const [bucket, max] of Object.entries(DIGITAL_MAX_BYTES_BY_BUCKET)) {
        if (bucket === 'iuser-digital') continue   // o R2 não é bucket do Supabase: o tamanho dele vem do catálogo (migration 33, conferido abaixo)
        if (bucket === 'digital-files') assert.match(sqlLimits, new RegExp(`UPDATE storage\\.buckets SET file_size_limit = ${max} WHERE id = 'digital-files'`))
        else assert.match(sqlLimits, new RegExp(`'${bucket}',\\s+'${bucket}',\\s+false,\\s+${max}`))
    }
    // o item novo só entra no bucket do seu tipo (a regra do banco)
    assert.match(sqlLimits, /kind = 'audio' AND bucket = 'digital-music'/)
    assert.match(sqlLimits, /kind = 'app' AND bucket = 'digital-apps'/)
})

// A home (2.0 e 3.0) tem margem de 16 px (px-4). Fileira que "sangra" até a borda com -mx-6 passa 8 px da tela e cria rolagem lateral na página inteira.
test('home: as fileiras de promoções e digitais sangram com -mx-4 px-4 (a margem da home), nunca -mx-6', () => {
    for (const f of ['src/components/promotions/PromoCards.tsx', 'src/components/digital/DigitalCards.tsx', 'src/components/v3/PromoStrip.tsx', 'src/components/v3/DigitalStrip.tsx']) {
        const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8')
        assert.ok(!/-mx-6/.test(src), `${f} usa -mx-6 (estoura a largura da tela da home)`)
    }
})
