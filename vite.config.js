import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    globals: true,
    clearMocks: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes('html2pdf.js')) {
            return "html2pdf-vendor";
          }
          if (id.includes('html2canvas')) {
            return "html2canvas-vendor";
          }
          if (id.includes('jspdf')) {
            return "jspdf-vendor";
          }
          if (id.includes('qrcode')) {
            return "qr-vendor";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
