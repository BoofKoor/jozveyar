/**
 * نوار پیش‌نمایش مالک (برش ۷٫۵، ADR-052، سؤال‌های ۱۳۵ و ۱۶۸؛ طرح `checkout.html`، `st-preview`): مرورگری که پیوند پیش‌نمایش را باز
 * کرد، بالای همهٔ صفحه‌ها همین نوار را می‌بیند، با «خروج از پیش‌نمایش».
 *
 * اسکریپتی کوچک درون HTML layout، نه تکه‌ای از باندل: باندل اولیهٔ صفحه‌ها بایت‌به‌بایت همان می‌ماند، و صفحه‌های ISR برای همه یکی‌اند.
 * فقط با کوکی نشانهٔ `jy_pv` (بی `HttpOnly`، بی راز) از `/api/checkout/preview` می‌پرسد؛ مرورگر بی آن هیچ درخواستی نمی‌دهد. پیش‌نمایش
 * زنده نباشد، سرور هر دو کوکی را پاک می‌کند و نوار نمی‌آید. نوار با DOM ساخته می‌شود (متن سرور با `textContent`، هرگز HTML)، و اول
 * `body` می‌نشیند، بیرون از درختی که React می‌سازد. «خروج» ردیف را در پایگاه داده هم می‌بندد و صفحه را از نو بار می‌کند.
 */
export const PREVIEW_BAR_SCRIPT = `(function(){
if(!/(?:^|;\\s*)jy_pv=/.test(document.cookie))return;
fetch('/api/checkout/preview',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(s){
if(!s||!s.active)return;
var d=document,el=function(t,c,x){var e=d.createElement(t);if(c)e.className=c;if(x)e.textContent=x;return e};
var bar=el('div','ck-preview');bar.setAttribute('role','note');bar.setAttribute('aria-label','پیش‌نمایش مالک');bar.setAttribute('data-testid','preview-bar');
var row=el('div','site-wrap ck-preview__in'),icon=el('span','jy-icon jy-icon-warning'),p=el('p','ck-preview__text');
icon.setAttribute('aria-hidden','true');
p.appendChild(el('b','','پیش‌نمایش مالک:'));
p.appendChild(d.createTextNode(' مسیر خرید فقط برای همین مرورگر باز است، تا '+s.untilDay+' '));
p.appendChild(el('span','num',s.untilTime));
p.appendChild(d.createTextNode('. پرداخت و پیامک واقعی‌اند.'));
var b=el('button','jy-btn jy-btn--text','خروج از پیش‌نمایش');b.type='button';
b.addEventListener('click',function(){b.disabled=true;fetch('/api/checkout/preview',{method:'DELETE',credentials:'same-origin'}).then(function(){location.reload()},function(){b.disabled=false})});
row.appendChild(icon);row.appendChild(p);row.appendChild(b);bar.appendChild(row);
d.body.insertBefore(bar,d.body.firstChild);
})['catch'](function(){});
})();`;
