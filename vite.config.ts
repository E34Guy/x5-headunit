import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig(async () => {
  const electronPlugins: PluginOption[] = await electron({
    main: {
      entry: 'electron/main.ts',
    },
    preload: {
      input: 'electron/preload.ts',
      vite: {
        build: {
          rolldownOptions: {
            output: {
              entryFileNames: 'preload.cjs',
            },
          },
        },
      },
    },
  })

  return {
    plugins: [react(), ...electronPlugins],
  }
})
