import argparse,json,tempfile
from pathlib import Path
from urllib.parse import unquote,urlsplit,parse_qs
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser(description='Tests landing Meta events with every external request intercepted.')
parser.add_argument('--output',type=Path)
parser.add_argument('--sdk-file',type=Path)
parser.add_argument('--pixel-config-file',type=Path)
args=parser.parse_args()
if bool(args.sdk_file)!=bool(args.pixel_config_file):parser.error('Provide both official SDK and public pixel config files, or neither.')
ROOT=Path(__file__).resolve().parents[1]
OUT=args.output or Path(tempfile.mkdtemp(prefix='freeisland-meta-tests-'))
OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='https://freeisland.onrender.com'
OP='free-island-principal'
checks=[]
sdk_stub='''window.__captured=window.__captured||[];var queued=window.fbq.queue.slice();window.fbq.queue.length=0;window.fbq.callMethod=function(){window.__captured.push(Array.from(arguments));};queued.forEach(function(args){window.fbq.callMethod.apply(window.fbq,args);});'''

def check(name,value):
    checks.append({'name':name,'passed':bool(value)})
    assert value,name

def fixture(browser,width=390,choice=None,sdk_failures=0,optional_failures=0,storage_blocked=False,real_sdk=False,debug=False,database_status=201,database_failures=0,anonymous_status=204):
    options={'viewport':{'width':width,'height':844},'service_workers':'block'}
    if real_sdk:
        # The official SDK excludes HeadlessChrome from measurement. Emulate the
        # regular browser used by visitors while keeping every request intercepted.
        options['user_agent']='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    context=browser.new_context(**options)
    state={'groups':[{'name':'Free Island [01]','destination_id':'1','priority':1,'members':989,'capacity_limit':990,
                     'status':'fresh','landing_enabled':True,'operation_slug':OP,'invite_url':'https://chat.whatsapp.com/IsolatedGroupCode00000001'}],
           'sdk_requests':0,'optional_requests':0,'writes':[],'anonymous_requests':[],'database_requests':[],'errors':[],'requests':[],'wire':[],'console':[],'route_failure':False}
    init='''window.__navigations=[];window.open=function(){return {closed:false,opener:null,close:function(){this.closed=true;},location:{replace:function(url){window.__navigations.push(url);}}};};'''
    if choice:init+='localStorage.setItem("fi_privacy_consent_v1",'+json.dumps(choice)+');'
    if storage_blocked:init+='Object.defineProperty(Storage.prototype,"getItem",{value:function(){throw new Error("Blocked");}});Object.defineProperty(Storage.prototype,"setItem",{value:function(){throw new Error("Blocked");}});'
    context.add_init_script(init)
    def intercept(route):
        req=route.request;url=urlsplit(req.url);state['requests'].append(req.url)
        if url.hostname=='connect.facebook.net' and url.path.endswith('/fbevents.js'):
            state['sdk_requests']+=1
            if state['sdk_requests']<=sdk_failures:route.abort();return
            body=args.sdk_file.read_text() if real_sdk else sdk_stub
            route.fulfill(status=200,content_type='application/javascript',body=body);return
        if url.hostname and (url.hostname.endswith('facebook.com') or url.hostname.endswith('facebook.net')):
            if url.path.startswith('/tr'):
                state['wire'].append({'url':req.url,'body':req.post_data})
            if real_sdk and '/signals/config/' in url.path:
                route.fulfill(status=200,content_type='application/javascript',body=args.pixel_config_file.read_text());return
            route.fulfill(status=200,content_type='application/javascript' if '/signals/' in url.path else 'text/plain',body='');return
        if url.path=='/api/public/landing':
            body={'ok':True,'operation_slug':OP,'promotions':[],'today_count':0,
                  'audience':{'status':'fresh','total_members':0,'whatsapp_groups':state['groups']}}
            route.fulfill(status=503 if state['route_failure'] else 200,content_type='application/json',body=json.dumps(body),headers={'Access-Control-Allow-Origin':ORIGIN});return
        if url.hostname and url.hostname.endswith('.supabase.co'):
            headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'apikey, authorization, content-type, prefer','Access-Control-Allow-Methods':'POST, OPTIONS'}
            if req.method=='OPTIONS':route.fulfill(status=204,headers=headers,body='');return
            if url.path=='/rest/v1/rpc/freeisland_record_page_view':
                state['anonymous_requests'].append({'payload':json.loads(req.post_data or '{}'),'referer':req.headers.get('referer'),'cookie':req.headers.get('cookie')})
                route.fulfill(status=anonymous_status,headers=headers,body='');return
            if req.method=='POST':
                row=json.loads(req.post_data or '{}');state['writes'].append(row)
                state['database_requests'].append({'reason':row.get('flush_reason'),'transport':req.resource_type})
            status=503 if len(state['writes'])<=database_failures else database_status
            body=json.dumps({'code':'42501','message':'permission denied for table page_sessions'}) if status==403 else '[]'
            route.fulfill(status=status,headers=headers,content_type='application/json',body=body);return
        if req.url.startswith(ORIGIN+'/'):
            if url.path=='/meta-events.js':
                state['optional_requests']+=1
                if state['optional_requests']<=optional_failures:route.abort();return
            file=ROOT/(unquote(url.path).lstrip('/') or 'index.html')
            if file.exists() and file.is_file() and ROOT in file.resolve().parents:
                route.fulfill(status=200,path=file);return
            route.fulfill(status=404,body='Not found');return
        route.fulfill(status=204,body='')
    context.route('**/*',intercept)
    page=context.new_page();page.on('pageerror',lambda error:state['errors'].append(str(error)))
    page.on('console',lambda message:state['console'].append(message.text) if message.type in ['warning','error'] else None)
    page.goto(ORIGIN+('/?debugMeta=true' if debug else '/'),wait_until='domcontentloaded')
    page.wait_for_function('window.FreeIslandAnonymousPageViews && FreeIslandAnonymousPageViews.getStatus().state!=="sending"')
    page.evaluate('''window.addEventListener('click',function(e){if(e.target.closest('[data-meta-event="telegram"],[data-meta-event="offers"]')){window.__defaultBeforeHarness=e.defaultPrevented;e.preventDefault();}});''')
    return context,page,state

