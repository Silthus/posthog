#!/usr/bin/env node
// The package bin. In the shipped package this is plain JavaScript that tsc produced, and
// it imports dist/main.js directly. Here it loads cli/main.ts through jiti, so the
// prototype needs no build step of its own.
//
// jiti's other job, loading the customer's workflow file, is the same either way and lives
// in cli/load.ts. That one does not go away when the CLI itself is compiled.

import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)
await jiti.import('../cli/main.ts')
