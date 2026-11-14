import asyncio
from playwright.async_api import async_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        for name,vw,vh,mob in [('pc',1280,900,False),('ip',390,844,True)]:
            ctx=await b.new_context(viewport={'width':vw,'height':vh},device_scale_factor=2 if mob else 1,is_mobile=mob,has_touch=mob)
            pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
            await pg.goto('http://localhost:8765/'); await pg.wait_for_timeout(700)
            await pg.check('#nt_ok'); await pg.click('#nt_go'); await pg.wait_for_timeout(300); await pg.click('#i_go'); await pg.wait_for_timeout(300)
            pid=(await pg.evaluate('location.hash')).split('/')[2]
            await pg.goto(f'http://localhost:8765/#/p/{pid}/2'); await pg.wait_for_timeout(300)
            await pg.set_input_files('#dwgFile',REAL_TOILET)
            await pg.wait_for_selector('#dwgFaces button',state='attached',timeout=90000); await pg.wait_for_timeout(300)
            # 区画ボタンで2つ選んで1部屋、ほかに1つを地図タップで
            await pg.click('#dwgFaces >> xpath=.. >> summary'); await pg.click('#dwgFaces button >> nth=0'); await pg.click('#dwgFaces button >> nth=1'); await pg.wait_for_timeout(200)
            await pg.screenshot(path=f'tests/e2e/shots/dwg_{name}_sel.png')
            await pg.click('[data-act=mkOne]'); await pg.wait_for_timeout(400)
            # 図面の上で区画をタップ
            await pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200)
            poly=await pg.query_selector('polygon[data-i]:not([fill-opacity="0.22"])')
            bb=await poly.bounding_box(); print(name,'bbox',bb, 'vp', vw, vh)
            if mob: await pg.touchscreen.tap(bb['x']+bb['width']/2, bb['y']+bb['height']/2)
            else: await pg.mouse.click(bb['x']+bb['width']/2, bb['y']+bb['height']/2)
            await pg.wait_for_timeout(300)
            selN=await pg.evaluate("document.querySelectorAll('#dwgFaces button.on').length")
            await pg.click('[data-act=mkOne]'); await pg.wait_for_timeout(400)
            rooms=await pg.evaluate("async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects[0];return p.rooms.map(r=>[r.name,r.area,r.perim,r.h,(r.faces||[]).length,c.roomGeom(r).wall])}")
            print(name,'tap selected',selN,'rooms',rooms, errs or 'no errors')
            await pg.evaluate("window.scrollTo(0,0)")
            await pg.screenshot(path=f'tests/e2e/shots/dwg_{name}.png', full_page=False)
            await ctx.close()
        await b.close()
asyncio.run(main())
