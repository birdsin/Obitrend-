/* OBITREND premium dashboard progressive enhancement — staging branch only. */
(function(){
"use strict";
if(window.__OB_LUXURY_DASH__)return;window.__OB_LUXURY_DASH__=true;
var L=[
["fashion-image-001","NEW YORK","USA","Times Square Rooftop","Times Square, New York — Broadway at night","https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Times_Square%2C_NYC_at_night_-_August_2025.jpg/960px-Times_Square%2C_NYC_at_night_-_August_2025.jpg"],
["fashion-image-013","LONDON","UK","Westminster & Big Ben","Westminster Bridge, London — Palace of Westminster and Elizabeth Tower","https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Palace_of_Westminster_and_Big_Ben_viewed_from_Westminster_Bridge.jpg/960px-Palace_of_Westminster_and_Big_Ben_viewed_from_Westminster_Bridge.jpg"],
["fashion-image-028","PARIS","FRANCE","Eiffel Tower Editorial","Champ de Mars, Eiffel Tower, Paris","https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Eiffel_Tower_4_July_28%2C_2025.jpg/960px-Eiffel_Tower_4_July_28%2C_2025.jpg"],
["fashion-image-037","MILAN","ITALY","Duomo di Milano","Piazza del Duomo, Milan","https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Il_Duomo_di_Milano_-_July_2026.jpg/960px-Il_Duomo_di_Milano_-_July_2026.jpg"],
["fashion-image-044","LAGOS","NIGERIA","Ikoyi Lagoon & Bridge","Lekki-Ikoyi Link Bridge, Lagos","https://images.unsplash.com/photo-1744907895363-d351aa6019ef?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=60&w=1600"],
["fashion-image-071","DUBAI","UAE","Palm Jumeirah Resort","Palm Jumeirah, Dubai — waterfront resort skyline","https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Th8_Palm_Dubai_Beach_Resort.jpg/960px-Th8_Palm_Dubai_Beach_Resort.jpg"]
];
var SOON=[
["Runway Video Creator","Moving runway campaign concepts","/studio/assets/fashion-campaigns-ClsFp2fc.webp"],["Lookbook Generator","Multi-look collection presentation","/studio/assets/lookbook-CkGTdr0G.webp"],["Flatlay Studio","Elevated overhead product arrangements","/studio/assets/product-photography-wWc2mJJS.webp"],["Model Swap","Alternative model casting directions","/studio/assets/model-selection-Bw5N1qA9.webp"],["Garment Try-On","Garment styling on a selected model","/studio/assets/virtual-try-on-N2byGXIi.webp"],["Logo Placer","Brand marks on fashion product visuals","/studio/assets/fashion-image-DKA2QW18.webp"],["Fabric Swatch Expander","Repeatable fabric and texture swatches","/studio/assets/fabric-studio-B6BLaV7u.webp"],["Size Inclusive XS–3XL","Inclusive size and fit representations","/studio/assets/model-selection-Bw5N1qA9.webp"],["Duo Campaign","Coordinated two-model campaign stories","/studio/assets/fashion-campaigns-ClsFp2fc.webp"],["Street Style Candid","Natural street-style campaign concepts","/studio/assets/social-content-C0TJZvLX.webp"],["Luxury Boutique Interior","Premium retail environments","/studio/assets/editorial-studio-DHISP2vi.webp"],["AI Stylist","Complete styling directions around a garment","/studio/assets/outfit-preview-Bl5XfNNo.webp"],["Ad Campaign Generator","Advertising concepts and creative variants","/studio/assets/fashion-campaigns-ClsFp2fc.webp"],["Before / After Slider","Original and refined image comparisons","/studio/assets/image-enhancer-BZr3d1bH.webp"],["Colorway Generator","Coordinated collection colourways","/studio/assets/fashion-image-DKA2QW18.webp"]
];
function styles(){
if(document.getElementById("ob-luxury-style"))return;
var s=document.createElement("style");s.id="ob-luxury-style";
s.textContent=":root{--ob-gold:#D4AF37;--ob-champagne:#F1D989} [data-ob-loc-section]{margin:28px 0 34px;padding:18px 0;border-top:1px solid #d4af3755;border-bottom:1px solid #d4af3744} [data-ob-loc-section] .ob-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:15px} [data-ob-loc-section] .ob-kicker{font:700 10px Inter,Arial,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#d4af37} [data-ob-loc-section] h2{font:600 clamp(23px,4vw,34px) 'Playfair Display',Georgia,serif;color:#f6f0e5;margin:7px 0} [data-ob-loc-section] .ob-sub{font:12px Inter,Arial,sans-serif;color:#aaa} [data-ob-loc-section] .ob-rail{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 14px;scrollbar-width:thin;scrollbar-color:#8d7130 transparent} [data-ob-loc-section] .ob-card{flex:0 0 min(78vw,280px);overflow:hidden;border:1px solid #d4af3780;border-radius:17px;background:linear-gradient(145deg,#1a1815,#100f10);scroll-snap-align:start;transition:.25s;box-shadow:0 10px 30px #0008} [data-ob-loc-section] .ob-card:hover{transform:translateY(-4px);border-color:#f1d989;box-shadow:0 14px 36px #d4af3725} [data-ob-loc-section] .ob-photo{height:156px;position:relative;overflow:hidden} [data-ob-loc-section] .ob-photo img{width:100%;height:100%;object-fit:cover;transition:transform .6s} [data-ob-loc-section] .ob-card:hover .ob-photo img{transform:scale(1.08)} [data-ob-loc-section] .ob-badge{position:absolute;left:11px;top:11px;border:1px solid #f1d98999;border-radius:30px;background:#080808d9;color:#f1d989;padding:5px 9px;font:700 9px Inter,Arial,sans-serif;letter-spacing:.16em} [data-ob-loc-section] .ob-copy{padding:13px} [data-ob-loc-section] .ob-copy h3{font:600 17px 'Playfair Display',Georgia,serif;color:#f7f1e6;margin:0} [data-ob-loc-section] .ob-copy p{font:11px/1.5 Inter,Arial,sans-serif;color:#aaa;min-height:32px;margin:6px 0 12px} [data-ob-loc-section] .ob-use{display:block;width:100%;padding:11px;border:1px solid #d4af3799;border-radius:9px;background:linear-gradient(110deg,#d4af3720,#7651a825);color:#f1d989;font:700 11px Inter,Arial,sans-serif} .ob-premium-card{overflow:hidden!important;border:1px solid #d4af3744!important;border-radius:18px!important;background:linear-gradient(145deg,#191817,#0e0e10)!important;box-shadow:0 10px 28px #0005!important;transition:transform .25s,border-color .25s!important} .ob-premium-card:hover{transform:translateY(-4px)!important;border-color:#d4af3799!important} .ob-premium-card img{width:100%!important;aspect-ratio:4/3!important;object-fit:cover!important} .ob-roadmap-card{display:flex;flex-direction:column;overflow:hidden;border:1px solid #ffffff20;border-radius:16px;background:#141313;opacity:.86} .ob-roadmap-card img{width:100%;aspect-ratio:4/3;object-fit:cover} .ob-roadmap-card div{padding:12px;display:flex;flex:1;flex-direction:column} .ob-roadmap-card small{font:700 8px Inter,Arial,sans-serif;letter-spacing:.14em;color:#d4af37;text-transform:uppercase} .ob-roadmap-card h3{font:600 16px 'Playfair Display',Georgia,serif;color:#f5efe5;margin:7px 0} .ob-roadmap-card p{font:11px/1.5 Inter,Arial,sans-serif;color:#aaa;min-height:32px;margin:0 0 12px} .ob-roadmap-card button{margin-top:auto;padding:10px;border:1px solid #ffffff20;border-radius:8px;background:#ffffff08;color:#aaa;font:700 10px Inter,Arial,sans-serif}";
document.head.appendChild(s);
var f=document.createElement("link");f.rel="stylesheet";f.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap";document.head.appendChild(f);
}
function heading(){
return Array.prototype.find.call(document.querySelectorAll("h1,h2,h3"),function(e){return (e.textContent||"").trim().toLowerCase()==="explore your creative tools"});
}
function addLocations(){
if(document.querySelector("[data-ob-loc-section]"))return;
var h=heading();if(!h)return;
var sec=document.createElement("section");sec.setAttribute("data-ob-loc-section","true");
var head=document.createElement("div");head.className="ob-head";
var intro=document.createElement("div");intro.innerHTML='<div class="ob-kicker">The world is your set</div><h2>Live location templates</h2><div class="ob-sub">100+ exact locations · real destination photography · ready to personalise</div>';
head.appendChild(intro);sec.appendChild(head);
var rail=document.createElement("div");rail.className="ob-rail";
L.forEach(function(x){
var card=document.createElement("article");card.className="ob-card";
var photo=document.createElement("div");photo.className="ob-photo";
var img=document.createElement("img");img.src=x[5];img.alt=x[1]+" fashion location";img.loading="lazy";photo.appendChild(img);
var badge=document.createElement("span");badge.className="ob-badge";badge.textContent=x[2];photo.appendChild(badge);
var copy=document.createElement("div");copy.className="ob-copy";
var title=document.createElement("h3");title.textContent=x[3];
var where=document.createElement("p");where.textContent=x[4];
var use=document.createElement("button");use.type="button";use.className="ob-use";use.textContent="Use this location ↗";
use.addEventListener("click",function(){
var prompt="Create a photorealistic editorial fashion image using the exact location: "+x[4]+". Preserve the uploaded garment exactly: original colour, silhouette, neckline, straps, seams, print, fabric texture and construction. Do not redesign or recolour the garment. Keep the model and garment naturally integrated into the scene.";
var selected={toolId:"fashion-image",destinationToolId:"fashion-image",id:x[0],name:x[3]+" — Editorial fashion image",category:x[2],prompt:prompt,preview:x[5],exact_location:x[4]};
try{sessionStorage.setItem("obitrend-selected-template",JSON.stringify(selected))}catch(e){}
location.href="/studio/tools/fashion-image?template="+encodeURIComponent(x[0]);
});
copy.append(title,where,use);card.append(photo,copy);rail.appendChild(card);
});
sec.appendChild(rail);
var target=h.closest("section")||h.parentElement;target.parentNode.insertBefore(sec,target);
}
function cardFor(a){var n=a;for(var i=0;i<6&&n&&n.parentElement;i++){if(n.querySelector&&n.querySelector("img"))return n;n=n.parentElement}return a}
function addRoadmap(){
var links=Array.prototype.filter.call(document.querySelectorAll('a[href*="/studio/tools/"]'),function(a){return !!(a.querySelector("img")||(a.parentElement&&a.parentElement.querySelector("img")))});
if(!links.length||document.querySelector("[data-ob-roadmap]"))return;
links.forEach(function(a){cardFor(a).classList.add("ob-premium-card")});
var grid=cardFor(links[0]);
for(var i=0;i<8&&grid&&grid.parentElement;i++){var p=grid.parentElement;if(p.querySelectorAll('a[href*="/studio/tools/"]').length>=Math.min(links.length,6)&&getComputedStyle(p).display==="grid"){grid=p;break}grid=p}
if(!grid||!grid.appendChild)return;
var wrap=document.createElement("div");wrap.setAttribute("data-ob-roadmap","true");wrap.style.display="contents";
SOON.forEach(function(x){var a=document.createElement("article");a.className="ob-roadmap-card";var im=document.createElement("img");im.src=x[2];im.alt=x[0]+" preview";im.loading="lazy";var c=document.createElement("div");var tag=document.createElement("small");tag.textContent="New creative direction · roadmap";var h=document.createElement("h3");h.textContent=x[0];var p=document.createElement("p");p.textContent=x[1];var b=document.createElement("button");b.type="button";b.disabled=true;b.textContent="Coming soon";c.append(tag,h,p,b);a.append(im,c);wrap.appendChild(a)});
grid.appendChild(wrap);
}
function run(){if(!location.pathname.startsWith("/studio")||location.pathname.indexOf("/tools/")>=0)return;styles();addLocations();addRoadmap()}
var obs=new MutationObserver(run);if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});else run();obs.observe(document.documentElement,{childList:true,subtree:true});[300,900,1800,3000].forEach(function(t){setTimeout(run,t)});
})();