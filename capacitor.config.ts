import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.iuser',
  appName: 'iUser',
  // webDir só serve de splash/fallback local — o app inteiro (SSR, API
  // routes, middleware) roda no servidor de verdade, carregado via
  // server.url abaixo. Um export estático não seria capaz de rodar essas
  // partes do app.
  webDir: 'capacitor-www',
  server: {
    url: 'https://iuser.vercel.app',
    androidScheme: 'https',
  },
};

export default config;
