import { defineConfig, PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  // Conditionally add the SSL plugin based on the mode
  const plugins: PluginOption[] = [react()]

  if (mode === 'ssl') {
    plugins.push(basicSsl())
  }

  return {
    plugins,
    server: {
      host: true
    }
  }
})