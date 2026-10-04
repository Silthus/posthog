import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath } from 'node:url'
import * as path from 'path'

import base from '../.storybook/main'

// PROTOTYPE ONLY: the full Storybook indexes every story in the repo. This config reuses the real
// preview, decorators, mocks and aliases, but indexes just the decision step prototype so it boots fast
// and builds a small static bundle for sharing.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REAL_CONFIG = path.resolve(__dirname, '..', '.storybook')

const resolveStaticDir = (dir: string): string => path.resolve(REAL_CONFIG, dir)

const config: StorybookConfig = {
    ...base,
    stories: ['../../../products/workflows/frontend/Workflows/hogflows/editor/graph/DecisionStepPrototype.stories.tsx'],
    staticDirs: (base.staticDirs ?? []).map((entry) =>
        typeof entry === 'string' ? resolveStaticDir(entry) : { ...entry, from: resolveStaticDir(entry.from) }
    ),
}

export default config
