// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-06-12',
  modules: ['@nuxtjs/tailwindcss', '@nuxt/eslint'],
  devtools: {
    enabled: false,
  },
  app: {
    head: {
      title: 'PLOTT Maintenance',
    },
  },

  css: ['~/assets/main.css'],
  runtimeConfig: {
    POSTMARK_TOKEN: process.env.POSTMARK_TOKEN,
    POSTMARK_MESSAGE_STREAM: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
    MAIL_FROM: process.env.MAIL_FROM,
    MAIL_TO_DEFAULT: process.env.MAIL_TO_DEFAULT,
    ciWebhookToken: process.env.CI_WEBHOOK_TOKEN,
  },
  routeRules: {
    '/api/**': { runtime: 'nodejs' },
  },
  experimental: {
    defaults: {
      nuxtLink: {
        prefetch: false,
      },
    },
    viewTransition: true,
  },

  nitro: {},
  debug: false,
  eslint: {
    config: {
      stylistic: true, // <---
    },
  },

  tailwindcss: {
    configPath: './tailwind.config.ts',
  },
})
