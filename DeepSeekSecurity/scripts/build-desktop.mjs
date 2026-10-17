import { build } from '../node_modules/esbuild/lib/main.js'
import { mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const source = resolve('.cache/dsh-upstream-20261012/apps/desktop')
const out = resolve('.cache/dsh-desktop-alpha')
const modules = join(out, 'node_modules')
const common = { tsconfigRaw: {}, bundle: true, platform: 'node', format: 'esm', target: 'es2024', nodePaths: [modules], logLevel: 'info' }
await build({ ...common, entryPoints:[join(source,'src/main.ts')], outfile:join(out,'lib/main.js'), packages:'external', define:{'process.env.DSH_CLIENT_VERSION':'"0.2.1-alpha.2"'} })
await build({ ...common, entryPoints:[join(source,'src/command-manager-entry.ts')], outfile:join(out,'lib/command-manager-entry.js'), packages:'external' })
for (const name of ['preload-app','preload-welcome','preload-platform-account','preload-mandatory','preload-update-dialog']) {
  await build({...common,entryPoints:[join(source,`src/${name}.ts`)],outfile:join(out,`lib/${name}.cjs`),format:'cjs',external:['electron']})
}
await build({entryPoints:[join(source,'src/client/welcome.tsx')],outfile:join(out,'lib/welcome/welcome.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',nodePaths:[modules],define:{'process.env.NODE_ENV':'"production"'},logLevel:'info',alias:{'@deepseek-ai/dsh-client-ui-theme/src':resolve('.cache/dsh-upstream-20261012/packages/client/ui-theme/src'),'@deepseek-ai/dsh-client-ui-primitives/src':resolve('.cache/dsh-upstream-20261012/packages/client/ui-primitives/src')},loader:{'.woff2':'file','.woff':'file','.svg':'file'}})
await cp(join(source,'renderer'),join(out,'renderer'),{recursive:true})
await cp(join(source,'resources'),join(out,'resources'),{recursive:true})
for(const name of ['brand-font.css','montserrat-regular.woff2','montserrat-light.woff2','montserrat-medium.woff2','Montserrat-OFL.txt']) await cp(resolve('.cache/dsh-upstream-20261012/packages/client/ui-theme/src/styles',name),join(out,'lib/welcome',name))
const host=join(modules,'@deepseek-ai/dsh-desktop-host')
await mkdir(join(host,'lib'),{recursive:true})
const manifest=JSON.parse(await readFile(resolve('.cache/dsh-upstream-20261012/apps/desktop-host/package.json'),'utf8'))
for(const key of Object.keys(manifest.dependencies)) if(manifest.dependencies[key].startsWith('workspace:')) manifest.dependencies[key]=key==='@deepseek-ai/cordis'?'4.0.5-alpha.1':'0.2.1-alpha.2'
await writeFile(join(host,'package.json'),JSON.stringify(manifest,null,2))
for(const name of ['index','cli']) await build({...common,entryPoints:[resolve(`.cache/dsh-upstream-20261012/apps/desktop-host/src/${name}.ts`)],outfile:join(host,`lib/${name}.js`),packages:'external'})
const sharedPackages=[]
for(const item of await readdir(modules,{withFileTypes:true})) {
  if(item.name.startsWith('.')) continue
  const names=item.name.startsWith('@')?(await readdir(join(modules,item.name))).map(n=>`${item.name}/${n}`):[item.name]
  for(const name of names) try { const p=JSON.parse(await readFile(join(modules,name,'package.json'),'utf8'));sharedPackages.push({name:p.name,version:p.version,path:`node_modules/${name}`}) }catch{}
}
const release={schemaVersion:1,version:'0.2.1-alpha.2',hostProtocolVersion:4,nodeVersion:process.versions.node,pnpmVersion:'11.7.0'}
await writeFile(join(out,'desktop-runtime.json'),JSON.stringify({schemaVersion:1,release,platform:process.platform,arch:process.arch,sharedPackages,files:[]},null,2))
console.log('Built unchanged official DSH desktop and Host sources for development launch.')
