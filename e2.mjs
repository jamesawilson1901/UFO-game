import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage()
p.on('request', r => { if (!/\.(glb|gltf|png|ogg|wav|bin|obj|mtl|fbx)$/.test(r.url())) console.log('REQ ', r.resourceType(), r.url()) })
p.on('response', async r => { if (!/\.(glb|gltf|png|ogg|wav|bin|obj|mtl|fbx)$/.test(r.url())) console.log('RES ', r.status(), r.url()) })
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(8000)
await b.close()
