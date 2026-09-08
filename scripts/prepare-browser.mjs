import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const require=createRequire(import.meta.url);
const source=dirname(require.resolve('playwright-core/package.json'));
const target=resolve('src-tauri/resources/browser/node_modules/playwright-core');
mkdirSync(dirname(target),{recursive:true});
cpSync(source,target,{recursive:true,dereference:true});
