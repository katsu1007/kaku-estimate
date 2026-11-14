from playwright.sync_api import sync_playwright
import glob
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
INIT="delete window.showDirectoryPicker;window.showDirectoryPicker=undefined;Object.defineProperty(window,'showDirectoryPicker',{value:undefined});"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    def dev():
        ctx=b.new_context(viewport={'width':390,'height':844},accept_downloads=True);ctx.add_init_script("window.__noFS=1;")
        pg=ctx.new_page();pg.goto('http://localhost:8765/');pg.wait_for_timeout(1000);pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300);return pg
    A=dev()
    A.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];p.name='Safariの案件';a.touch(p);await a.flush()}")
    A.goto('http://localhost:8765/#/settings');A.wait_for_timeout(600)
    print('Safari表示:', A.locator('#syShare').count()==1)
    names=[]
    A.on('download',lambda d:(d.save_as('tests/e2e/out/dl2/'+d.suggested_filename),names.append(d.suggested_filename)))
    A.click('#syShare');A.wait_for_timeout(2500)
    print('保存した:',names)
    B=dev();B.goto('http://localhost:8765/#/settings');B.wait_for_timeout(600)
    B.set_input_files('#syFiles',[f for f in glob.glob('tests/e2e/out/dl2/*.json')]);B.wait_for_timeout(1500)
    print('B:',[t.inner_text() for t in B.locator('.toast').all()],B.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects.map(p=>p.name)}"))
    b.close()
