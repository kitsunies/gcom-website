import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base=process.env.EDITOR_PREVIEW_URL || 'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto(base);await page.getByText('Setup required',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Continue with Google'}).isDisabled(),true);
  await page.evaluate(()=>document.fonts.ready);
  async function check(label) {
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],label);
    const facts=await page.evaluate(()=>({
      bodyFont:getComputedStyle(document.body).fontFamily,
      headingFont:getComputedStyle(document.querySelector('h1')).fontFamily,
      background:getComputedStyle(document.documentElement).backgroundColor,
      overflow:document.documentElement.scrollWidth>window.innerWidth,
      smallButtons:[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width<44||r.height<44}).length,
      radii:[...new Set([...document.querySelectorAll('button,input,.setup-panel,.profile-panel,.draft-chip,.portrait')].map(el=>getComputedStyle(el).borderRadius))]
    }));
    assert.match(facts.bodyFont,/Nunito/);assert.match(facts.headingFont,/Pixelify Sans/);assert.equal(facts.background,'rgb(28, 28, 28)');assert.equal(facts.overflow,false);assert.equal(facts.smallButtons,0);
    assert.ok(facts.radii.every(radius=>['12px','14px'].includes(radius)),JSON.stringify(facts));
    console.log(label,JSON.stringify(facts));
  }
  await check('setup desktop');
  await page.setViewportSize({width:390,height:844});await check('setup mobile');
  await context.close();
  // Browser-only auth and empty roster responses exercise editable DOM without server accounts.
  const edit=await browser.newContext();
  const token='test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
  await edit.addInitScript(value=>localStorage.setItem('pocketbase_auth',JSON.stringify({token:value,record:{id:'abcdefghijklmn1',collectionName:'committee_users',verified:true}})),token);
  const editorPage=await edit.newPage();
  await editorPage.route('**/api/editor/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const response=path.endsWith('/setup')?{authReady:true,publishReady:true,pocketbaseReady:true,missing:[]}:path.endsWith('/profiles')?{records:[],version:'fixture-version'}:path.endsWith('/publication')?{head:'a'.repeat(40),last:null,deployment:{status:'unverified',live:false}}:{message:'Test operation disabled'};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  });
  await editorPage.goto(base);await editorPage.getByRole('heading',{name:'New profile',exact:true}).waitFor();
  const result=await new AxeBuilder({page:editorPage}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],'editable empty state');
  await editorPage.getByRole('button',{name:'+ Add link',exact:true}).click();
  await editorPage.getByRole('textbox',{name:'Name',exact:true}).fill('Accessibility fixture');
  const form=await new AxeBuilder({page:editorPage}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(form.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],'editable link form');
  await editorPage.setViewportSize({width:390,height:844});assert.equal(await editorPage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  assert.equal(await editorPage.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width<44||r.height<44}).length),0);
  const upload=await editorPage.locator('.upload').boundingBox();assert.ok(upload.width>=44&&upload.height>=44);
  console.log('Editable empty and link form: axe passed; mobile overflow absent; controls >=44px.');
  await edit.close();
} finally {await browser.close();}
