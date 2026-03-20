export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss'],
  nitro: {

  },
  routeRules: {
    '/api/**': { runtime: 'nodejs' }
  },
  // app head + performance hints
   runtimeConfig: {
    POSTMARK_TOKEN: process.env.POSTMARK_TOKEN,
    POSTMARK_MESSAGE_STREAM: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
    MAIL_FROM: process.env.MAIL_FROM,
    MAIL_TO_DEFAULT: process.env.MAIL_TO_DEFAULT,
    ciWebhookToken: process.env.CI_WEBHOOK_TOKEN,
  },
  devtools: {
    enabled: false,
  },
  debug: false,
  experimental: {
    defaults: {
      nuxtLink: {
        prefetch: false,
      },
    },
  },
  app: {
    head: {
      title: 'PLOTT Maintenance'
    }
  },
})
