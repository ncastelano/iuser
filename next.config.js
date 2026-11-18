/** @type {import('next').NextConfig} */

// ---- Trava anti-acidente: teste nunca pode apontar para o banco de PRODUÇÃO ----
// O projeto Supabase de produção. (Não é segredo: aparece na URL pública do app.)
const PROD_SUPABASE_REF = 'mqtwehsmkuknkrtrqbnf'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const pointsAtProd = supabaseUrl.includes(PROD_SUPABASE_REF)
const isStagingEnv = process.env.NEXT_PUBLIC_APP_ENV === 'staging'
const isNonProdDeploy = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
if (pointsAtProd && (isStagingEnv || isNonProdDeploy)) {
  // Preview/branch da Vercel ou app marcado como staging usando o banco de produção: o build NÃO sai.
  throw new Error(
    '\n\n[iUser] BUILD BLOQUEADO: este ambiente (' + (process.env.VERCEL_ENV || 'staging') + ') está apontando para o banco de PRODUÇÃO.\n' +
    'Troque NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY pelos do projeto de STAGING ' +
    '(Vercel → Settings → Environment Variables → Preview). Veja docs/STAGING.md.\n'
  )
}
if (pointsAtProd && process.env.NODE_ENV === 'development' && process.env.ALLOW_PROD_DB_IN_DEV !== '1') {
  console.warn(
    '\n\x1b[41m\x1b[97m [iUser] ATENÇÃO: o servidor local está usando o banco de PRODUÇÃO. Testes que gravam dados afetam gente de verdade. \x1b[0m\n' +
    'Use o banco de staging no .env.local (docs/STAGING.md). Para silenciar de propósito: ALLOW_PROD_DB_IN_DEV=1.\n'
  )
}

// Host do Storage do Supabase do ambiente atual (produção ou staging) para o next/image
let supabaseHost = 'mqtwehsmkuknkrtrqbnf.supabase.co'
try { if (supabaseUrl) supabaseHost = new URL(supabaseUrl).hostname } catch {}
// Supabase LOCAL (Docker, scripts/local): as imagens vêm de http://127.0.0.1:54321 — só nesse caso libera o host (e o IP local) no next/image
const localSupabase = /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(supabaseUrl)

// Endereço de imagens do próprio site (/img/..., rota src/app/img/[...path]/route.ts): a Vercel busca no Storage do Supabase uma vez e
// guarda a cópia (cache), então as visualizações seguintes não gastam o Cached Egress do Supabase. Ver src/lib/imageProxy.ts. Base ABSOLUTA: produção usa o domínio
// oficial; preview usa a URL da própria branch; local fica vazio (links diretos do Supabase). NEXT_PUBLIC_IMAGE_BASE força um valor
// (use 'off' para desligar o proxy num ambiente).
const imageBase = (() => {
  const forced = process.env.NEXT_PUBLIC_IMAGE_BASE
  if (forced !== undefined && forced !== '') return forced === 'off' ? '' : forced.replace(/\/+$/, '')
  if (process.env.VERCEL_ENV === 'production') return 'https://www.iuser.com.br'
  if (process.env.VERCEL_BRANCH_URL) return 'https://' + process.env.VERCEL_BRANCH_URL
  return ''
})()
let imageBaseHost = ''
try { if (imageBase) imageBaseHost = new URL(imageBase).hostname } catch {}

const nextConfig = {
  // `*.tela.localhost`: a observação em 3 telas (/tres-telas, só local) abre cada tela num endereço (owner/client/driver.tela.localhost) para guardar uma sessão por tela
  allowedDevOrigins: ['192.168.1.33', '*.localhost', '*.tela.localhost'], // se necessário, mantenha

  env: { NEXT_PUBLIC_IMAGE_BASE: imageBase },

  // CABEÇALHOS DE SEGURANÇA (18/11/2026, revisão antes de comercializar). Só no build de produção/preview: o /tres-telas local
  // abre o app em molduras de outros subdomínios (*.tela.localhost), que o frame-ancestors recusaria.
  //  - X-Frame-Options + frame-ancestors: nenhum outro site abre o iUser numa moldura (clickjacking: botão invisível por cima);
  //  - HSTS: o navegador só fala com o iUser por https (sem "rebaixar" para http numa rede pública);
  //  - nosniff: arquivo enviado não é interpretado como outro tipo (ex.: imagem virando script);
  //  - Referrer-Policy: o endereço completo (com ?códigos) não vaza para outros sites;
  //  - Permissions-Policy: câmera, microfone e localização só para o próprio iUser.
  // NÃO há CSP completa de scripts (Mapbox, Supabase, Firebase, pdf.js...): fazer com calma, em modo "report-only" antes.
  async headers() {
    if (process.env.NODE_ENV !== 'production') return []
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()' },
      ],
    }]
  },

  images: {
    ...(localSupabase ? { dangerouslyAllowLocalIP: true } : {}),
    remotePatterns: [
      ...(localSupabase ? [{ protocol: 'http', hostname: new URL(supabaseUrl).hostname, port: new URL(supabaseUrl).port, pathname: '/storage/v1/object/public/**' }] : []),
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'plus.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: supabaseHost,
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      // o próprio proxy de imagens (/img) quando um componente usa next/image
      ...(imageBaseHost ? [{ protocol: 'https', hostname: imageBaseHost, port: '', pathname: '/img/**' }] : []),
      // produção sempre liberada (links antigos/gravados no banco)
      {
        protocol: 'https',
        hostname: 'mqtwehsmkuknkrtrqbnf.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
