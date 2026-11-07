window.__ModuleLoader__.load({
  id: '@pnpwin/dsh-quota',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const {useState,useEffect,useLayoutEffect,useRef,useSyncExternalStore} = React;
    const dictionaries = {
      en: {title:'LLM quotas',subtitle:'Balances and subscription windows',source:'Providers and credentials: Settings → Models only. Secrets never reach the browser.',refresh:'Refresh',refreshing:'Checking…',settings:'Settings',back:'Back',open:'Open quotas',close:'Close',empty:'No configured providers. Add a provider in Settings → Models.',loading:'Loading quotas…',retry:'Retry',checked:'Checked',left:'left',reset:'Resets',unknown:'Not reported',balance:'Account balance',keyBudget:'Key budget',plan:'Plan',stale:'Stale data',unsupported:'Not supported',missing:'Sign-in required',error:'Could not check',disabled:'Disabled',ok:'Current',view:'View',showBar:'Show quotas below the session composer',mode:'Status bar mode',all:'All providers',worst:'Lowest quota only',showReset:'Show reset countdown in the status bar',resetFormat:'Reset time format',relative:'Relative',absolute:'Absolute',interval:'Refresh interval',seconds:'seconds',enabled:'Enabled providers',save:'Save',saved:'Saved',preferences:'Display preferences',security:'Authentication',securityNote:'Only credentials stored for configured Models providers are used. Environment variables, CLI files, browser sessions and OS credential stores are not searched. Subscription APIs are not available for every provider; unknown is never displayed as 0%.',none:'No quota metrics returned',windows:'Quota windows',total:'Total',used:'Used',remaining:'Remaining',available:'Available',details:'Details',hide:'Hide',session:'Session',weekly:'Weekly',monthly:'Monthly',tools:'Web tools',monthTotal:'Monthly total',monthCode:'Monthly code',rate:'Rate',warning:'Low quota',noWindow:'Balance / status',unlimited:'No fixed limit',failed:'Request failed. Try again.',configure:'Provider switches do not change Models settings.',currencyNote:'Currencies and independent accounts are not combined.',refreshNote:'Provider queries are cached and refreshes are rate-limited.',transport:'Cannot reach quota backend. Reload the page or check plugin activation.'},
      ru: {title:'Квоты LLM',subtitle:'Балансы и лимиты подписок',source:'Провайдеры и авторизация — только из Settings → Models. Секреты не передаются в браузер.',refresh:'Обновить',refreshing:'Проверяем…',settings:'Настройки',back:'Назад',open:'Открыть квоты',close:'Закрыть',empty:'Нет настроенных провайдеров. Добавьте провайдера в Settings → Models.',loading:'Загрузка квот…',retry:'Повторить',checked:'Проверено',left:'осталось',reset:'Сброс',unknown:'Не сообщается',balance:'Баланс аккаунта',keyBudget:'Бюджет ключа',plan:'Тариф',stale:'Устаревшие данные',unsupported:'Не поддерживается',missing:'Нужна авторизация',error:'Ошибка проверки',disabled:'Отключён',ok:'Актуально',view:'Вид',showBar:'Показывать квоты под полем ввода сессии',mode:'Режим строки квот',all:'Все провайдеры',worst:'Только минимальная квота',showReset:'Показывать время до сброса в строке квот',resetFormat:'Формат времени сброса',relative:'Относительный',absolute:'Точная дата',interval:'Интервал обновления',seconds:'секунд',enabled:'Включённые провайдеры',save:'Сохранить',saved:'Сохранено',preferences:'Отображение',security:'Авторизация',securityNote:'Используются только сохранённые ключи и авторизации настроенных провайдеров Models. Переменные окружения, файлы CLI, браузерные сессии и хранилища ОС не просматриваются. Не каждый провайдер отдаёт квоту подписки; неизвестное значение никогда не отображается как 0%.',none:'Провайдер не вернул показатели квоты',windows:'Окна квоты',total:'Всего',used:'Использовано',remaining:'Осталось',available:'Доступно',details:'Подробности',hide:'Скрыть',session:'Сессия',weekly:'Неделя',monthly:'Месяц',tools:'Веб-инструменты',monthTotal:'Всего за месяц',monthCode:'Код за месяц',rate:'Скорость',warning:'Мало квоты',noWindow:'Баланс / статус',unlimited:'Без фиксированного лимита',failed:'Не удалось выполнить запрос. Попробуйте ещё раз.',configure:'Переключатели не изменяют настройки Models.',currencyNote:'Валюты и независимые аккаунты не суммируются.',refreshNote:'Результаты кешируются; частота ручных обновлений ограничена.',transport:'Backend квот недоступен. Перезагрузите страницу или проверьте включение плагина.'}
    };
    // Pure geometry; surfaces are measured only inside their own React subtree.
    function floatingPosition(anchor, naturalHeight, viewportWidth, viewportHeight, preferredWidth) {
      const margin = 12, gap = 8;
      const width = Math.min(preferredWidth, Math.max(0, viewportWidth - margin * 2));
      const aboveSpace = Math.max(0, anchor.top - gap - margin);
      const belowSpace = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
      const height = Math.min(560, Math.max(0, naturalHeight));
      const left = Math.max(margin, Math.min(anchor.left, viewportWidth - width - margin));
      // On very short viewports keep header/actions usable instead of clipping them.
      if(Math.max(aboveSpace,belowSpace)<Math.min(height,160))return {left,top:margin,width,maxHeight:Math.max(0,viewportHeight-margin*2)};
      const above = height <= aboveSpace || aboveSpace >= belowSpace;
      const maxHeight = Math.min(560, above ? aboveSpace : belowSpace);
      const top = above ? anchor.top - gap - Math.min(height, maxHeight) : anchor.bottom + gap;
      return {left, top: Math.max(margin, top), width, maxHeight};
    }
    const css = `
    .dq{font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);box-sizing:border-box}
    .dq *{box-sizing:border-box}.dq button,.dq input,.dq select{font:inherit}.dq button{cursor:pointer}.dq button:disabled{cursor:default;opacity:.5}
    .dq button:focus-visible,.dq input:focus-visible,.dq select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
    .dq-muted{color:var(--dsw-alias-label-secondary)}.dq-caption{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
    .dq-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:5px 10px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
    .dq-btn:hover{background:var(--dsw-alias-bg-layer-1)}.dq-iconbtn{width:28px;height:28px;padding:0;border:0;background:none;border-radius:6px;font-size:17px;flex:none}
    .dq-link{border:0;background:none;padding:4px 0;color:var(--dsw-alias-label-primary)}.dq-link:hover{background:none;color:var(--dsw-alias-brand-primary)}
    .dq-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.dq-actions{display:flex;gap:6px;align-items:center}
    .dq-page{height:100%;overflow:auto;background:var(--dsw-alias-bg-base);padding:24px clamp(16px,4vw,40px)}.dq-content{max-width:840px;margin:0 auto}
    .dq h2{font-size:20px;line-height:28px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px}.dq h3{font-size:13px;line-height:20px;font-weight:500;margin:0}
    .dq-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);padding:16px;margin-top:16px}
    .dq-providers{display:flex;flex-direction:column}.dq-card.dq-providers{padding:0 20px}.dq-provider{padding:16px 0;min-width:0}.dq-provider+.dq-provider{border-top:1px solid var(--dsw-alias-border-l1)}
    .dq-provider-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.dq-provider-head h3{min-width:0;overflow-wrap:anywhere}
    .dq-status{font-size:12px;line-height:18px;display:inline-flex;align-items:center;gap:6px;flex:none;color:var(--dsw-alias-label-secondary)}
    .dq-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}.dq-plan{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dq-metrics{margin:0;display:flex;flex-direction:column;gap:8px}.dq-metric{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:20px;align-items:baseline}
    .dq-metric dt{color:var(--dsw-alias-label-secondary);min-width:0;overflow-wrap:anywhere}.dq-metric dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
    .dq-reset{display:block;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-weight:400}.dq-metric-value{white-space:nowrap;font-weight:400}
    .dq-meter{grid-column:1/-1;display:block;height:3px;margin-top:5px;border-radius:3px;background:var(--dsw-alias-border-l1);overflow:hidden}.dq-meter>span{display:block;height:100%;border-radius:inherit}
    .dq-provider-note{margin:10px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.dq-provider-checked{margin-top:12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
    .dq-row{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.dq-row:last-child{border-bottom:0}.dq-row>span:first-child{max-width:70%}
    .dq-switch{border:0;border-radius:14px;min-width:36px;height:21px;padding:3px;background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);display:flex;align-items:center}
    .dq-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary);justify-content:flex-end}.dq-switch span{display:block;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-bg-base)}
    .dq-select{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:5px 7px;max-width:100%}
    .dq-bar{display:flex;align-items:center;justify-content:flex-start;flex-wrap:wrap;gap:3px 9px;max-width:100%;min-width:0;font-size:12px;line-height:1.3}
    .dq-chip{border:0;background:none;color:var(--dsw-alias-label-secondary);padding:4px 3px;display:inline-flex;align-items:center;gap:5px;border-radius:5px;max-width:100%;white-space:nowrap}
    .dq-chip:hover,.dq-chip:focus-visible,.dq-chip[aria-expanded=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.dq-chip-label{overflow:hidden;text-overflow:ellipsis;max-width:240px}
    .dq-ring{position:relative;flex:none;width:15px;height:15px;display:inline-block}.dq-ring svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}
    .dq-surface{--dq-surface-padding:16px;font-size:12px;position:fixed;display:flex;flex-direction:column;min-height:0;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base));backdrop-filter:var(--dsw-menu-backdrop-filter,none);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);border:0;border-radius:var(--dsw-radius-lg,16px);padding:var(--dq-surface-padding);box-shadow:var(--dsw-elevation-prominent,0 1px 8px color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent));--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,var(--dsw-alias-border-l2));--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,var(--dsw-alias-border-l2));overflow:hidden}
    .dq-pop{pointer-events:auto}.dq-tooltip{pointer-events:none}.dq-surface-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
    .dq-surface-title{display:flex;align-items:center;gap:8px;min-width:0}.dq-surface-title h3{font-size:12px;font-weight:500;line-height:20px}.dq-surface .dq-provider-head h3{font-size:12px}.dq-surface .dq-metrics{gap:4px}
    .dq-surface-body{overflow:auto;overscroll-behavior:contain;min-height:0;flex:1}
    .dq-pop .dq-surface-body{margin-right:calc(-1 * var(--dq-surface-padding));padding-right:16px;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:var(--dsh-scrollbar-thumb) transparent}
    .dq-surface .dq-provider{padding:12px 0}.dq-surface .dq-provider-head{margin-bottom:8px}
    .dq-surface .dq-metric dt{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}.dq-surface .dq-metric dd{color:var(--dsw-alias-label-secondary)}.dq-surface .dq-reset{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
    .dq-tooltip .dq-provider{padding:0}.dq-tooltip .dq-provider-head{padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
    .dq-tooltip .dq-provider-checked{padding-top:10px;margin-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}.dq-surface-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}
    .dq-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:10px 0}.dq-footer{border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px;margin-top:16px}.dq-head-note{margin:8px 0 20px;font-size:12px;line-height:18px}.dq-settings{width:100%}
    @media(max-width:500px){.dq-page{padding:16px}.dq-card{padding:14px}.dq-card.dq-providers{padding:0 14px}.dq-row{gap:12px}.dq-row>span:first-child{max-width:62%}.dq-chip-label{max-width:160px}.dq-metric{column-gap:12px}.dq-surface{--dq-surface-padding:14px}}
    `;
    return {
      inject:['slots','locale','layout'],
      apply(ctx) {
        const diagnostics = {
          en: {'unsupported':'No verified read-only quota API for this configured endpoint.','disabled':'Disabled in quota settings.','stored-credential-required':'Save an API key in Models; environment and .env credentials are not used.','credential-unavailable':'Stored credential could not be read.','needs-sign-in':'Sign in again in Models; this plugin never refreshes OAuth tokens.','auth-failed':'Provider rejected the saved credential. Check Models.','no-metrics':'Provider returned no usable quota or balance metrics.','no-subscription':'No active subscription was reported.','invalid-response':'Unrecognized provider response.','response-too-large':'Provider response exceeded the size limit.','provider-http-error':'Quota endpoint temporarily unavailable.','rate-limited':'Provider rate limited the request.','timeout':'Quota check timed out.','cancelled':'Quota check cancelled.','network-error':'Could not reach the quota endpoint.','configuration-unavailable':'Models configuration could not be read.','explicit-oauth-override':'The Models credential override cannot be used for subscription quotas.'},
          ru: {'unsupported':'Для этого endpoint нет проверенного API квот.','disabled':'Отключён в настройках квот.','stored-credential-required':'Сохраните API-ключ в Models. Ключи из окружения и .env не используются.','credential-unavailable':'Не удалось прочитать сохранённую авторизацию.','needs-sign-in':'Повторите вход в Models. Плагин не обновляет OAuth-токены.','auth-failed':'Провайдер отклонил сохранённый ключ. Проверьте Models.','no-metrics':'Провайдер не вернул доступных метрик квоты или баланса.','no-subscription':'Провайдер не сообщил об активной подписке.','invalid-response':'Неизвестный формат ответа провайдера.','response-too-large':'Ответ провайдера превысил допустимый размер.','provider-http-error':'API квот временно недоступен.','rate-limited':'Провайдер ограничил частоту проверок.','timeout':'Истекло время проверки квот.','cancelled':'Проверка квот отменена.','network-error':'Не удалось подключиться к API квот.','configuration-unavailable':'Не удалось прочитать настройки Models.','explicit-oauth-override':'Переопределённый в Models ключ не подходит для квоты подписки.'}
        };
        for (const [lang,dict] of Object.entries(dictionaries)) {
          for(const [code,text] of Object.entries(diagnostics[lang])) dict[`reason.${code}`]=text;
          ctx.effect(()=>ctx.locale.register('local-llm-quota',lang,dict));
        }
        const t = ctx.locale.bind('local-llm-quota');
        const listeners = new Set();
        let alive=true, flight=null, state={data:null,error:null,busy:false,overlay:null,hover:null,now:Date.now()};
        const publish = patch => {if(alive){state={...state,...patch};for(const fn of listeners)fn();}};
        const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
        const requests=new Set();
        async function request(path,body) {
          const controller=new AbortController();requests.add(controller);
          const timeout=setTimeout(()=>controller.abort(),45000);
          try {
            const response=await fetch(`/api/llm-quota/${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
            if(!response.ok)throw new Error('transport');
            const result=await response.json();
            if(result.ok===false||result.error)throw new Error('operation');
            return result.value??result;
          } finally {clearTimeout(timeout);requests.delete(controller);}
        }
        function load(force=false) {
          if(flight)return flight;
          publish({busy:true});
          flight=request(force?'refresh':'snapshot',force?{}:undefined).then(data=>publish({data,error:null})).catch(()=>publish({error:'transport'})).finally(()=>{flight=null;publish({busy:false});});
          return flight;
        }
        async function save(patch) {
          publish({busy:true,error:null});
          try {const data=await request('settings',patch);if(data.providers)publish({data});else await load();return true;}
          catch {publish({error:'failed'});return false;}
          finally {publish({busy:false});}
        }
        ctx.effect(()=>{
          load();
          const timer=setInterval(()=>{publish({now:Date.now()});if(!document.hidden)load();},30000);
          const visible=()=>{if(!document.hidden)load();};document.addEventListener('visibilitychange',visible);
          return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);for(const c of requests)c.abort();listeners.clear();};
        });
        function useQuota(){useSyncExternalStore(fn=>ctx.locale.subscribe(fn),()=>ctx.locale.getSnapshot());return useSyncExternalStore(subscribe,()=>state);}
        const pct=w=>typeof w.remainingPercent==='number'&&Number.isFinite(w.remainingPercent)?Math.max(0,Math.min(100,w.remainingPercent)):null;
        const minWindow=p=>(p.windows??[]).filter(w=>pct(w)!==null).sort((a,b)=>pct(a)-pct(b))[0];
        const tone=p=>p.status==='stale'?'warn':p.status==='error'?'error':p.status!=='ok'?'idle':minWindow(p)?(pct(minWindow(p))<=5?'error':pct(minWindow(p))<=25?'warn':'success'):'success';
        const color=tone=>`var(--dsw-alias-state-${tone}-primary)`;
        const reason=p=>p.reasonCode&&Object.hasOwn(diagnostics.en,p.reasonCode)?t(`reason.${p.reasonCode}`):p.reason;
        const stat=p=>t(({ok:'ok',stale:'stale',unsupported:'unsupported',missing:'missing','missing-auth':'missing','reauth-required':'missing','auth-required':'missing',disabled:'disabled',error:'error'})[p.status]??'unknown');
        function date(value){if(value==null)return null;const n=typeof value==='number'&&value<1e12?value*1000:value;const d=new Date(n);return Number.isFinite(d.getTime())?d:null;}
        function reset(value,format,now){const d=date(value);if(!d)return '';if(format==='absolute')return d.toLocaleString(ctx.locale.getLocale().active,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});const m=Math.max(0,Math.ceil((d.getTime()-now)/60000));if(!m)return '≤1m';return m>=1440?`${Math.floor(m/1440)}d ${Math.floor(m%1440/60)}h`:m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`;}
        const money=b=>typeof b.remaining==='number'?`${b.remaining.toLocaleString(ctx.locale.getLocale().active,{maximumFractionDigits:2,minimumFractionDigits:2})} ${b.currency??''}`:t('unknown');
        function label(w){const map={'session':'session','Session':'session','Session (5h)':'session','5 hours':'session','weekly':'weekly','Weekly':'weekly','monthly':'monthly','Monthly':'monthly','Monthly web tools':'tools','Monthly tools':'tools','Monthly total':'monthTotal','Monthly coding':'monthCode','Monthly code':'monthCode','Rate (5h)':'rate','Key limit':'keyBudget'};return map[w.label]?t(map[w.label]):w.label??w.id;}
        function Ring({value}) {
          const v=value===null?0:value;
          return h('span',{className:'dq-ring','aria-hidden':true},h('svg',{viewBox:'0 0 80 80'},
            h('circle',{cx:40,cy:40,r:33,fill:'none',stroke:'var(--dsw-alias-border-l2)',strokeWidth:7}),
            value!==null&&h('circle',{cx:40,cy:40,r:33,fill:'none',stroke:color(value<=5?'error':value<=25?'warn':'success'),strokeWidth:7,strokeDasharray:`${v*2.07345} 207.345`,strokeLinecap:v?'round':'butt'})));
        }
        function Icon({size=20}){return h('svg',{viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor',strokeWidth:1.8,'aria-hidden':true},h('circle',{cx:12,cy:12,r:9,opacity:.35}),h('path',{d:'M12 3a9 9 0 1 1-8.5 12'}),h('path',{d:'m8 12 3 3 5-6'}));}
        const Button=({children,...props})=>h('button',{type:'button',className:'dq-btn',...props},children);
        function ProviderCard({p,compact=false,tooltip=false}) {
          const s=useQuota();
          const settings=s.data?.settings??{};
          const windows=p.windows??[], balances=p.balances??[];
          const checked=date(p.checkedAt);
          const showStatus=p.status!=='ok';
          return h('section',{className:'dq-provider','aria-label':p.name},
            h('header',{className:'dq-provider-head'},
              h('h3',null,p.name),
              h('span',{className:'dq-status',title:stat(p),'aria-label':stat(p)},
                h('i',{className:'dq-dot',style:{color:color(tone(p))},'aria-hidden':true}),
                showStatus?stat(p):p.plan?h('span',{className:'dq-plan'},p.plan):null)),
            p.reason&&h('p',{className:'dq-provider-note'},reason(p)),
            h('dl',{className:'dq-metrics'},
              balances.map((b,i)=>h('div',{className:'dq-metric',key:`balance-${i}`},
                h('dt',null,b.label??(p.kind==='openrouter'?t('keyBudget'):t('balance'))),
                h('dd',null,h('span',{className:'dq-metric-value'},money(b)),
                  !compact&&typeof b.used==='number'&&h('span',{className:'dq-reset'},`${t('used')}: ${b.used} ${b.currency}`)))),
              windows.map((w,i)=>{
                const value=pct(w), resetAt=date(w.resetsAt);
                return h('div',{className:'dq-metric',key:w.id??i},
                  h('dt',null,label(w)),
                  h('dd',null,h('span',{className:'dq-metric-value'},value===null?'—':`${Math.round(value)}% ${t('left')}`),
                    resetAt&&h('time',{className:'dq-reset',dateTime:resetAt.toISOString(),title:resetAt.toLocaleString()},`${t('reset')} ${reset(w.resetsAt,settings.resetFormat,s.now)}`)),
                  !compact&&value!==null&&h('span',{className:'dq-meter','aria-hidden':true},h('span',{style:{width:`${value}%`,background:color(value<=5?'error':value<=25?'warn':'success')}})));
              })),
            !compact&&(p.notes??[]).map((note,i)=>h('p',{className:'dq-provider-note',key:i},note)),
            (!compact||tooltip)&&checked&&h('div',{className:'dq-provider-checked'},`${t('checked')}: ${checked.toLocaleString(ctx.locale.getLocale().active)}`));
        }
        function ErrorNotice(){const s=useQuota();return s.error&&h('div',{className:'dq-error',role:'alert'},t(s.error), ' ',h(Button,{onClick:()=>load(true),disabled:s.busy},t('retry')));}
        function Providers({compact=false}) {
          const s=useQuota();
          if(!s.data)return h('p',{className:'dq-muted',role:'status'},t('loading'));
          const ps=s.data.providers??[];
          const shown=compact?ps.filter(p=>!(s.data.settings?.disabledProviders??[]).includes(p.id)):ps;
          return shown.length?h('div',{className:compact?'dq-providers':'dq-card dq-providers'},shown.map(p=>h(ProviderCard,{key:p.id,p,compact}))):h('p',{className:'dq-muted'},t('empty'));
        }
        function SettingsView(){const s=useQuota();const settings=s.data?.settings;const [draft,setDraft]=useState(null);const [saved,setSaved]=useState(false);
          const settingsSignature=JSON.stringify(settings);
          useEffect(()=>{if(settings)setDraft({...settings});},[settingsSignature]);
          if(!draft)return h('div',{className:'dq'},h('p',{className:'dq-muted'},t('loading')),h(ErrorNotice));
          const change=(key,value)=>{setDraft(d=>({...d,[key]:value}));setSaved(false);};
          const toggle=(key,text)=>h('div',{className:'dq-row',key},h('span',null,text),h('button',{type:'button',className:'dq-switch',role:'switch','aria-checked':!!draft[key],'aria-label':text,onClick:()=>change(key,!draft[key])},h('span')));
          const select=(key,text,options)=>h('label',{className:'dq-row',key},h('span',null,text),h('select',{className:'dq-select',value:draft[key],onChange:e=>change(key,e.target.value)},options.map(([value,key])=>h('option',{key:value,value},t(key)))));
          return h('div',{className:'dq dq-settings'},h('section',{className:'dq-card'},h('h3',null,t('preferences')),toggle('showBar',t('showBar')),select('mode',t('mode'),[['all','all'],['worst','worst']]),toggle('showReset',t('showReset')),select('resetFormat',t('resetFormat'),[['relative','relative'],['absolute','absolute']]),h('label',{className:'dq-row'},h('span',null,`${t('interval')} (${t('seconds')})`),h('input',{className:'dq-select',type:'number',min:60,max:3600,step:30,value:draft.refreshSeconds,style:{width:100},onChange:e=>change('refreshSeconds',e.target.value)}))),h('section',{className:'dq-card'},h('h3',null,t('enabled')),h('p',{className:'dq-muted'},t('configure')),(s.data?.providers??[]).map(p=>h('label',{className:'dq-row',key:p.id},h('span',null,p.name),h('input',{type:'checkbox',checked:!draft.disabledProviders.includes(p.id),onChange:e=>change('disabledProviders',e.target.checked?draft.disabledProviders.filter(x=>x!==p.id):[...draft.disabledProviders,p.id])})))),h('div',{className:'dq-toolbar',style:{marginTop:16}},h(Button,{disabled:s.busy||!Number.isFinite(Number(draft.refreshSeconds))||Number(draft.refreshSeconds)<60||Number(draft.refreshSeconds)>3600,onClick:async()=>{setSaved(false);if(await save({...draft,refreshSeconds:Number(draft.refreshSeconds)}))setSaved(true);}},t('save')),saved&&h('span',{className:'dq-muted',role:'status'},t('saved'))),h(ErrorNotice),h('section',{className:'dq-card'},h('h3',null,t('security')),h('p',{className:'dq-muted'},t('securityNote'))));
        }
        function Page(){const s=useQuota();const [settings,setSettings]=useState(false);return h('div',{className:'dq dq-page'},h('div',{className:'dq-content'},h('header',{className:'dq-toolbar'},h('h2',null,h(Icon,{size:22}),' ',t('title'),settings?` · ${t('settings')}`:''),h('div',{className:'dq-actions'},h(Button,{onClick:()=>setSettings(!settings)},t(settings?'back':'settings')),h(Button,{onClick:()=>load(true),disabled:s.busy},t(s.busy?'refreshing':'refresh')))),h('p',{className:'dq-muted dq-head-note'},t('source')),h(ErrorNotice),settings?h(SettingsView):h(React.Fragment,null,h(Providers),h('p',{className:'dq-muted dq-footer'},t('currencyNote'),' ',t('refreshNote')))));}
        const openPage=()=>{publish({overlay:null,hover:null});ctx.layout.selectPanel('local-llm-quota');};
        function summary(p){const w=minWindow(p);const bs=(p.balances??[]).map(money).join(' · ');return w?`${Math.round(pct(w))}%`:bs||'—';}
        function Bar(){const s=useQuota();const cfg=s.data?.settings;if(cfg?.showBar===false)return null;let ps=(s.data?.providers??[]).filter(p=>!(cfg?.disabledProviders??[]).includes(p.id));if(cfg?.mode==='worst'){const withWindows=ps.filter(p=>minWindow(p));ps=withWindows.length?[withWindows.sort((a,b)=>pct(minWindow(a))-pct(minWindow(b)))[0]]:ps.slice(0,1);}
          const click=e=>{const anchor=e.currentTarget.getBoundingClientRect();publish({overlay:{anchor,trigger:e.currentTarget},hover:null});};
          return h('div',{className:'dq dq-bar','aria-label':t('title')},!ps.length?h('button',{type:'button',className:'dq-chip',onClick:click},h(Icon,{size:14}),t(s.error?'error':s.data?'title':'loading')):ps.map(p=>{const w=minWindow(p);return h('button',{type:'button',className:'dq-chip',key:p.id,onClick:click,'aria-haspopup':'dialog','aria-expanded':!!s.overlay,'aria-controls':s.overlay?'dq-quota-popover':undefined,'aria-label':`${p.name}: ${summary(p)}. ${stat(p)}. ${t('open')}`,'aria-describedby':s.hover?.p.id===p.id?'dq-quota-tooltip':undefined,onMouseEnter:e=>!state.overlay&&publish({hover:{p,anchor:e.currentTarget.getBoundingClientRect()}}),onMouseLeave:()=>publish({hover:null}),onFocus:e=>!state.overlay&&publish({hover:{p,anchor:e.currentTarget.getBoundingClientRect()}}),onBlur:()=>publish({hover:null})},w?h(Ring,{value:pct(w),small:true}):h('i',{className:'dq-dot',style:{color:color(tone(p))}}),h('span',{className:'dq-chip-label'},`${p.name} ${summary(p)}`),p.status==='stale'&&'≈',cfg?.showReset&&w?.resetsAt&&pct(w)<=15&&h('span',null,`↻ ${reset(w.resetsAt,cfg.resetFormat,s.now)}`));}));
        }
        function Overlay() {
          const s=useQuota(), pop=useRef(null);
          const [position,setPosition]=useState(null);
          const a=s.overlay?.anchor??s.hover?.anchor;
          const preferredWidth=s.overlay?360:320;
          const locale=ctx.locale.getLocale().active;
          const close=(restoreFocus=true)=>{
            const trigger=state.overlay?.trigger;
            publish({overlay:null,hover:null});
            if(restoreFocus&&trigger?.isConnected){trigger.focus({preventScroll:true});publish({hover:null});}
          };
          useLayoutEffect(()=>{
            if(!a||!pop.current){setPosition(null);return;}
            const el=pop.current;
            const body=el.querySelector('.dq-surface-body');
            const overflow=body?Math.max(0,body.scrollHeight-body.clientHeight):0;
            const next=floatingPosition(a,el.scrollHeight+overflow+2,window.innerWidth,window.innerHeight,preferredWidth);
            setPosition(previous=>previous&&Object.keys(next).every(key=>previous[key]===next[key])?previous:next);
          },[a,preferredWidth,s.data,locale,!!s.overlay]);
          useEffect(()=>{
            if(!s.overlay&&!s.hover)return;
            if(s.overlay)pop.current?.focus({preventScroll:true});
            const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(!!state.overlay);}};
            const outside=e=>{
              if(state.overlay&&pop.current&&!pop.current.contains(e.target)&&!state.overlay.trigger?.contains(e.target))close(false);
            };
            const scroll=e=>{if(!pop.current?.contains(e.target))close(false);};
            const resize=()=>close(false);
            document.addEventListener('keydown',key);
            document.addEventListener('pointerdown',outside);
            document.addEventListener('focusin',outside);
            document.addEventListener('scroll',scroll,true);
            window.addEventListener('resize',resize);
            return()=>{
              document.removeEventListener('keydown',key);
              document.removeEventListener('pointerdown',outside);
              document.removeEventListener('focusin',outside);
              document.removeEventListener('scroll',scroll,true);
              window.removeEventListener('resize',resize);
            };
          },[s.overlay,s.hover?.p.id]);
          if(!a)return null;
          const style={width:Math.min(preferredWidth,window.innerWidth-24),maxHeight:560,...position,visibility:position?'visible':'hidden'};
          if(s.overlay){
            const checked=date(s.data?.updatedAt);
            return h('div',{className:'dq dq-surface dq-pop',id:'dq-quota-popover',ref:pop,role:'dialog','aria-label':t('title'),tabIndex:-1,style},
              h('header',{className:'dq-surface-head'},
                h('div',{className:'dq-surface-title'},h(Icon,{size:16}),h('h3',null,t('title'))),
                h('div',{className:'dq-actions'},
                  h(Button,{className:'dq-btn dq-iconbtn','aria-label':t('refresh'),title:t('refresh'),onClick:()=>load(true),disabled:s.busy},'↻'),
                  h(Button,{className:'dq-btn dq-iconbtn','aria-label':t('close'),title:t('close'),onClick:()=>close()},'×'))),
              h('div',{className:'dq-surface-body'},h(ErrorNotice),h(Providers,{compact:true})),
              h('footer',{className:'dq-surface-foot'},
                h('span',{className:'dq-caption',role:'status'},s.busy?t('refreshing'):checked?`${t('checked')} ${checked.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}`:''),
                h(Button,{className:'dq-btn dq-link',onClick:openPage},t('open'),' →')));
          }
          const provider=(s.data?.providers??[]).find(p=>p.id===s.hover.p.id)??s.hover.p;
          return h('div',{className:'dq dq-surface dq-tooltip',id:'dq-quota-tooltip',ref:pop,role:'tooltip',style},
            h('div',{className:'dq-surface-body'},h(ProviderCard,{p:provider,compact:true,tooltip:true})));
        }
        function SettingsSection(){useQuota();return h('div',{className:'dq'},h('h2',null,t('title')),h(SettingsView));}
        function Styles(){return h('style',null,css);}
        const register=(name,options,component)=>ctx.slots.inject(name,()=>ctx.slots.register({name,...options},component));
        register('shell.overlay',{id:'local-llm-quota-compact-scroll-styles',order:20},Styles);
        register('shell.overlay',{id:'local-llm-quota-popover',order:21},Overlay);
        // Session statistics (turns/steps/tok/s) is activity (0), not usage (1).
        // Quotas must precede BOTH built-in dock entries.
        register('conversation.composer.dock',{id:'local-llm-quota',order:-1},Bar);
        register('main',{key:'local-llm-quota'},Page);
        register('sidebar.panellist',{id:'local-llm-quota',order:15,label:()=>t('title')},Icon);
        register('settings.section',{id:'local-llm-quota',order:30,label:()=>t('title')},SettingsSection);
      }
    };
  }
});
