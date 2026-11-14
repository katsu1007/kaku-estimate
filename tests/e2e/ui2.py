import asyncio
from playwright.async_api import async_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        pg=await ctx.new_page()
        await pg.goto('http://localhost:8765/'); await pg.wait_for_timeout(700)
        await pg.check('#nt_ok'); await pg.click('#nt_go'); await pg.wait_for_timeout(300); await pg.click('#i_go'); await pg.wait_for_timeout(300)
        pid=(await pg.evaluate('location.hash')).split('/')[2]
        await pg.goto(f'http://localhost:8765/#/p/{pid}/2'); await pg.wait_for_timeout(300)
        await pg.set_input_files('#dwgFile',REAL_TOILET)
        await pg.wait_for_selector('#dwgFaces button',state='attached',timeout=90000); await pg.wait_for_timeout(300)
        for i in ['13','25']:
            await pg.evaluate(f"document.querySelector('#dwgView').scrollIntoView({{block:'start'}})"); await pg.wait_for_timeout(100)
        polys=await pg.evaluate("[...document.querySelectorAll('polygon[data-i]')].map(p=>{const r=p.getBoundingClientRect();return [p.dataset.i,r.x+r.width/2,r.y+r.height/2,r.width*r.height]}).sort((a,b)=>b[3]-a[3]).slice(0,2)")
        for _,x,y,_a in polys: await pg.touchscreen.tap(x,y); await pg.wait_for_timeout(150)
        await pg.evaluate("window.scrollBy(0,-60)")
        await pg.screenshot(path='tests/e2e/shots/dwg_ip2.png')
        await pg.click('[data-act=mkOne]'); await pg.wait_for_timeout(400)
        await pg.evaluate("document.querySelector('.rooms').scrollIntoView({block:'start'})"); await pg.evaluate("window.scrollBy(0,-80)")
        await pg.screenshot(path='tests/e2e/shots/dwg_ip3.png')
        await b.close()
asyncio.run(main())