def ready(page):page.wait_for_function('window.__captured && window.__captured.some(e=>e[1]==="ViewContent")')
def events(page,name):return page.evaluate('(name)=>(window.__captured||[]).filter(e=>e[1]===name)',name)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    for width in [390,1440]:
        label=str(width)+' '
        context,page,state=fixture(browser,width)
        page.locator('[data-consent-accept]').wait_for()
        check(label+'fresh visit does not load pixel',state['sdk_requests']==0 and not state['writes'])
        check(label+'normal visit has no diagnostics panel',page.locator('#fi-meta-diagnostics').count()==0)
        check(label+'anonymous total counted before choice',len(state['anonymous_requests'])==1)
        anonymous=state['anonymous_requests'][0]
        check(label+'anonymous request contains only public path',anonymous['payload']=={'p_page_path':'/'})
        check(label+'anonymous request excludes cookies and referrer',anonymous['cookie'] is None and anonymous['referer'] is None)
        page.locator('[data-consent-essential]').click()
        page.locator('[data-meta-event="telegram"]').first.click()
        check(label+'essential choice does not track',state['sdk_requests']==0 and not state['writes'])
        check(label+'anonymous total survives detailed metrics refusal',len(state['anonymous_requests'])==1 and page.evaluate('FreeIslandAnonymousPageViews.getStatus().state')=='recorded')
        page.locator('[data-consent-settings]').first.click();page.locator('[data-consent-accept]').click();ready(page)
        check(label+'correct pixel initialized once',len(events(page,'1479287410507022'))==1)
        check(label+'one pageview and viewcontent',len(events(page,'PageView'))==len(events(page,'ViewContent'))==1)
        check(label+'explicit consent granted',len(events(page,'grant'))==1)
        page.locator('[data-whatsapp-link]').first.click();page.wait_for_function('window.__navigations.length===1')
        check(label+'valid invite emits lead and whatsappclick',len(events(page,'Lead'))==len(events(page,'WhatsAppClick'))==1)
        lead=events(page,'Lead')[0]
        check(label+'lead describes redirect rather than group membership',lead[0]=='track' and lead[2]['conversion_stage']=='invite_redirect' and lead[2]['membership_confirmed'] is False)
        check(label+'event identifiers supplied',bool(lead[3]['eventID']) and lead[3]['eventID']!=events(page,'WhatsAppClick')[0][3]['eventID'])
        page.locator('[data-whatsapp-link]').first.click();page.wait_for_timeout(100)
        check(label+'rapid repeated click deduplicated',len(events(page,'Lead'))==1)
        state['groups'][0]['members']=990
        state['groups'].append({**state['groups'][0],'name':'Free Island [02]','priority':2,'members':10,'invite_url':'https://chat.whatsapp.com/IsolatedGroupCode00000002'})
        page.wait_for_timeout(1300);page.locator('[data-whatsapp-link]').last.click();page.wait_for_function('window.__navigations.length===3')
        check(label+'live hierarchy picks next available group',page.evaluate('window.__navigations[2]').endswith('00000002'))
        state['groups'][0]['members']=988
        page.wait_for_timeout(1300);page.locator('[data-whatsapp-link]').first.click();page.wait_for_function('window.__navigations.length===4')
        check(label+'reopened first group takes priority',page.evaluate('window.__navigations[3]').endswith('00000001'))
        before=len(events(page,'Lead'));state['groups']=[]
        page.wait_for_timeout(1300);page.locator('[data-whatsapp-link]').first.click();page.wait_for_timeout(200)
        check(label+'no false lead with unavailable group',len(events(page,'Lead'))==before)
        check(label+'no invite navigation without available group',page.evaluate('window.__navigations.length')==4)
        page.locator('[data-meta-event="telegram"]').first.click()
        check(label+'telegram custom event preserved',events(page,'TelegramClick')[-1][0]=='trackCustom')
        check(label+'tracking does not cancel telegram navigation',page.evaluate('window.__defaultBeforeHarness') is False)
        page.locator('[data-meta-event="offers"]').first.click()
        check(label+'offer custom event preserved',len(events(page,'OfferClick'))==1)
        page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');page.wait_for_timeout(200)
        check(label+'scroll depth events preserved',len(events(page,'Scroll50'))==len(events(page,'Scroll90'))==1)
        page.evaluate('window.FreeIslandPrivacy.accept();window.FreeIslandPrivacy.accept()');page.wait_for_timeout(100)
        check(label+'accept again does not duplicate initialization',len(events(page,'PageView'))==len(events(page,'ViewContent'))==1 and state['sdk_requests']==1)
        page.locator('[data-consent-settings]').first.click()
        check(label+'opening preferences keeps current choice',page.evaluate('FreeIslandPrivacy.getChoice()')=='analytics')
        page.locator('[data-consent-essential]').click();writes=len(state['writes']);count=len(events(page,'TelegramClick'))
        page.locator('[data-meta-event="telegram"]').first.click();page.wait_for_timeout(3300)
        check(label+'withdrawal stops meta events',len(events(page,'TelegramClick'))==count and bool(events(page,'revoke')))
        check(label+'withdrawal stops own analytics timers',len(state['writes'])==writes)
        page.evaluate('FreeIslandPrivacy.accept()');page.locator('[data-meta-event="telegram"]').last.click()
        check(label+'consent can be enabled again',len(events(page,'TelegramClick'))==count+1)
        page.screenshot(path=str(OUT/('fixed-'+str(width)+'.png')),full_page=False)
        check(label+'no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check(label+'no browser errors',not state['errors'])
        context.close()
    for kind,options in [('sdk_retry',{'choice':'analytics','sdk_failures':1}),('loader_retry',{'choice':'analytics','optional_failures':1}),('storage_unavailable',{'storage_blocked':True})]:
        context,page,state=fixture(browser,**options)
        if kind=='storage_unavailable':page.locator('[data-consent-accept]').click()
        ready(page)
        check(kind+' loads events successfully',len(events(page,'PageView'))==len(events(page,'ViewContent'))==1)
        check(kind+' no duplicate library',state['sdk_requests']==(2 if kind=='sdk_retry' else 1))
        context.close()
    context,page,state=fixture(browser,choice='analytics',sdk_failures=100)
    page.wait_for_timeout(3500)
    check('permanent ad blocker diagnosed',page.evaluate('FreeIslandMetaEvents.getStatus().error')=='meta_library_unavailable')
    check('blocked sdk retries bounded',state['sdk_requests']==2)
    page.evaluate('FreeIslandPrivacy.essentialOnly()')
    check('withdrawal drops undelivered queued events',page.evaluate('fbq.queue.every(x=>x[0]==="consent")'))
    context.close()
    context,page,state=fixture(browser)
    page.add_script_tag(url=ORIGIN+'/anonymous-page-count.js?v=20261029_3')
    page.evaluate('''() => {const e=new Event('pageshow');Object.defineProperty(e,'persisted',{value:true});window.dispatchEvent(e);}''')
    check('duplicate script and history restore do not double count',len(state['anonymous_requests'])==1)
    check('anonymous total creates no visitor identifiers',page.evaluate('localStorage.getItem("fi_visitor")===null && localStorage.getItem("fi_session")===null'))
    context.close()
    context,page,state=fixture(browser,debug=True,anonymous_status=404)
    page.wait_for_function('document.querySelector("[data-diagnostic-anonymous]").textContent.includes("falha")')
    check('anonymous migration errors are visible',page.evaluate('FreeIslandAnonymousPageViews.getStatus().last_http_status')==404)
    check('ambiguous anonymous error is not retried',len(state['anonymous_requests'])==1)
    context.close()
    for width in [390,1440]:
        context,page,state=fixture(browser,width=width,debug=True)
        page.locator('#fi-meta-diagnostics').wait_for()
        check(str(width)+' diagnostic alone does not authorize metrics',state['sdk_requests']==0 and not state['writes'])
        page.locator('[data-diagnostic-accept]').click();ready(page)
        page.wait_for_function('window.FreeIslandSessionAnalytics && FreeIslandSessionAnalytics.getStatus().state==="recorded"')
        page.wait_for_function('document.querySelector("[data-diagnostic-database]").textContent.includes("201")')
        check(str(width)+' database response visible',page.locator('[data-diagnostic-database]').inner_text().find('201')>=0)
        check(str(width)+' database table and project identified',page.evaluate('FreeIslandSessionAnalytics.getStatus().table')=='page_sessions' and page.evaluate('FreeIslandSessionAnalytics.getStatus().project_ref')=='qpzwinntrphqaabatoaf')
        page.evaluate('''() => {fbq.getState=()=>({pixels:[{id:'1479287410507022',eventCount:2,userData:{email:'NEVER_COPY_EMAIL'}}]});}''')
        report=page.evaluate('FreeIslandMetricsDiagnostics.getStatus()')
        check(str(width)+' report excludes credentials and SDK user data','eyJ' not in json.dumps(report) and 'NEVER_COPY_EMAIL' not in json.dumps(report))
        page.evaluate('''() => {window.__keepalive=[];const nativeFetch=fetch;window.fetch=function(url,options){if(String(url).includes('/rest/v1/page_sessions'))window.__keepalive.push(options.keepalive===true);return nativeFetch.apply(this,arguments);};window.dispatchEvent(new Event('pagehide'));}''')
        page.wait_for_function('window.__keepalive.length>0')
        check(str(width)+' leaving page uses keepalive',page.evaluate('window.__keepalive[0]') is True)
        check(str(width)+' retries and checkpoints share one access id',len({row['page_view_id'] for row in state['writes']})==1)
        check(str(width)+' diagnostic does not overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.screenshot(path=str(OUT/('diagnostic-'+str(width)+'.png')),full_page=False)
        check(str(width)+' diagnostic error free',not state['errors'])
        context.close()
    context,page,state=fixture(browser,choice='analytics',debug=True,sdk_failures=100)
    page.wait_for_function('window.FreeIslandMetaEvents && FreeIslandMetaEvents.getStatus().error==="meta_library_unavailable"')
    page.wait_for_function('document.querySelector("[data-diagnostic-summary]").textContent.includes("meta_library_unavailable")')
    check('diagnostic identifies Meta library failure',page.locator('[data-diagnostic-summary]').inner_text().find('meta_library_unavailable')>=0)
    check('Meta failure does not disable database writes',page.evaluate('FreeIslandSessionAnalytics.getStatus().last_http_status')==201)
    context.close()
    context,page,state=fixture(browser,choice='analytics',debug=True,optional_failures=100)
    page.wait_for_timeout(2500)
    check('diagnostic identifies first party event script failure','blocked_or_failed' in page.evaluate('JSON.stringify(FreeIslandPrivacy.getStatus())'))
    check('first party event script failure leaves database working',page.evaluate('FreeIslandSessionAnalytics.getStatus().last_http_status')==201)
    context.close()
    context,page,state=fixture(browser,choice='analytics',debug=True,database_status=403)
    page.wait_for_function('window.FreeIslandSessionAnalytics && FreeIslandSessionAnalytics.getStatus().last_http_status===403')
    page.wait_for_function('document.querySelector("[data-diagnostic-database]").textContent.includes("403")')
    check('database policy errors are visible',page.locator('[data-diagnostic-database]').inner_text().find('42501')>=0)
    check('database failure does not disable Meta',len(events(page,'PageView'))==1)
    context.close()
    context,page,state=fixture(browser,choice='analytics',database_failures=1)
    page.wait_for_function('window.FreeIslandSessionAnalytics && FreeIslandSessionAnalytics.getStatus().last_http_status===201')
    check('transient database error retried',any(item['reason']=='retry' for item in state['database_requests']))
    check('database retry keeps same access id',len({row['page_view_id'] for row in state['writes']})==1)
    context.close()
    context,page,state=fixture(browser,choice='analytics')
    ready(page);page.reload(wait_until='domcontentloaded');ready(page)
    check('persisted acceptance loads pixel on next page',state['sdk_requests']==2 and len(events(page,'PageView'))==1)
    page.goto(ORIGIN+'/guias/escolher-monitor.html',wait_until='domcontentloaded')
    page.wait_for_function('window.__captured && window.__captured.some(x=>x[1]==="PageView")')
    check('nested guide loads correct relative assets',len(events(page,'PageView'))==1 and len(events(page,'ViewContent'))==0)
    check('nested guide tracking error free',not state['errors'])
    context.close()
    if args.sdk_file:
        context,page,state=fixture(browser,choice='analytics',real_sdk=True)
        page.wait_for_timeout(2500)
        page.locator('[data-whatsapp-link]').first.click();page.wait_for_function('window.__navigations.length===1')
        page.wait_for_timeout(1500)
        wire=[]
        for item in state['wire']:
            params=parse_qs(urlsplit(item['url']).query)
            if item['body']:params.update(parse_qs(item['body']))
            wire.append({'event':params.get('ev'),'pixel':params.get('id')})
        (OUT/'real-sdk.json').write_text(json.dumps({'wire':wire,'requests':state['requests'],'errors':state['errors']},indent=2))
        check('official sdk executes without browser errors',not state['errors'])
        check('official sdk loads',page.evaluate('FreeIslandMetaEvents.getStatus().library')=='loaded')
        for name in ['PageView','ViewContent','WhatsAppClick','Lead']:
            check('official sdk prepares '+name+' once for correct pixel',sum(row['event']==[name] and row['pixel']==['1479287410507022'] for row in wire)==1)
        print(json.dumps({'official_sdk_wire_events':wire}),flush=True)
        context.close()
    browser.close()
report={'passed':sum(row['passed'] for row in checks),'total':len(checks),'checks':checks,'external_events_sent':0}
(OUT/'browser-meta.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
