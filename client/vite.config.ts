import { defineConfig, PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  // Conditionally add the SSL plugin based on the mode
  const useHttps = mode === 'ssl' || mode === 'development'
  const plugins: PluginOption[] = [react()]

  if (useHttps) {
    plugins.push(basicSsl())
  }

  return {
    plugins,
    server: {
      host: true,
      // Vite expects HTTPS options (or undefined), not a boolean.
      https: useHttps ? {} : undefined,
    }
  }
})