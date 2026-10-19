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

// Endereço de imagens do próprio site (/img/...): a Vercel busca no Storage do Supabase uma vez e guarda a cópia (cache), então as
// visualizações seguintes não gastam o Cached Egress do Supabase. Ver src/lib/imageProxy.ts. Base ABSOLUTA: produção usa o domínio
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
  allowedDevOrigins: ['192.168.1.33'], // se necessário, mantenha

  env: { NEXT_PUBLIC_IMAGE_BASE: imageBase },

  async rewrites() {
    return [{ source: '/img/:path*', destination: `https://${supabaseHost}/storage/v1/object/public/:path*` }]
  },

  // A Vercel só guarda em cache o que vem de um rewrite externo com s-maxage (max-age sozinho dá MISS sempre). Os nomes de arquivo
  // levam timestamp (nunca se sobrescreve o mesmo caminho), então cache longo na CDN é seguro; o navegador revalida em 1 dia.
  async headers() {
    return [{
      source: '/img/:path*',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800' }],
    }]
  },

  images: {
    remotePatterns: [
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
