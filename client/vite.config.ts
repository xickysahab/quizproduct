import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * A Content-Security-Policy for the built app.
 *
 * Injected at build time rather than written into index.html, because the dev
 * server needs inline scripts and eval for hot reloading and a policy strict
 * enough to be worth having would break it. So the policy ships with the
 * production bundle and development is left alone.
 *
 * This matters more than usual here: the host session token lives in
 * localStorage, which any injected script can read. A CSP is what stops an
 * injected script from running in the first place.
 *
 * `frame-ancestors`, which a meta tag cannot express, is sent as a header by
 * vercel.json along with X-Frame-Options and HSTS — the API's own headers do
 * not protect the pages Vercel serves. Keep this the one full policy: two
 * copies of it drift.
 */
const cspPlugin = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const api = process.env.VITE_API_URL || 'http://localhost:5001'
    // Socket.IO upgrades to a WebSocket against the same origin, and ws:/wss:
    // are separate schemes to CSP — listing the https origin does not cover
    // them, so both forms are needed or live sessions silently fail to connect.
    const socket = api.replace(/^http/, 'ws')

    const policy = [
      "default-src 'self'",
      // Razorpay Checkout is loaded on demand from their CDN.
      "script-src 'self' https://checkout.razorpay.com",
      // Inline styles are unavoidable: framer-motion animates via the style
      // attribute, and Google Fonts serves a stylesheet.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      // Uploaded images are served by the API. Logos saved before uploads
      // existed may still be any https URL; the server rejects anything else.
      `img-src 'self' data: blob: https: ${api}`,
      `connect-src 'self' ${api} ${socket} https://api.razorpay.com https://lumberjack.razorpay.com`,
      // The Razorpay payment sheet is an iframe.
      "frame-src https://api.razorpay.com https://checkout.razorpay.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    return {
      html,
      tags: [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ],
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
  ],
})
