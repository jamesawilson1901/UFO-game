import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage()
p.on('pageerror', e => console.log('PAGEERROR:', e.message))
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE:', m.text().slice(0,160)) })
const bad=[]
p.on('response', r => { if (r.status()>=400) bad.push(`${r.status()} ${r.url()}`) })
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(40000)
console.log('tip:', await p.textContent('#boottip').catch(()=>'?'))
console.log('bad responses:', bad.slice(0,6))
await b.close()
