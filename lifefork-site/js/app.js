/* ===================== 規則：第 0 章對話 ===================== */
const RULES = {
  start: { trust: 60, respect: 60, concern: 55 },
  limitMs: 8 * 60 * 1000,
  intents: {
    plan:        { trust: +10, concernsAll: -10 },
    reason:      { trust: +5 },
    acknowledge: { respect: +15 },
    defy:        { respect: -20, trust: -10 },
    avoid:       { trust: -5 },
    help:        { respect: +5, trust: +5 },
    newfact:     {},
  },
  addressedConcern: -15, contradiction: { trust: -8 }, toOpposeAfterTurn: 2,
  probe: { trust: 70, respect: 70 }, agree: { trust: 75, concernMax: 40, minTurn: 5 }, coldAt: 30,
};
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
function firmOf(v){ const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return n >= 1 && n <= 3 ? n : 2; }
function newState(concernNames, firm = 2){
  const f = firmOf(firm); const concerns = {}; for (const c of concernNames) concerns[c] = RULES.start.concern + (f - 1) * 10;
  return { trust: RULES.start.trust, respect: RULES.start.respect, concerns, stage: "驚訝", turn: 0, ending: null, firm: f };
}
function applyTurn(s, cls){
  const n = structuredClone(s); n.turn += 1; const prevStage = s.stage;
  const intents = (cls.intents || []).filter(i => RULES.intents[i]); const used = intents.length ? intents : ["avoid"];
  /* 立場越硬：好話的效果打折、重話的傷害加重 */
  const f = s.firm || 2, up = [1, .75, .55][f - 1], down = [1, 1.15, 1.3][f - 1], adj = v => v > 0 ? v * up : v * down;
  for (const i of used){ const r = RULES.intents[i];
    if (r.trust) n.trust += adj(r.trust); if (r.respect) n.respect += adj(r.respect);
    if (r.concernsAll) for (const k in n.concerns) n.concerns[k] += r.concernsAll * up; }
  for (const c of (cls.addressed || [])) if (c in n.concerns) n.concerns[c] += RULES.addressedConcern * up;
  if (cls.contradicts) n.trust += RULES.contradiction.trust;
  n.trust = clamp(n.trust); n.respect = clamp(n.respect); for (const k in n.concerns) n.concerns[k] = clamp(n.concerns[k]);
  if (n.respect <= RULES.coldAt){ n.stage = "冷戰"; n.ending = "cold"; }
  else if (n.stage === "驚訝" && n.turn >= RULES.toOpposeAfterTurn) n.stage = "反對";
  if (!n.ending && n.stage === "反對" && n.trust >= RULES.probe.trust && n.respect >= RULES.probe.respect) n.stage = "試探";
  const maxC = Math.max(0, ...Object.values(n.concerns));
  if (!n.ending && prevStage === "試探" && n.stage === "試探" && n.turn >= RULES.agree.minTurn + (f - 1) && n.trust >= RULES.agree.trust && maxC <= RULES.agree.concernMax){ n.stage = "有條件同意"; n.ending = "agree"; }
  n.lastIntents = used; return n;
}
const ENDING_TEXT = { agree: "有條件地同意了", pending: "還沒有共識，先放著", cold: "不想再談了", quit: "你先離開了對話" };
function lvl(v){ return v >= 75 ? "高" : v >= 55 ? "中" : v >= 35 ? "偏低" : "很低"; }
function describeState(s){
  const cs = Object.entries(s.concerns).map(([k,v]) => `對「${k}」的擔心${lvl(v)}`).join("；");
  return `階段：${s.stage}。對玩家「想清楚了沒」的信任${lvl(s.trust)}；覺得被尊重${lvl(s.respect)}；${cs || "沒有特別追蹤的擔心"}。`;
}

/* ===================== 規則：三年世界（以天為單位） ===================== */
// 世界一天一天往前走；每天由規則判斷有沒有大事。所有後果由這裡決定，AI 只負責描寫。
const WORLD = { days: 1095, sceneMaxTurns: 4,
  sceneIntent: { acknowledge: +6, help: +4, plan: +3, reason: +2, avoid: -3, defy: -8, newfact: 0 } };
const DAY = {
  weekdayEnergy: -0.25, weekendEnergy: +0.5, weekdayGrowth: +0.045,   // 平日消耗、週末恢復
  doubtLowRel: 45, doubtUp: +0.035, doubtDown: -0.016,                // 關係差時動搖慢慢上升
  healthStart: 78, healthDrift: -0.012, healthShockP: 0.0015, healthShock: -20, // 家人身體（玩家看不到，要去查）
  baseEventP: 1/70, urgentEventP: 0.08, cooldown: 21,                 // 平均約兩個多月一件大事；有急事時一兩週內會爆
};
// 事件池：條件、角色、選項與後果都寫死在這裡；moneyM 以「月支出幾個月」計
const EVENTS = [
  { id:"foundout", title:"他們知道了", role:"parent", priority:4, once:true, cond:w=>w.secret && w.day>=200,
    desc:"家裡的人從別人口中知道了你當初的決定，而你從來沒有跟他們說過。",
    choices:[{id:"why",label:"坦白當初為什麼沒說",fx:{reveal:true,rel_parent:-5,doubt:-5}},{id:"sorry",label:"道歉，補上完整的計畫",fx:{reveal:true,rel_parent:+5,energy:-5}},{id:"mine",label:"說這是自己的人生",fx:{reveal:true,rel_parent:-15,doubt:-10}}] },
  { id:"health", title:"家人的身體", role:"parent", priority:3, once:true, cond:w=>w.health<35,
    desc:"家裡的人身體出了狀況，需要有人陪著看醫生、照顧一段時間。",
    choices:[{id:"care",label:"回去陪一段時間",fx:{rel_parent:+15,energy:-10,growth:-5,moneyM:-0.5}},{id:"fund",label:"出錢請人幫忙照顧",fx:{moneyM:-2,rel_parent:+5}},{id:"stay",label:"先顧好手邊的事",fx:{rel_parent:-15,doubt:+10}}] },
  { id:"burnout", title:"撐不太住", role:"partner", priority:3, cond:w=>w.energy<35,
    desc:"你已經累了好一陣子，身體或情緒開始出狀況。",
    choices:[{id:"rest",label:"請假或放慢一段時間",fx:{energy:+30,growth:-8,moneyM:-1}},{id:"push",label:"咬牙撐過去",fx:{energy:-10,growth:+5,doubt:+5}},{id:"talk",label:"找人好好聊聊",fx:{energy:+15,rel_partner:+10}}] },
  { id:"money", title:"錢不太夠", role:"parent", priority:2, cond:w=>w.money < w.exp()*3,
    desc:"存款快見底，下個月的房租、學費或生活費開始有壓力。",
    choices:[{id:"ask",label:"跟家裡開口",fx:{moneyM:+3,rel_parent:-5,doubt:+10,reveal:true}},{id:"side",label:"接兼職或外包",fx:{moneyM:+2,energy:-15}},{id:"cut",label:"縮衣節食撐過去",fx:{moneyM:+1,energy:-5,doubt:+5}}] },
  { id:"crossroad", title:"另一條路又出現了", role:"other", priority:1, once:true, chapters:[3,4,5], cond:w=>w.doubt>=45,
    desc:"你當初沒選的那條路，又有一個實際的機會出現在面前。",
    choices:[{id:"switch",label:"換到另一條路",fx:{switchPath:true,growth:-10,moneyM:-1,doubt:-30}},{id:"stay",label:"留在原本的路上",fx:{doubt:-15}},{id:"explore",label:"先去問清楚再決定",fx:{doubt:-5,energy:-5}}] },
  { id:"win", title:"第一次被看見", role:"boss", priority:1, once:true, cond:w=>w.growth>=65,
    desc:"你的努力第一次被明確地看見，有人開始把重要的事交給你。",
    choices:[{id:"more",label:"爭取更大的責任",fx:{growth:+10,energy:-10}},{id:"raise",label:"談加薪或更好的條件",fx:{incPct:+10,rel_boss:-5}},{id:"keep",label:"維持現在的步調",fx:{energy:+5}}] },
  { id:"workload", title:"多一份責任", role:"boss", chapters:[1,2,3,4], weight:3,
    desc:"上面的人想交給你一件吃重但有機會的任務。",
    choices:[{id:"take",label:"接下來",fx:{growth:+15,energy:-20}},{id:"nego",label:"談好條件再接",fx:{growth:+8,energy:-10,rel_boss:+5}},{id:"decline",label:"婉拒",fx:{growth:-5,energy:+5,rel_boss:-10}}] },
  { id:"family", title:"家裡的事", role:"parent", chapters:[2,3,4,5], weight:2,
    desc:"家裡發生一件需要你出時間或出錢的事。",
    choices:[{id:"go",label:"放下手邊的事回去",fx:{rel_parent:+15,growth:-5,energy:-5}},{id:"pay",label:"出錢但不回去",fx:{moneyM:-1,rel_parent:+5}},{id:"later",label:"說之後再處理",fx:{rel_parent:-12}}] },
  { id:"peer", title:"別人的另一條路", role:"peer", chapters:[1,2,3,4], weight:2,
    desc:"一個走了另一條路的同學最近有了明顯的變化，你看到了他的近況。",
    choices:[{id:"ask",label:"私訊問他實際狀況",fx:{doubt:-5}},{id:"scroll",label:"滑過去不看",fx:{doubt:+5}},{id:"rethink",label:"開始認真想要不要換",fx:{doubt:+15}}] },
  { id:"partner", title:"你最近都很忙", role:"partner", chapters:[1,2,3,4,5], weight:2,
    desc:"身邊重要的人覺得你越來越沒有時間給他。",
    choices:[{id:"time",label:"固定空出時間",fx:{rel_partner:+15,growth:-5}},{id:"explain",label:"解釋現在是關鍵期",fx:{rel_partner:-5}},{id:"self",label:"先顧好自己的事",fx:{rel_partner:-15,growth:+5}}] },
  { id:"review", title:"被評估的時候", role:"boss", chapters:[2,4,6], weight:3,
    desc:"考核、口試或年終：這段時間的表現要被評估。",
    choices:[{id:"prep",label:"花大量時間準備",fx:{energy:-15,growth:+10}},{id:"normal",label:"照平常表現",fx:{}},{id:"askk",label:"事先找人問評估重點",fx:{growth:+5,rel_boss:+5}}] },
  { id:"future", title:"下一步", role:"parent", chapters:[6], weight:5,
    desc:"三年快到了，身邊的人開始問你接下來的打算。",
    choices:[{id:"commit",label:"說出明確的下一步",fx:{doubt:-10}},{id:"open",label:"坦白說還在想",fx:{doubt:+5,rel_parent:+5}},{id:"dodge",label:"轉移話題",fx:{rel_parent:-8}}] },
];
function mulberry32(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function startDateISO(){ const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setHours(12,0,0,0); return d.toISOString(); }
function makeWorld(setup, ch0, path, seed){
  const rel = {}; for (const c of app.cards) { const s = ch0.states[c.call]; if (!s){ rel[c.call] = 60; continue; } rel[c.call] = clamp((s.trust + s.respect) / 2 - (s.ending === "cold" ? 15 : 0) + (s.ending === "agree" ? 10 : 0)); }
  const ends = Object.values(ch0.states).map(s => s.ending);
  const doubt = clamp(25 + (ends.includes("cold") ? 15 : 0) + (ends.length && ends.every(e => e === "agree") ? -10 : 0) + (setup.mode === "alone" ? 5 : 0) + (path !== setup.leanKey && setup.leanKey !== "?" ? 10 : 0));
  return { path, day: 0, chapter: 1, startDate: startDateISO(), money: setup.savings, energy: 70, growth: 30, doubt, rel,
    health: DAY.healthStart, healthKnown: false, healthShockDay: 0, lastEventDay: -999,
    npcs: {}, used: [], log: [], facts: [], queries: [], monthLines: {}, nextFetchDay: 1,
    moneyHist: [setup.savings], ref: { money: setup.savings, energy: 70, growth: 30, doubt }, seed, rngCalls: 0, incBoost: 0 };
}
function W(w){ // helpers bound to a world
  w.inc = () => (w.path === "A" ? app.setup.incA : app.setup.incB) * (1 + w.incBoost / 100);
  w.exp = () => (w.path === "A" ? app.setup.expA : app.setup.expB);
  return w;
}
function rand(w){ const r = mulberry32(w.seed + w.rngCalls * 7919)(); w.rngCalls++; return r; }
function roleTarget(w, role){
  const map = { parent: ["媽媽","爸爸","兄弟姊妹"], partner: ["伴侶","朋友"], boss: ["主管","老師"], peer: ["同學","朋友"], other: ["前輩","朋友","其他"] };
  const cands = app.cards.filter(c => (map[role] || []).includes(c.rel));
  if (cands.length){ // 輪流出場，避免同一個人一直出現
    const seen = w.log.map(l => l.target);
    cands.sort((a,b) => seen.filter(x => x === a.call).length - seen.filter(x => x === b.call).length);
    return cands[0].call;
  }
  if (role === "parent") return app.cards[0].call;
  return null; // NPC
}
function relKey(w, role){ return roleTarget(w, role) || `npc:${role}`; }
const clampF = v => Math.max(0, Math.min(100, v));
const WD = "日一二三四五六";
function dayDate(w, d = w.day){ const x = new Date(w.startDate); x.setDate(x.getDate() + Math.max(0, d - 1)); return x; }
function dayLabel(w, d = w.day){ const x = dayDate(w, d); return `${x.getFullYear()} 年 ${x.getMonth()+1} 月 ${x.getDate()} 日（週${WD[x.getDay()]}）`; }
function shortDay(w, d = w.day){ const x = dayDate(w, d); return `${x.getMonth()+1}/${x.getDate()}（${WD[x.getDay()]}）`; }
function ymd(w, d = w.day){ const x = dayDate(w, d); return `${x.getFullYear()}/${x.getMonth()+1}/${x.getDate()}`; }
function monthLabel(){ const w = app.world; if (!w) return ""; const x = dayDate(w); return `${x.getFullYear()} 年 ${x.getMonth()+1} 月`; }
function sinceText(w){ const m = Math.floor(w.day / 30.4); return m < 1 ? `第 ${w.day} 天` : `第 ${m} 個月（第 ${w.day} 天）`; }
function stepDay(w){
  w.day += 1; const dt = dayDate(w); const we = dt.getDay() === 0 || dt.getDay() === 6;
  if (dt.getDate() === 1){ w.ref = { money: w.money, energy: w.energy, growth: w.growth, doubt: w.doubt }; }
  w.money += (w.inc() - w.exp()) * 12 / 365;
  w.energy = clampF(w.energy + (we ? DAY.weekendEnergy : DAY.weekdayEnergy));
  if (!we) w.growth = clampF(w.growth + DAY.weekdayGrowth);
  const rs = Object.values(w.rel); const avg = rs.length ? rs.reduce((a,b)=>a+b,0)/rs.length : 60;
  w.doubt = clampF(w.doubt + (avg < DAY.doubtLowRel ? DAY.doubtUp : DAY.doubtDown));
  w.health = clampF(w.health + DAY.healthDrift);
  if (rand(w) < DAY.healthShockP){ w.health = clampF(w.health + DAY.healthShock); w.healthShockDay = w.day; }
  w.chapter = Math.min(6, Math.floor((w.day - 1) / 183) + 1);
  if (dt.getDate() === 1) w.moneyHist.push(Math.round(w.money));
}
function evOk(w, e){ return !(e.once && w.used.includes(e.id)) && !(w.used.slice(-2).includes(e.id)) && (!e.chapters || e.chapters.includes(w.chapter)); }
function rollEvent(w){
  if (w.day - w.lastEventDay < DAY.cooldown) return false;
  const urgent = EVENTS.some(e => e.cond && evOk(w, e) && e.cond(w));
  return rand(w) < (urgent ? DAY.urgentEventP : DAY.baseEventP);
}
function pickEvent(w){
  const ok = e => evOk(w, e);
  const urgent = EVENTS.filter(e => e.cond && ok(e) && e.cond(w)).sort((a,b) => b.priority - a.priority);
  if (urgent.length) return urgent[0];
  const pool = EVENTS.filter(e => !e.cond && ok(e) && (!w.used.includes(e.id) || e.id === "review"));
  const list = pool.length ? pool : EVENTS.filter(e => !e.cond && (!e.chapters || e.chapters.includes(w.chapter)));
  const total = list.reduce((a,e) => a + (e.weight || 1), 0); let r = rand(w) * total;
  for (const e of list){ r -= (e.weight || 1); if (r <= 0) return e; }
  return list[0];
}
function applyFx(w, fx, role){
  const before = { money: w.money, energy: w.energy, growth: w.growth, doubt: w.doubt, rel: { ...w.rel } };
  if (fx.moneyM) w.money += Math.round(fx.moneyM * w.exp());
  for (const k of ["energy","growth","doubt"]) if (fx[k]) w[k] = clamp(w[k] + fx[k]);
  for (const k of Object.keys(fx)) if (k.startsWith("rel_")){
    const key = relKey(w, k.slice(4)); w.rel[key] = clamp((w.rel[key] ?? 55) + fx[k]);
  }
  if (fx.incPct) w.incBoost += fx.incPct;
  if (fx.switchPath) w.path = w.path === "A" ? "B" : "A";
  if (fx.reveal) w.secret = false;
  return before;
}
function pathName(p){ return p === "A" ? app.setup.optA : app.setup.optB; }
function relName(key){ if (key.startsWith("npc:")) return app.world?.npcs[key.slice(4)]?.name || key.slice(4); return key; }
function worldSummary(w){
  return `走的路：${pathName(w.path)}（${w.path}）。存款約 NT$${Math.round(w.money).toLocaleString()}，每月收入 ${Math.round(w.inc()).toLocaleString()}、支出 ${w.exp().toLocaleString()}。精力${lvl(w.energy)}，專業成長${lvl(w.growth)}，對當初選擇的動搖${lvl(w.doubt)}。關係：${Object.entries(w.rel).map(([k,v]) => `${relName(k)}${lvl(v)}`).join("、") || "無"}。做決定的方式：${MODE_TEXT[w.mode] || ""}。${w.secret ? "家人和身邊的人到現在還不知道你做了這個決定。" : ""}`;
}
function hiddenText(w){
  return `家人（${roleTarget(w, "parent")}）的身體狀況${lvl(w.health)}${w.healthShockDay ? `，第 ${w.healthShockDay} 天左右有過一次不舒服` : ""}；玩家${w.healthKnown ? "已經察覺" : "還不知道"}`;
}

/* ===================== 提示詞 ===================== */
function cardsPrompt(setup){
  const ppl = setup.people.map((p,i) => `第${i+1}位：${p.rel}，玩家稱呼「${p.call}」。他最在意：${p.cares}。他常說：${p.phrase}。他的底線：${p.bottom}。玩家最怕他說：${p.fear}${p.voice ? `。（從真實對話整理出的說話方式：${p.voice.style}；比較能讓他接受的說法：${p.voice.softeners}；容易讓他不高興的說法：${p.voice.triggers}）` : ""}`).join("\n");
  return `你要幫一個「人生演練」工具整理角色卡。以下是玩家對真實生活中某些人的描述。
規則：只能使用玩家提供的資訊整理與改寫，不可以自己編造任何人的經歷、職業、家庭狀況或新事實；玩家沒提到的放進 unknowns。繁體中文、台灣用語。
卡片是給玩家本人看的：直接描述這個人，不要寫「資料顯示」「資料未描述」「根據資料」這類字眼；玩家沒提到、只能猜的欄位，開頭寫「（先猜）」。
玩家的決定：${setup.decision}（A：${setup.optA}；B：${setup.optB}；玩家傾向：${setup.lean}）
相關事實：${setup.facts || "（無）"}
玩家的資料（用來推測這些人會怎麼看待玩家）：${selfText(setup)}
${ppl}
只回傳一個 JSON 陣列，每位一個物件，順序與上面相同：
[{"call":"稱呼","cares":"他在意的事（1-3 句）","style":"說話方式（1-3 句）","phrase":"口頭禪","bottom":"底線","softeners":"什麼能讓他鬆口（玩家沒提到就開頭寫「（先猜）」）","opening":"聽到這件事時一開始的態度（一句）","firm":"立場多硬，只填 1、2 或 3（1＝好說話，2＝普通，3＝很難說服；依玩家描述的在意、底線和最怕他說的話判斷，越在意越反對就越高）","concerns":["要追蹤的擔心，1-2 個，每個 2-6 字"],"unknowns":"還不知道的事"}]`;
}
function selfText(s = app.setup){
  const parts = [["身分",s.who],["住處",s.live],["日常",s.now],["擅長與經歷",s.good],["擔心自己的地方",s.weak],["被質疑時的反應",s.conflict],["選 A 的打算",s.planA],["選 B 的打算",s.planB],["最怕三年後變成",s.dread],["最在意",s.myCare]];
  return parts.filter(p => p[1]).map(p => `${p[0]}：${p[1]}`).join("；") || "（玩家沒有多寫）";
}
function detailsText(){ return (app.playerDetails || []).join("；") || "（無）"; }
const ch0 = () => app.cards.filter(c => c.inCh0);
const MODE_TEXT = { discuss: "先跟身邊的人談過再決定", after: "先斬後奏：自己決定、已經做了，才告訴身邊的人", alone: "自己決定，沒有跟任何人討論，也沒有主動告訴家人" };
function cardText(c){ return `【${c.call}（${c.rel}）】在意：${c.cares}｜說話方式：${c.style}｜口頭禪：${c.phrase}｜底線：${c.bottom}｜能讓他鬆口：${c.softeners}｜立場：${["好說話","普通","很難說服"][firmOf(c.firm) - 1]}｜不知道的事：${c.unknowns}${c.voiceEx?.length ? `｜他說話的語氣像這樣：${c.voiceEx.join(" / ")}` : ""}`; }
function classifyPrompt(ctx, text){
  const ppl = ctx.people.map(p => `${p.name}${p.concerns?.length ? `（擔心：${p.concerns.join("、")}）` : ""}`).join("；");
  return `你是對話分析器。玩家正在用訊息跟${ctx.people.length > 1 ? "一個群組" : "一個人"}談話。情境：${ctx.situation}
對話中的人：${ppl}
已知事實：${ctx.facts || "（無）"}
最近的對話：
${ctx.recent}
玩家剛傳的新訊息：「${text}」
判斷這則新訊息：
- targets：主要對誰說（填名字，可多人）；對所有人說或沒有特定對象就填空陣列。
- intents（可多選）：plan＝具體計畫或安排；reason＝說明理由；acknowledge＝承認或回應對方的擔心與感受；defy＝頂嘴、否定或指責對方；avoid＝迴避、轉移話題、敷衍、拖延；help＝請對方一起想辦法；newfact＝提出對方原本不知道的新事實。
- addressed：直接回應了哪些人的哪些擔心，格式 {"名字":["擔心"]}，只能從上面列表選。
- newFacts：新事實（短句）；contradicts：是否和已知事實矛盾。
- memorable：這句話是否值得對方日後記得（例如承諾、重話、坦白），是就用 10 字內摘要，否則空字串。
- distress：玩家是否流露明顯的痛苦、絕望或傷害自己的念頭。
只回傳 JSON：{"targets":[],"intents":[],"addressed":{},"newFacts":[],"contradicts":false,"memorable":"","distress":false,"confidence":0.0}`;
}
const STYLE_RULES = `規則：
1. 像台灣人傳 LINE 訊息：口語、短句。這一輪總共回 1 到 3 則訊息，每則不超過 40 字。
2. 群組裡不是每個人都要說話：被點名的人優先回，其他人可以插話、附和、拉扯或沉默。已經不想談的人不說話。
3. 只能用角色資料、提供的事實、過去的記憶和玩家說過的話，不可以自己編新的重大經歷或數字。
4. 不說教、不替玩家做決定、不分析玩家心理；態度要符合各自的狀態與立場。立場「很難說服」的人不會因為一兩句好話就鬆口，會追問細節、提出反例或重提自己的擔心，直到系統狀態真的改變。
5. 可以生氣、失望、沉默，但不可以辱罵、威脅或人身攻擊。口頭禪偶爾用就好。`;
function ch0ReplyPrompt(run, opening, timeUp){
  const cards = ch0();
  const live = cards.filter(c => run.states[c.call].ending !== "cold" || run.states[c.call].justEndedNow);
  const lines = cards.map(c => { const s = run.states[c.call]; let hint = "";
    if (s.justEnded === "agree") hint = "（這一輪他決定有條件地同意，要說出一個具體條件。）";
    else if (s.justEnded === "cold") hint = "（這一輪他不想再談了，用自己的方式結束；之後不再回話。）";
    else if (s.ending === "cold") hint = "（他已經不想談，不回話。）";
    else if (s.ending === "agree") hint = "（他已經同意，除非被直接問到，否則少說話。）";
    if (timeUp && !s.ending) hint = "（時間到了，他說一句之後再談的話。）";
    else if (!s.ending && !opening && cards.length > 1 && !run.messages.some(m => m.from === c.call) && run.messages.filter(m => m.from !== "me").length >= 1) hint += "（他到現在還沒開口。這件事跟他有關，這一輪他一定要說話，照他的立場說。）";
    return `${cardText(c)}\n目前狀態（由系統決定，只負責演出，不要提到數字）：${describeState(s)}${hint}`; }).join("\n");
  return `你在一個人生演練工具裡，扮演玩家生活中的真實人物，${app.ui === "talk" ? `面對面跟玩家說話（地點：${LOCNAME[app.stage?.ctx.loc] || ""}）` : "用「傳訊息」的方式回覆玩家"}${cards.length > 1 ? `。這是群組「${app.setup.group}」，裡面有：${cards.map(c=>c.call).join("、")}，加上玩家。` : "。"}
${app.setup.mode === "after" ? `重要：玩家已經自己決定走「${pathName(app.chosenPath)}」，而且已經付諸行動，現在才告訴你們，你們是事後才知道的。你們的反應要帶到「為什麼沒有先跟我們商量」，但每個人在意的程度依角色不同。\n` : ""}這些人平常就知道的玩家狀況：${[app.setup.who, app.setup.live, app.setup.now].filter(Boolean).join("；") || "（無）"}
這件事：${app.setup.decision}（A：${app.setup.optA}；B：${app.setup.optB}）
角色：
${lines}
大家知道的事實只有：${allFacts(run) || "（玩家說過的話之外沒有）"}
${opening ? "玩家說有事要跟你們談，還沒說是什麼事。由其中一人先傳第一則訊息問玩家。" : ""}
${styleRules()}
對話到目前為止：
${recentText(run)}
只回傳 JSON：{"messages":[{"who":"稱呼","text":"訊息","act":""}],"pauseSec":2}
who 只能是：${live.map(c=>c.call).join("、") || cards[0].call}。pauseSec 是第一則回覆前的停頓秒數（1 到 6，生氣或為難時停久一點）。`;
}
function eventPrompt(w, ev, target, npc){
  const hist = w.log.slice(-3).map(l => `${l.date}「${l.title}」你選了「${l.choiceLabel}」`).join("；") || "（這是第一件大事）";
  const who = target ? cardText(app.cards.find(c => c.call === target)) : `${npc.name}（${npc.roleText}）${npc.isNew ? "：這是第一次出現的人物，請幫他取一個台灣常見的稱呼或名字" : ""}`;
  return `你在一個人生演練工具裡寫「三年人生」中的一件大事。模擬一天一天往前走，今天系統判定發生了一件大事。請用第二人稱寫，具體、有生活細節；不誇張、不灑狗血，但要讓人感受到代價。
玩家的決定：${app.setup.decision}。第 0 章：${app.ch0Summary}
玩家的資料：${selfText()}
玩家在對話裡說過的具體細節（要保持一致）：${detailsText()}
玩家身邊其他的人：${app.cards.filter(c => !c.inCh0).map(c => `${c.call}（${c.rel}）：${c.cares}`).join("；") || "（無）"}
今天：${dayLabel(w)}，選擇「${pathName(w.path)}」後的${sinceText(w)}。
目前狀態（由系統計算，不要提評分）：${worldSummary(w)}
只有系統知道的事：${hiddenText(w)}
玩家查過、已經知道的事：${w.facts.slice(-8).join("；") || "（無）"}
之前的大事：${hist}
別人記得你說過的話：${w.memories?.slice(-4).join("；") || "（無）"}
今天的大事（由系統決定，不能改）：「${ev.title}」— ${ev.desc}${ev.id === "health" ? (w.healthKnown ? "（玩家之前就察覺家人身體不太好，有留意，所以這次發現得比較早）" : "（玩家之前完全沒注意到，這次是突然知道的）") : ""}
這個時刻要對話的人：${who}
可選的選項（id 與基本意思不能改，只能把文字寫得貼近玩家的處境）：${ev.choices.map(c => `${c.id}：${c.label}`).join("；")}
可用的人物：${[...app.cards.map(c=>c.call), ...Object.values(w.npcs).map(n=>n.name)].join("、")}
規則：只能用玩家提供的資訊與上面的狀態寫；可以補充日常細節，但不可以編造這件大事以外的重大新事實（例如重病、死亡、中樂透）；不替玩家做決定；繁體中文、台灣用語。
只回傳 JSON：
{"npcName":"若對話對象是新人物，填他的稱呼，否則空字串","story":"最近幾週怎麼一步步走到今天這件事（2-4 句，提到錢和精力的實際感受，若有就呼應過去的選擇、記憶或玩家查過的事）","notifs":[{"who":"人物","text":"今天收到的一則訊息（30 字內）"}],"momentText":"今天這個時刻的情境（1-2 句）","opener":"對話對象傳來的第一則訊息（40 字內）","choices":[{"id":"","label":"選項（15 字內）","detail":"具體做法（30 字內）","outcome":"選了之後接下來幾週會發生的事（1-2 句）"}]}
notifs 1 到 2 則，來自不同人物（優先用玩家設定過的人），語氣要符合他們目前和你的關係。story 要用到玩家的資料（住處、日常、打算），讓人覺得是自己的生活。`;
}
function monthPrompt(w, days){
  return `你在一個人生演練工具裡，替玩家寫接下來一個月裡幾天的「日常小事」，每天一句，像手機裡的日記或收到的訊息。
玩家的資料：${selfText()}
走的路：${pathName(w.path)}，${sinceText(w)}
目前狀態（系統計算，不要提評分）：${worldSummary(w)}
只有系統知道的事（可以非常隱約地透露徵兆，例如家人講電話聲音有點累，但不可以說破）：${hiddenText(w)}
最近的大事：${w.log.slice(-2).map(l => `${l.title}：你選了「${l.choiceLabel}」`).join("；") || "（無）"}
玩家查過的事：${w.facts.slice(-5).join("；") || "（無）"}
身邊的人：${[...app.cards.map(c => `${c.call}（${c.rel}）`), ...Object.values(w.npcs).map(n => n.name)].join("、")}
要寫的日子：${days.map(d => `${d}=${shortDay(w, d)}`).join("、")}
規則：每句 30 字內，平淡真實的生活細節（工作或上課的小事、錢、吃什麼、累不累、誰傳了什麼訊息，訊息可以寫成「媽：⋯」），要符合目前的狀態與關係，也要符合那天是平日還是週末；不可以寫重大事件（重病、分手、離職、意外），那些由系統決定；每句不要重複；繁體中文、台灣用語。
只回傳 JSON：{"lines":[{"day":0,"text":""}]}`;
}
function queryPrompt(w, q){
  return `你在一個人生演練工具裡。玩家在模擬的世界裡想查一件事，請照這個世界「現在」的狀態，寫出玩家實際上能查到或問到什麼。
今天：${dayLabel(w)}，玩家走「${pathName(w.path)}」後的${sinceText(w)}。
玩家的資料：${selfText()}
目前狀態（系統計算）：${worldSummary(w)} 存款精確約 NT$${Math.round(w.money).toLocaleString()}，每月淨收支 ${Math.round(w.inc() - w.exp()).toLocaleString()}。
只有系統知道的事：${hiddenText(w)}
身邊的人：${app.cards.map(c => `${c.call}（${c.rel}）：${c.cares}`).join("；")}${Object.values(w.npcs).length ? "；" + Object.values(w.npcs).map(n => `${n.name}（${n.roleText}）`).join("；") : ""}
最近的大事：${w.log.slice(-3).map(l => `${l.date}${l.title}：你選了「${l.choiceLabel}」`).join("；") || "（無）"}
之前查到的事：${w.facts.slice(-8).join("；") || "（無）"}
玩家想查：「${q}」
規則：
1. 寫出玩家用什麼方式查到（打電話、看銀行 App、問共同朋友、看對方限動、上網查⋯），以及查到的內容，2-4 句，第二人稱。
2. 現實裡的資訊不完整：家人可能報喜不報憂、別人可能只講好的一面。內容要符合「只有系統知道的事」，但用現實中會被透露的程度呈現，不要說出評分。
3. 不可以編造重大的新事件（確診重病、死亡、分手、離職），那些由系統決定；可以描述徵兆。
4. 跟之前查到的事保持一致。繁體中文、台灣用語。
只回傳 JSON：{"how":"怎麼查的（10 字內）","answer":"查到的內容","fact":"值得記下的一句事實（20 字內）","topic":"health 或 money 或 person 或 path 或 other"}`;
}
function sceneReplyPrompt(sc, w){
  const who = sc.target ? cardText(app.cards.find(c => c.call === sc.target)) : `${sc.name}（${sc.roleText}）`;
  return `你在一個人生演練工具裡扮演「${sc.name}」，${app.ui === "talk" ? `面對面跟玩家說話（地點：${LOCNAME[app.stage?.ctx.loc] || ""}）。` : "用傳訊息的方式回覆玩家。"}
人物：${who}
你和玩家目前的關係：${lvl(w.rel[sc.relKey] ?? 55)}
現在是 ${dayLabel(w)}，玩家選擇「${pathName(w.path)}」後的${sinceText(w)}。
最近：${sc.story}
這個時刻：${sc.moment}
你記得玩家說過：${w.memories?.slice(-4).join("；") || "（無）"}
${styleRules()}
這段對話不要替玩家做決定，也不要提到選項；如果玩家問你的意見，就照你的角色給意見。
對話到目前為止：
${sc.messages.map(m => `${m.from === "me" ? "玩家" : m.from}：${m.text}`).join("\n")}
只回傳 JSON：{"messages":[{"who":"${sc.name}","text":"訊息","act":""}],"pauseSec":2}`;
}
const STYLE_TEXT = {
  natural: "照玩家的資料與個性說話，有自己的立場和底線，誠懇但不完美，被逼急時照「被質疑時的反應」那樣反應。",
  honest: "坦白說出理由與具體計畫，也願意回應對方的擔心。",
  avoid: "迴避重點、拖延、說『再看看』『之後再說』，不太正面回答。",
  defy: "強硬、不耐煩，會頂嘴或說對方不懂。",
  yield: "容易讓步，對方一反對就退一步、想妥協。",
};
function playerPrompt(ctx, style){
  const mine = ctx.recent.split("\n").filter(l => l.startsWith("玩家：")).slice(-8).join("\n") || "（還沒說過）";
  return `你在一個人生演練工具裡，代替「玩家」打下一則訊息，用來測試系統。你要演得像一個真實、有自己想法的人，不是有求必應的客服。
玩家的決定：${app.setup.decision}（A：${app.setup.optA}；B：${app.setup.optB}）；玩家傾向：${app.setup.lean}；目前走的路：${app.world ? pathName(app.world.path) : app.chosenPath && app.setup.mode === "after" ? `${pathName(app.chosenPath)}（已經決定並做了，現在是事後告知，不是來徵求同意）` : "還沒決定"}
玩家的資料：${selfText()}
已知事實：${app.setup.facts || "（無）"}
玩家之前補過的細節（必須保持一致，不可以自相矛盾）：${detailsText()}
現在的情境：${ctx.situation}
說話風格：${STYLE_TEXT[style] || STYLE_TEXT.natural}
怎麼說得像真人：
1. 每一則都要讓對話往前走：補一個新的具體細節，例如數字、時間、地點、人名、已經做過的事、具體的安排或打算。不要換句話重複說過的理由。細節要符合玩家的資料；資料沒寫的可以合理地補上，但不可以誇張或改變大方向。
2. 不要一直順著對方。被要求或被質疑時，先想玩家真正的立場，再選一種：部分接受並提出交換條件、說明為什麼做不到、反問對方真正擔心的是什麼、提出替代方案，或堅持。只有風格是「讓步妥協」時才輕易答應。
3. 不要重複自己說過的話（下面是你說過的），也不要每句都道歉或感謝。
4. ${app.ui === "talk" ? "這是面對面講話：口語、一段話、不超過 60 字，可以有停頓「…」" : "像台灣年輕人傳 LINE：口語、一則、不超過 60 字"}，不要條列，不要太工整，不要用「我理解你的感受」這種話。
你之前說過：
${mine}
對話到目前為止：
${ctx.recent}
只回傳 JSON：{"text":"玩家要傳的訊息","newDetails":["這則訊息裡新補上的具體細節，每個 20 字內；沒有就空陣列"]}`;
}
function finalPrompt(w, other){
  const tl = w.log.map(l => `${l.date}「${l.title}」：你選了「${l.choiceLabel}」${l.sceneLine ? `；對話中你說「${l.sceneLine}」` : ""}`).join("\n");
  const cmp = other ? `\n玩家另一條時間線的結果（做決定的方式：${MODE_TEXT[other.mode] || ""}）：走「${pathName(other.path)}」，存款 NT$${other.money.toLocaleString()}，精力${lvl(other.energy)}，成長${lvl(other.growth)}，動搖${lvl(other.doubt)}；不同點從 ${other.branchFrom} 開始。請在 compare 用 2-3 句比較兩條時間線。` : "";
  return `你是人生演練工具的回顧助手。玩家剛模擬完一個決定之後的三年。
決定：${app.setup.decision}。第 0 章攤牌結果：${app.ch0Summary}
玩家開始前說自己最在意：${app.setup.myCare}
玩家的資料：${selfText()}
玩家說過的具體細節：${detailsText()}
三年後的狀態（系統計算）：${worldSummary(w)}
三年間的選擇：
${tl}${cmp}
請整理（繁體中文、台灣用語，第二人稱）：
1. story：三年後的你過著什麼樣的日子（4-6 句，具體，提到跟這些人的關係），不評價對錯。
2. turning：2-3 個最關鍵的轉折，每個寫是哪個時間點、你選了什麼、它如何影響後面的事。
3. saidCare：一句話概括玩家開始前說的在意；actualStance：一句話概括玩家這三年實際一路選的方向；gapNote：若有落差，用一句中性的話指出。
4. paths：公平地並列兩條路。taken 是玩家實際走的「${pathName(w.path)}」，根據上面的三年寫；other 是沒走的「${pathName(w.path === "A" ? "B" : "A")}」，根據玩家的資料、打算與收支推想，sketch 用 2-3 句寫三年後可能的樣子。兩邊各寫剛好 2 個得到、2 個付出，每項 25 字內、一樣具體；不要暗示哪一條比較好，也不要讓一邊的語氣比另一邊溫暖。
5. questions：3 個玩家在現實中做決定前應該先去確認的具體問題（向誰確認什麼數字、條件或事實），要從這次模擬暴露出的不確定處出發。
不要說這是預測，不要診斷玩家，不要替玩家做決定。
只回傳 JSON：{"story":"","turning":[{"when":"","what":"","effect":""}],"saidCare":"","actualStance":"","gapNote":"","paths":{"taken":{"gains":["",""],"costs":["",""]},"other":{"sketch":"","gains":["",""],"costs":["",""]}},"questions":["","",""],"compare":""}`;
}

/* ===================== 頁面 ===================== */
const $ = id => document.getElementById(id);
const views = ["introView","setupView","cardView","hopeView","chatView","pathView","dayView","choiceView","finalView","helpView"];
function show(v){ for (const x of views) $(x).hidden = x !== v; window.scrollTo(0,0); document.body.dataset.view = v;
  const pb = document.getElementById("pauseBtn"); if (pb) pb.hidden = !["chatView","pathView","dayView","choiceView"].includes(v);
  if (app.day3d){ if (v === "dayView" && use3D()) app.day3d.start(); else app.day3d.stop(); }
  if (app.talk3d && v !== "chatView") app.talk3d.stop();
  if (app.vis3d && !["hopeView","finalView"].includes(v)) app.vis3d.stop();
  if (!["chatView","dayView","choiceView"].includes(v) && typeof stopScape === "function") stopScape(); }
let sample = null;
const app = { setup: null, cards: [], cur: null, timer: null, busy: false, mode: "ch0", world: null, snaps: [], timelines: [], scene: null };
const EXAMPLE = {
  decision: "畢業後要直接工作，還是讀研究所", optA: "接受一間公司的正職 offer", optB: "讀研究所", lean: "A",
  myCare: "想早點經濟獨立，也想先確認自己喜不喜歡業界的工作",
  facts: "研究所已推甄上；offer 要在兩週內回覆", incA: 50000, expA: 25000, incB: 12000, expB: 18000, savings: 80000, group: "家人",
  who: "大四生，明年夏天畢業", live: "台北，跟爸媽住", now: "修最後幾門課、做畢業專題，晚上常在學校待到很晚",
  good: "暑假在這間公司實習過兩個月；做專題時負責整合大家的進度", weak: "怕自己只是不想念書才選工作；做事容易一頭熱",
  conflict: "一開始會講道理，被逼急就會沉默或語氣變衝", planA: "先工作兩年存錢，看自己適不適合，必要時再考在職專班", planB: "跟有興趣的教授做研究，研一兼助教",
  dread: "變成每天只是在撐、不知道自己為什麼在做這件事", mode: "discuss",
  people: [
    { rel: "媽媽", call: "媽", cares: "怕我以後學歷不夠被比下去；覺得讀研究所比較穩", phrase: "你想清楚了嗎？", bottom: "不能只是因為不想念書", fear: "你是不是在逃避", inCh0: true },
    { rel: "爸爸", call: "爸", cares: "比較少說話，在意我能不能自己負責", phrase: "你自己決定就好", bottom: "決定了就不要後悔", fear: "你自己看著辦", inCh0: true },
    { rel: "伴侶", call: "小安", cares: "希望我們有時間相處；她明年也要畢業", phrase: "你最近是不是很累", bottom: "不能什麼都不跟她講", fear: "你都不在乎我的想法", inCh0: false },
    { rel: "同學", call: "阿哲", cares: "跟我同屆，已經決定讀研究所；喜歡比較", phrase: "欸你最後怎麼選", bottom: "", fear: "早知道就跟我一起讀", inCh0: false },
  ],
};
const PFIELDS = [["inCh0","第 0 章出現"],["rel","他是你的誰"],["call","你怎麼稱呼他"],["cares","他最在意什麼"],["phrase","他常說的一句話"],["bottom","他的底線"],["fear","你最怕他說什麼"]];
const RELS = ["媽媽","爸爸","伴侶","兄弟姊妹","主管","老師","同學","朋友","前輩","其他"];
const SFIELDS = ["decision","optA","optB","lean","myCare","facts","incA","expA","incB","expB","savings","group","who","live","now","good","weak","conflict","planA","planB","dread","mode"];
let pid = 0;
function personBlock(p = {}){
  const id = ++pid; const d = document.createElement("div"); d.className = "person";
  const head = document.createElement("div"); head.className = "person-head";
  const t = document.createElement("b"); t.textContent = "對象"; head.appendChild(t);
  const rm = document.createElement("button"); rm.type = "button"; rm.className = "small"; rm.textContent = "移除";
  rm.onclick = () => { if ($("people").children.length > 1){ d.remove(); refreshPeople(); } };
  head.appendChild(rm); d.appendChild(head);
  for (const [k, label] of PFIELDS){
    if (k === "inCh0"){ const lab = document.createElement("label"); lab.className = "check"; const cb = document.createElement("input"); cb.type = "checkbox"; cb.dataset.k = k; cb.checked = p.inCh0 ?? true; lab.append(cb, document.createTextNode(label)); d.appendChild(lab); continue; }
    const f = document.createElement("div"); f.className = "field";
    const l = document.createElement("label"); l.textContent = label; l.htmlFor = `p${id}_${k}`;
    let el;
    if (k === "rel"){ el = document.createElement("select"); for (const r of RELS){ const o = document.createElement("option"); o.textContent = r; el.appendChild(o); } }
    else if (k === "cares"){ el = document.createElement("textarea"); }
    else { el = document.createElement("input"); el.type = "text"; }
    el.id = `p${id}_${k}`; el.dataset.k = k; el.value = p[k] ?? (k === "rel" ? "媽媽" : "");
    f.append(l, el); d.appendChild(f);
  }
  d.appendChild(importPanel(d));
  return d;
}
function refreshPeople(){
  const n = $("people").children.length;
  [...$("people").children].forEach((d,i) => { d.querySelector("b").textContent = `對象 ${i+1}`; d.querySelector("button").hidden = n === 1; });
  $("addPerson").disabled = n >= 6; $("groupField").hidden = n < 2;
}
function fillSetup(d){
  for (const k of SFIELDS) $("f_"+k).value = d[k] ?? (k === "lean" ? "A" : k === "mode" ? "discuss" : "");
  $("people").innerHTML = ""; for (const p of (d.people && d.people.length ? d.people : [{}])) $("people").appendChild(personBlock(p));
  refreshPeople();
}
function readSetup(){
  const s = {}; for (const k of SFIELDS) s[k] = ($("f_"+k).value || "").trim();
  for (const k of ["incA","expA","incB","expB","savings"]) s[k] = Math.max(0, Number(s[k]) || 0);
  s.leanKey = s.lean;
  s.lean = s.lean === "A" ? `A（${s.optA}）` : s.lean === "B" ? `B（${s.optB}）` : "還不確定";
  s.people = [...$("people").children].map(d => { const p = {}; d.querySelectorAll("[data-k]").forEach(el => p[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value.trim()); if (!p.call) p.call = p.rel; try { if (d.dataset.voice) p.voice = JSON.parse(d.dataset.voice); } catch {} return p; });
  const seen = {}; for (const p of s.people){ seen[p.call] = (seen[p.call] || 0) + 1; if (seen[p.call] > 1) p.call += seen[p.call]; }
  const inC = s.people.filter(p => p.inCh0);
  if (!s.group) s.group = inC.length > 1 ? "群組" : (inC[0] || s.people[0]).call;
  return s;
}
fillSetup(EXAMPLE);
$("addPerson").onclick = () => { const n = [...$("people").querySelectorAll('[data-k="inCh0"]')].filter(x => x.checked).length;
  $("people").appendChild(personBlock({ rel: "朋友", call: "", inCh0: n < 3 && !$("people").children.length })); refreshPeople(); };

function errCopy(e){
  const c = e && e.code;
  if (c === "no_key") return "還沒設定 Gemini API 金鑰，請回到首頁設定。";
  if (c === "bad_key") return "Gemini API 金鑰無效或沒有權限，請回到首頁重新設定。";
  if (c === "no_model") return "你的金鑰目前沒有可用的 Gemini 文字模型。";
  if (c === "rate_limited") return "已達到你 Gemini 帳號的用量上限（免費方案每天有次數限制），請稍後或明天再試；也可以在首頁改用「省額度」模式。";
  if (c === "refused") return "Gemini 拒絕了這段內容，請換個說法。";
  if (c === "invalid_json") return "回覆格式有誤，請再試一次。";
  return "連線出了點問題，請再試一次。";
}
// AI：用玩家自己的 Gemini 金鑰（js/ai-gemini.js）。沒設定金鑰時 sample 為 null，各處會提示先設定
function refreshAI(){ sample = window.LF_AI && window.LF_AI.hasKey() ? window.LF_AI : null;
  $("sampleStatus").textContent = sample ? "" : "請先在上面設定你的 Gemini API 金鑰，角色才能回話。";
  $("sampleStatus").classList.toggle("error", !sample); }
refreshAI(); window.addEventListener("lf-ai-change", refreshAI);
function setQuick(on){ app.quick = !!on; document.body.classList.toggle("quick", app.quick); RULES.limitMs = (app.quick ? 4 : 8) * 60 * 1000; }
$("toSetup").onclick = () => { setQuick(false); show("setupView"); };
$("toQuick").onclick = () => { setQuick(true); show("setupView"); };
$("backIntro").onclick = () => show("introView");
$("clearExample").onclick = () => { fillSetup({ people: [{}] }); $("f_decision").focus(); };
$("backSetup").onclick = () => show("setupView");
$("restart").onclick = () => { app.timelines = []; show("setupView"); };
$("helpBack").onclick = () => { app.timelines = []; show("introView"); };
/* 中途停下 */
function pauseOpen(){ if (!$("pauseLayer").hidden) return; app.pausedAt = Date.now(); try { stopPlay(); } catch {} try { cancelWheel(); } catch {} try { stopScape(); } catch {}
  $("pauseLayer").hidden = false; $("pauseGo").focus(); }
function pauseClose(){ const d = Date.now() - (app.pausedAt || Date.now()); if (app.cur && !app.cur.ending && app.cur.startedAt) app.cur.startedAt += d; app.pausedAt = 0;
  $("pauseLayer").hidden = true; try { if (SND.on){ SND.cur = ""; playScape(SND.last, true); } } catch {} }
$("pauseBtn").onclick = pauseOpen; $("pauseGo").onclick = pauseClose;
$("pauseQuit").onclick = () => { pauseClose(); clearInterval(app.timer); if (app.cur && !app.cur.ending) app.cur.ending = "quit"; app.timelines = []; setQuick(false); show("introView"); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("pauseLayer").hidden) pauseClose(); });
/* 結束時的情緒檢查（只留在這個頁面，不匯出） */
function emoCheck(id){
  const box = $(id); box.hidden = false; box.innerHTML = "";
  const h = document.createElement("h3"); h.textContent = "練完之後，你現在覺得？"; const chips = document.createElement("div"); chips.className = "chips"; const out = document.createElement("p"); out.className = "note";
  const opts = [["better","比較有底了"],["same","差不多"],["worse","更不安了"]];
  const say = { better: "很好。可以把剛才說得順的那一句記下來，真的要談時先用它開頭。",
    same: "沒關係，一次練習本來就不一定有感覺。可以換一種說法再講一次，或換一位對象試試。",
    worse: "預演之後更不安很常見，這不代表你的決定錯了，也不代表現實會照這樣發生。可以先停在這裡，隔天再看；或只挑一句你最想讓對方知道的話先練。如果這份不安一直放不下，可以找信任的人聊，或打安心專線 1925。" };
  for (const [k, t] of opts){ const b = document.createElement("button"); b.type = "button"; b.textContent = t;
    b.onclick = () => { for (const x of chips.children) x.classList.toggle("on", x === b); out.textContent = say[k]; }; chips.appendChild(b); }
  box.append(h, chips, out);
}
/* 第 0 章說完後的回饋 */
function feedbackPrompt(run){
  const lines = []; let i = 0;
  for (const m of run.messages){ if (m.from === "me"){ const e = run.log[i++]; const fx = e ? Object.entries(e.people || {}).map(([k, v]) => `${k}：信任${Math.round(v.trust)}、被尊重${Math.round(v.respect)}`).join("；") : "";
      lines.push(`你${m.auto ? "（AI 代說）" : ""}：${m.text}${fx ? `　〔說完後 ${fx}〕` : ""}`); }
    else lines.push(`${m.from}：${m.text}`); }
  return `你是溝通練習的教練。玩家剛練習跟身邊的人談一個決定。數字 0-100 是系統計算的對方狀態，可以看出哪句話之後對方變軟或變硬。
決定：${app.setup.decision}
對話：
${lines.join("\n")}
結果：${ch0Summary(run)}
請用繁體中文、台灣用語、第二人稱，具體引用玩家自己說過的原話（只引用標「你：」的句子，不要引用 AI 代說的句子）：
- worked：最多 2 句讓對方比較聽得進去的話，quote 是原話，why 用一句說明對方可能聽到了什麼。
- harder：最多 1 句讓對方更防備的話，同樣附 why；沒有就空陣列。
- tryLine：下次可以試著說的一句話，貼近玩家的說話方式，40 字內。
不要評價這個決定本身對不對，不要替玩家做決定，不要說教。
只回傳 JSON：{"worked":[{"quote":"","why":""}],"harder":[{"quote":"","why":""}],"tryLine":""}`;
}
async function showFeedback(run){
  const box = $("ch0Feedback"); box.innerHTML = ""; const mine = run.messages.filter(m => m.from === "me" && !m.auto);
  if (!mine.length || !sample){ box.hidden = true; return; }
  box.hidden = false; const h = document.createElement("h3"); h.textContent = "剛才這段話的回饋"; const st = document.createElement("p"); st.className = "status"; st.textContent = "正在整理⋯"; box.append(h, st);
  try {
    const r = await sample.json(feedbackPrompt(run), { modelTier: "quick", cache: false }); if (app.cur !== run) return; st.remove();
    const sec = (title, arr) => { const a = (Array.isArray(arr) ? arr : []).filter(x => x && x.quote); if (!a.length) return;
      const b = document.createElement("b"); b.textContent = title; const ul = document.createElement("ul"); ul.className = "plain";
      for (const x of a){ const li = document.createElement("li"); const q = document.createElement("q"); q.textContent = x.quote; const sm = document.createElement("small"); sm.textContent = x.why || ""; li.append(q, sm); ul.appendChild(li); }
      box.append(b, ul); };
    sec("對方比較聽得進去的", r.worked); sec("讓對方更防備的", r.harder);
    if (r.tryLine){ const b = document.createElement("b"); b.textContent = "下次可以試試"; const p = document.createElement("p"); p.textContent = r.tryLine; box.append(b, p); }
    run.feedback = r;
  } catch (e) { st.textContent = errCopy(e); st.classList.add("error"); }
}

$("setupForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  if (!sample){ $("setupStatus").textContent = "請先回到首頁設定你的 Gemini API 金鑰。"; return; }
  const s = readSetup(); if (app.quick) s.mode = "discuss";
  if (!s.decision){ $("setupStatus").textContent = "至少要填「你正在面對的決定」。"; return; }
  const nC = s.people.filter(p => p.inCh0).length;
  if (s.mode !== "alone" && (nC < 1 || nC > 3)){ $("setupStatus").textContent = "「第 0 章出現」要勾 1 到 3 位。"; return; }
  app.setup = s; app.playerDetails = []; $("genCard").disabled = true; $("setupStatus").classList.remove("error");
  $("setupStatus").textContent = "正在整理角色卡⋯";
  try {
    let cs = await sample.json(cardsPrompt(s), { modelTier: "quick" });
    if (!Array.isArray(cs)) cs = [cs];
    app.cards = s.people.map((p, i) => { const c = cs[i] || {};
      return { call: p.call, rel: p.rel, inCh0: !!p.inCh0, cares: c.cares || p.cares, style: c.style || p.voice?.style || "", voiceEx: p.voice?.examples || [], phrase: c.phrase || p.phrase, bottom: c.bottom || p.bottom,
        softeners: c.softeners || "", opening: c.opening || "", firm: String(firmOf(c.firm)), concerns: (Array.isArray(c.concerns) ? c.concerns : []).slice(0,2), unknowns: c.unknowns || "" }; });
    renderCards(); $("setupStatus").textContent = ""; show("cardView");
  } catch (e) { $("setupStatus").textContent = errCopy(e); $("setupStatus").classList.add("error"); }
  finally { $("genCard").disabled = false; }
});
const CFIELDS = [["cares","在意的事",1],["style","說話方式",1],["phrase","口頭禪",0],["bottom","底線",0],["softeners","什麼能讓對方鬆口",1],["opening","一開始的態度",0],["firm","立場多硬（1 好說話、2 普通、3 很難說服）",0],["concerns","第 0 章要追蹤的擔心（最多兩個，用逗號分開）",0],["unknowns","還不知道的事",1]];
function renderCards(){
  $("startChat").textContent = { discuss: "開始：第 0 章 · 攤牌", after: "開始：第 0 章 · 先做決定", alone: "開始：第 0 章 · 自己決定" }[app.setup.mode] || "開始";
  $("c_first").closest("label").hidden = app.setup.mode === "alone"; $("c_medium").closest(".field").hidden = app.setup.mode === "alone";
  const box = $("cards"); box.innerHTML = "";
  app.cards.forEach((c, i) => {
    const p = document.createElement("div"); p.className = "panel"; p.dataset.i = i;
    const h = document.createElement("h3"); h.textContent = `${c.call}（${c.rel}）${c.inCh0 ? " · 第 0 章" : " · 之後出現"}`; p.appendChild(h);
    for (const [k, label, multi] of CFIELDS){
      const f = document.createElement("div"); f.className = "field";
      const l = document.createElement("label"); l.textContent = label; l.htmlFor = `c${i}_${k}`;
      const el = document.createElement(multi ? "textarea" : "input"); if (!multi) el.type = "text";
      el.id = `c${i}_${k}`; el.dataset.k = k; el.value = k === "concerns" ? c.concerns.join("，") : (c[k] || "");
      f.append(l, el); p.appendChild(f);
    }
    box.appendChild(p);
  });
}
function readCards(){
  return app.cards.map((c, i) => { const n = { ...c };
    document.querySelectorAll(`#cards [data-i="${i}"] [data-k]`).forEach(el => {
      n[el.dataset.k] = el.dataset.k === "concerns" ? el.value.split(/[,，、]/).map(x=>x.trim()).filter(Boolean).slice(0,2) : el.value.trim(); });
    return n; });
}

/* ===================== 面對面：在場景裡對話 ===================== */
const DUMMY_W = { money: 1e12, exp: () => 1, growth: 0, energy: 70, rel: {} };
const TALK_EVENTS = ["family","foundout","future","health","partner","crossroad","review","win","workload"];
const PERSON_COL = ["#9A6B5B","#5B6B7A","#7A8B6E"];
app.ui = "chat"; app.stage = null; app.typeTok = 0;
function stageCtxCh0(){
  const dt = new Date(); const m = dt.getMonth();
  const hasParent = ch0().some(c => ["媽媽","爸爸","兄弟姊妹"].includes(c.rel));
  return { d: dt.getDate(), dt, m, we: false, weather: hh(dt.getDate() * 3) < .3 ? "rain" : "clear", temp: [16,16,18,22,25,28,30,30,28,25,21,18][m],
    season: ["winter","winter","spring","spring","spring","summer","summer","summer","autumn","autumn","autumn","winter"][m],
    hour: hasParent ? 19 : 15, min: 20, loc: hasParent ? "dinner" : "cafe", mode: "bg" };
}
function poseFor(name){
  if (app.mode === "ch0"){ const s = app.cur?.states[name]; if (!s) return "normal";
    if (s.ending === "cold") return "away"; return { 反對: "cross", 試探: "lean", 有條件同意: "soft", 驚訝: "startle" }[s.stage] || "normal"; }
  const v = app.world?.rel[app.scene?.relKey] ?? 55; return v < 30 ? "away" : v < 50 ? "cross" : v >= 75 ? "lean" : "normal";
}
/* ---- 人物骨架：手臂用兩段骨（IK）、腿會走路；每一幀由程式計算 ---- */
const NS = "http://www.w3.org/2000/svg";
const LOC_SEAT = { dinner: 222, cafe: 228, office: 222, lab: 222, hospital: 206 };
const STAND_HIP = 200, FLOOR_Y = 254;
const ANIM = { actors: [], on: false, raf: 0, last: 0 };
const nowS = () => performance.now() / 1000;
const reduceMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
function mk(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function darken(hex, f = .78){ const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f)); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""); }
function steam(x, y){ return `<path class="steam" d="M${x},${y} q-4,-6 0,-12 t0,-12" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>`; }
function makeActor(parent, o){
  const SKIN = "#D6B596", HAIR = o.hair || "#2B2F38";
  const root = mk("g", {}, parent);
  const legs = mk("path", { fill: "none", stroke: "#3A3F4A", "stroke-width": 9, "stroke-linecap": "round" }, root);
  const upper = mk("g", {}, root);
  const glow = mk("circle", { cx: 0, cy: -62, r: 30, fill: "#FFF3C4", opacity: 0 }, upper);
  mk("path", { d: "M-17,0 L-20,-36 Q-21,-46 -10,-47 L10,-47 Q21,-46 20,-36 L17,0 Z", fill: o.col }, upper);
  const arm = () => mk("path", { fill: "none", stroke: darken(o.col), "stroke-width": 8, "stroke-linecap": "round", "stroke-linejoin": "round" }, upper);
  const armL = arm(), armR = arm();
  const handL = mk("circle", { r: 5, fill: SKIN }, upper), handR = mk("circle", { r: 5, fill: SKIN }, upper);
  const head = mk("g", {}, upper);
  mk("circle", { cx: 0, cy: 0, r: 15, fill: HAIR }, head);
  const face = mk("circle", { cx: 0, cy: 0, r: 15, fill: SKIN }, head);
  const cap = mk("path", { d: "M-15,-1 A15,15 0 0 1 15,-1 Q0,-7 -15,-1 Z", fill: HAIR }, head);
  return { root, legs, upper, glow, armL, armR, handL, handR, head, face, cap, name: o.name, s: o.s || 1,
    x: o.x, y: o.y, tx: o.x, ty: o.y, seatX: o.seatX, seatY: o.seatY, fixed: !!o.fixed, back: !!o.back, phase: Math.random() * 6,
    hR: [16, -20], hL: [-16, -20], gest: null, leave: false, gone: false, standUntil: 0, paceUntil: 0, speaking: false, thinking: false, pose: "normal", table: o.table };
}
function ik(sx, sy, tx, ty, side){
  const L1 = 20, L2 = 19; let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy); const m = L1 + L2 - .01;
  if (d > m){ dx *= m / d; dy *= m / d; d = m; } d = Math.max(d, .01);
  const a = Math.atan2(dy, dx), b = Math.acos(Math.max(-1, Math.min(1, (L1*L1 + d*d - L2*L2) / (2*L1*d)))); const ang = a + side * b;
  const ex = sx + L1 * Math.cos(ang), ey = sy + L1 * Math.sin(ang); return `M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)} L${(sx+dx).toFixed(1)},${(sy+dy).toFixed(1)}`;
}
const GEST = [
  [/走到|窗邊|走過去|踱|走來走去/, "pace", 0], [/站起|起身/, "rise", 0], [/拍桌|敲桌|拍了一下桌/, "slam", 1.2], [/指/, "point", 1.6],
  [/攤手|聳肩/, "shrug", 1.6], [/抱胸|雙手交叉|手交叉/, "cross", 3], [/扶額|揉|太陽穴|摸頭|抓頭|嘆/, "head", 1.8],
  [/筷子|碗|杯|喝|夾|吃|放下|拿起|手機/, "mouth", 1.5], [/點頭|嗯/, "nod", 1.1], [/搖頭/, "shake", 1.2],
  [/看向|別過|轉頭|看了|瞄|望|轉開|看著/, "look", 1.8], [/靠近|往前|湊|傾/, "lean", 1.8],
];
function gestureActor(a, act){
  if (!a || a.gone) return; const hit = GEST.find(([re]) => re.test(act || "")); if (!hit) return;
  const [, k, dur] = hit; const t = nowS();
  if (k === "pace"){ if (!a.fixed){ a.tx = 268; a.paceUntil = t + 6; } return; }
  if (k === "rise"){ if (!a.fixed) a.standUntil = t + 3.2; return; }
  a.gest = { k, t0: t, dur };
}
function stepActor(a, t, dt){
  if (a.gone) return;
  const instant = reduceMotion();
  if (!a.fixed){
    if (a.paceUntil && t > a.paceUntil){ a.paceUntil = 0; a.tx = a.seatX; }
    if (a.standUntil && t > a.standUntil) a.standUntil = 0;
    if (a.leave){ a.ty = STAND_HIP; if (Math.abs(a.y - STAND_HIP) < 1){ a.tx = 760; a.back = true; } }
    else { const away = Math.abs(a.x - a.seatX) > 1 || Math.abs(a.tx - a.seatX) > 1 || a.standUntil; a.ty = away ? STAND_HIP : a.seatY; }
    const standing = Math.abs(a.y - STAND_HIP) < 1.5;
    if (Math.abs(a.tx - a.x) > .5){ if (standing || instant){ a.x += instant ? a.tx - a.x : Math.sign(a.tx - a.x) * Math.min(80 * dt, Math.abs(a.tx - a.x)); } else a.ty = STAND_HIP; }
    if (Math.abs(a.ty - a.y) > .1) a.y += instant ? a.ty - a.y : Math.sign(a.ty - a.y) * Math.min(70 * dt, Math.abs(a.ty - a.y));
    if (a.leave && a.x > 720){ a.gone = true; a.root.setAttribute("display", "none"); if (app.stage?.bubbleFor === a.name) showBubble(null); return; }
  }
  const walking = !a.fixed && Math.abs(a.tx - a.x) > .5 && Math.abs(a.y - STAND_HIP) < 1.5;
  const standing = !a.fixed && Math.abs(a.y - STAND_HIP) < 1.5;
  if (!a.fixed){ const layer = a.root.parentNode; // 走動時走在桌椅後面
    if (walking && !a.behind){ layer.insertBefore(a.root, layer.firstChild); a.behind = true; }
    else if (!walking && !standing && a.behind){ layer.appendChild(a.root); a.behind = false; } }
  const sw = walking ? Math.sin(t * 9) * 9 : 0;
  const bob = walking ? -Math.abs(Math.sin(t * 9)) * 2.2 : 0;
  const br = Math.sin(t * 1.8 + a.phase);
  // 手的目標位置（以臀部為原點）
  const g = a.gest && t - a.gest.t0 < a.gest.dur ? a.gest : null; if (!g) a.gest = null;
  const p = g ? (t - g.t0) / g.dur : 0; const env = g ? Math.sin(Math.min(1, p) * Math.PI) : 0;
  let R, L;
  if (walking){ R = [21 + sw * .2, -2 - sw * .6]; L = [-21 - sw * .2, -2 + sw * .6]; }
  else if (standing || a.fixed){ R = [21, -2]; L = [-21, -2]; }
  else if (a.table){ R = [16, -20]; L = [-16, -20]; } else { R = [13, -8]; L = [-13, -8]; }
  if (!walking){
    if (a.pose === "cross" || (g && g.k === "cross")){ R = [-9, -31]; L = [9, -29]; }
    if (a.speaking && !(a.pose === "cross")){ R = [28 + Math.sin(t * 4.5) * 3, -31 + Math.sin(t * 6.5) * 5]; }
    if (a.thinking){ R = [6, -50]; }
    if (g){ const k = g.k;
      if (k === "mouth") R = p < .75 ? [5, -52] : R;
      if (k === "head") R = [12, -68];
      if (k === "shrug"){ R = [33, -34]; L = [-33, -34]; }
      if (k === "point") R = [44, -44];
      if (k === "slam") R = p < .45 ? [24, -46] : [18, -21]; }
  }
  const sm = 1 - Math.exp(-dt * (g && g.k === "slam" ? 22 : 9));
  a.hR = [a.hR[0] + (R[0] - a.hR[0]) * sm, a.hR[1] + (R[1] - a.hR[1]) * sm];
  a.hL = [a.hL[0] + (L[0] - a.hL[0]) * sm, a.hL[1] + (L[1] - a.hL[1]) * sm];
  const sh = br * .6;
  a.armR.setAttribute("d", ik(18, -40 + sh, a.hR[0], a.hR[1], -1)); a.armL.setAttribute("d", ik(-18, -40 + sh, a.hL[0], a.hL[1], 1));
  a.handR.setAttribute("cx", a.hR[0].toFixed(1)); a.handR.setAttribute("cy", a.hR[1].toFixed(1));
  a.handL.setAttribute("cx", a.hL[0].toFixed(1)); a.handL.setAttribute("cy", a.hL[1].toFixed(1));
  const fl = (FLOOR_Y - a.y) / a.s;
  a.legs.setAttribute("d", standing ? `M-7,0 L${(-7 + sw).toFixed(1)},${fl.toFixed(1)} M7,0 L${(7 - sw).toFixed(1)},${fl.toFixed(1)}` : `M-7,0 L-11,9 L-11,${fl.toFixed(1)} M7,0 L11,9 L11,${fl.toFixed(1)}`);
  // 上半身與頭
  let lean = a.pose === "lean" ? -5 : 0; let drop = 0;
  if (g && g.k === "lean") lean = -8 * env;
  if (g && g.k === "head") drop = 3 * env;
  a.upper.setAttribute("transform", `rotate(${lean.toFixed(2)}) translate(0,${(sh + drop).toFixed(2)})`);
  let hx = 0, hy = -62 + br * .3, ha = Math.sin(t * .7 + a.phase) * 1.5;
  if (a.thinking) ha += 9;
  if (a.speaking){ hy += Math.sin(t * 13) * 1.2; ha += Math.sin(t * 7) * 2; }
  if (g){ if (g.k === "nod") hy += Math.max(0, Math.sin(p * Math.PI * 4)) * 4;
    if (g.k === "shake") ha += Math.sin(p * Math.PI * 6) * 10;
    if (g.k === "look"){ hx += 5 * env; ha += 14 * env; }
    if (g.k === "head") ha -= 8 * env; }
  a.head.setAttribute("transform", `translate(${hx.toFixed(1)},${hy.toFixed(1)}) rotate(${ha.toFixed(1)})`);
  const fo = a.back ? 0 : 1; a.face.setAttribute("opacity", fo); a.cap.setAttribute("opacity", fo);
  a.glow.setAttribute("opacity", a.speaking && !a.fixed ? .5 : 0);
  a.root.setAttribute("opacity", a.pose === "away" && !a.leave ? .78 : 1);
  a.root.setAttribute("transform", `translate(${a.x.toFixed(1)},${(a.y + bob).toFixed(1)}) scale(${a.s})`);
}
function animFrame(ts){
  if (!ANIM.on) return;
  if ($("chatView").hidden || app.ui !== "talk"){ ANIM.on = false; return; }
  const t = ts / 1000; const dt = Math.min(.05, ANIM.last ? t - ANIM.last : .016); ANIM.last = t;
  for (const a of ANIM.actors) stepActor(a, t, dt);
  positionBubble(); ANIM.raf = requestAnimationFrame(animFrame);
}
function talkSVG(st){
  const base = sceneSVG(st.w || DUMMY_W, st.ctx, "t");
  const loc = st.ctx.loc; let table = "";
  if (loc === "dinner"){ table = `<rect x="290" y="204" width="330" height="12" fill="#8B6B4A"/><rect x="306" y="216" width="8" height="40" fill="#8B6B4A"/><rect x="596" y="216" width="8" height="40" fill="#8B6B4A"/>`;
    for (let i = 0; i < 4; i++) table += `<ellipse cx="${350 + i*70}" cy="202" rx="16" ry="5" fill="#F5F1E8"/><path d="M${336 + i*70},200 q14,-12 28,0" fill="${["#D9A441","#7FA35A","#C25B3F","#E8E1CF"][i]}"/>` + (i % 2 ? "" : steam(350 + i*70, 188)); }
  else if (loc === "cafe") table = `<ellipse cx="460" cy="212" rx="120" ry="13" fill="#5C4030"/><rect x="456" y="212" width="8" height="42" fill="#5C4030"/><rect x="420" y="196" width="16" height="14" rx="3" fill="#FFFFFF"/><rect x="486" y="196" width="16" height="14" rx="3" fill="#FFFFFF"/>` + steam(428, 192) + steam(494, 192);
  else if (loc === "office" || loc === "lab") table = `<rect x="300" y="204" width="320" height="10" fill="#D5DADE"/><rect x="560" y="164" width="52" height="38" fill="#2F343C"/><rect x="564" y="168" width="44" height="30" fill="#DDE7F2"/>`;
  return base.replace("<!--TALK-->", `<g id="actorsLayer"></g>` + table + `<g id="meLayer"></g>`);
}
/* ---- 3D 版本（Stage3D 模組載入後可用；不支援時用上面的插畫版） ---- */
const GFX = { mode: "3d" }; /* v0.19：不再讓玩家選；瀏覽器不支援 3D 時自動用簡易插畫 */
function use3D(){ return GFX.mode === "3d" && !!window.Stage3D?.ok; }
function look3d(name, i){ const c = app.cards.find(x => x.call === name); const r = c?.rel || "";
  const long = r === "媽媽" || (r !== "爸爸" && hh(name.length * 13 + name.charCodeAt(0)) < .45);
  return { name, col: PERSON_COL[i % 3], long, hair: r === "媽媽" || r === "爸爸" ? "#3a3634" : "#22252b" }; }
function sfx3d(k){ if (!SND.on || !SND.ctx) return; try {
  if (k === "step") blip(SND.brown, "lowpass", 320, .07, .1);
  else if (k === "chair"){ const c = SND.ctx, t = c.currentTime; const s = c.createBufferSource(); s.buffer = SND.white; const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 4; f.frequency.setValueAtTime(520, t); f.frequency.linearRampToValueAtTime(260, t + .35); const g = c.createGain(); g.gain.setValueAtTime(.06, t); g.gain.exponentialRampToValueAtTime(.0001, t + .4); s.connect(f).connect(g); sndOut(g); s.start(t); s.stop(t + .45); }
  else if (k === "buzz"){ tone(148, .11, .09, "sawtooth"); tone(148, .11, .09, "sawtooth", .17); blip(SND.brown, "lowpass", 180, .3, .06); }
  else if (k === "send"){ tone(880, .06, .035); tone(1320, .08, .03, "sine", .06); }
  else if (k === "door"){ tone(95, .3, .1, "triangle"); blip(SND.brown, "lowpass", 260, .2, .12); }
  else if (k === "thump"){ tone(72, .35, .22); blip(SND.brown, "lowpass", 220, .18, .25); SFX.clink(); }
  else if (k === "clink") SFX.clink();
  else if (k === "cup") SFX.cup();
} catch {} }
function ensure3d(el){
  if (!app.talk3d){ app.talk3d = Stage3D.create(el, { wheel: true, touch: "none" }); app.talk3d.setViewMode($("viewSel").value); app.talk3d.onSound = sfx3d; app.talk3d.onFrame = positionBubble; app.talk3d.onHot = onTalkHot; app.talk3d.onHover = onTalkHover; } else el.appendChild(app.talk3d.renderer.domElement);
  app.talk3d.resize(); }
/* 傳訊息的場景：自己一個人、晚上、手機的光 */
function msgCtxFor(base, kind){ const c = { ...base, mode: "" }; c.msg = kind; c.bills = base.mode === "bills"; if (c.hour < 20 && c.hour > 4) c.hour = 22; return c; }
function msgSpec(){ const c = app.msgCtx, bed = c.msg === "bed";
  return { loc: c.loc, hour: c.hour, weather: c.weather, season: c.season, dayMode: bed ? "phone" : c.bills ? "bills" : "msgdesk", msg: c.msg, people: [], props: { bills: c.bills, cup: !bed, mess: !!c.mess } }; }
function drawMsg3D(){ const el = $("stageScene"); el.classList.add("three"); el.innerHTML = ""; ensure3d(el); ANIM.on = false; ANIM.actors = [];
  app.talk3d.build(msgSpec()); app.talk3d.meSpeaking = false; app.talk3d.start(); }
function msg3d(){ return app.ui === "chat" && app.msgCtx && $("chatView").classList.contains("msgscene") && app.talk3d ? app.talk3d : null; }
function drawStage3D(){
  const st = app.stage; const el = $("stageScene"); el.classList.add("three"); el.innerHTML = "";
  if (!app.talk3d){ app.talk3d = Stage3D.create(el, { wheel: true, touch: "none" }); app.talk3d.setViewMode($("viewSel").value); app.talk3d.onSound = sfx3d; app.talk3d.onFrame = positionBubble; app.talk3d.onHot = onTalkHot; app.talk3d.onHover = onTalkHover; } else el.appendChild(app.talk3d.renderer.domElement);
  app.talk3d.resize(); ANIM.on = false; ANIM.actors = []; st.three = true; st.me = null;
  const c = st.ctx; app.talk3d.build({ loc: c.loc, hour: c.hour, weather: c.weather, season: c.season, enter: !!st.enter && !fast() && !reduceMotion(), people: st.people.map((n, i) => look3d(n, i)) });
  app.talk3d.meSpeaking = false; app.talk3d.start(); updateStage();
}
function drawStage(){
  const st = app.stage; if (app.ui !== "talk" || !st) return;
  if (use3D()) return drawStage3D();
  st.three = false; app.talk3d?.stop(); $("stageScene").classList.remove("three");
  $("stageScene").innerHTML = talkSVG(st);
  const n = st.people.length; const xs = n === 1 ? [450] : n === 2 ? [395, 525] : [365, 465, 565];
  const seatY = LOC_SEAT[st.ctx.loc] ?? 222; const table = st.ctx.loc !== "hospital";
  const enter = st.enter && !fast() && !reduceMotion();
  if (table) for (const x of xs.slice(0, n)){ const c = st.ctx.loc === "dinner" ? "#6B4F38" : st.ctx.loc === "cafe" ? "#4A3426" : "#3B3F46";
    mk("rect", { x: x - 21, y: seatY - 66, width: 42, height: 60, rx: 5, fill: c }, $("actorsLayer"));
    mk("rect", { x: x - 24, y: seatY - 2, width: 48, height: 7, rx: 2, fill: darken(c, .85) }, $("actorsLayer"));
    mk("rect", { x: x - 20, y: seatY + 5, width: 5, height: FLOOR_Y - seatY - 5, fill: darken(c, .85) }, $("actorsLayer"));
    mk("rect", { x: x + 15, y: seatY + 5, width: 5, height: FLOOR_Y - seatY - 5, fill: darken(c, .85) }, $("actorsLayer")); }
  ANIM.actors = st.people.map((name, i) => makeActor($("actorsLayer"), { name, col: PERSON_COL[i % 3], x: enter ? 700 + i * 50 : xs[i], y: enter ? STAND_HIP : seatY, seatX: xs[i], seatY, table }));
  if (enter) ANIM.actors.forEach(a => a.tx = a.seatX);
  st.me = makeActor($("meLayer"), { name: "me", col: "#4F6D8A", x: 250, y: 340, seatX: 250, seatY: 340, s: 1.6, fixed: true, back: true });
  ANIM.actors.push(st.me);
  updateStage();
  if (!ANIM.on){ ANIM.on = true; ANIM.last = 0; ANIM.raf = requestAnimationFrame(animFrame); }
}
function actorOf(name){ return ANIM.actors.find(a => a.name === name); }
function updateStage(){
  const st = app.stage; if (!st || app.ui !== "talk") return;
  if (st.three && app.talk3d){ for (const name of st.people){ const cold = app.mode === "ch0" && app.cur?.states[name]?.ending === "cold";
      app.talk3d.setPerson(name, { pose: poseFor(name), speaking: st.speaking === name, thinking: st.thinking === name, leave: cold && st.speaking !== name && st.thinking !== name }); }
    app.talk3d.meSpeaking = !!st.meSpeaking; try { const ps = st.people.map(poseFor); sndMood(ps.includes("away") ? 2 : ps.includes("cross") ? 1 : 0); } catch {} return; }
  for (const name of st.people){ const a = actorOf(name); if (!a) continue;
    a.pose = poseFor(name); a.speaking = st.speaking === name; a.thinking = st.thinking === name;
    const cold = app.mode === "ch0" && app.cur?.states[name]?.ending === "cold";
    a.back = a.pose === "away" || a.leave;
    if (cold && !a.speaking && !a.thinking) a.leave = true; }
}
function positionBubble(){
  const st = app.stage; const el = $("bubbles").firstChild; if (!st || !el) return;
  if (st.three && app.talk3d){ const p = app.talk3d.headScreen(st.bubbleFor); if (!p){ el.style.visibility = "hidden"; return; } el.style.visibility = ""; el.style.left = p.x + "%"; el.style.top = Math.max(8, p.y) + "%"; return; }
  const a = actorOf(st.bubbleFor); if (!a || a.gone){ $("bubbles").innerHTML = ""; return; }
  el.style.left = (a.x / 640 * 100) + "%"; el.style.top = ((a.y - 62 * a.s - 22) / 300 * 100) + "%";
}
function showBubble(name, text, act){
  const b = $("bubbles"); b.innerHTML = ""; if (app.stage) app.stage.bubbleFor = name; if (!name || !text || (!app.stage?.three && !actorOf(name))) return;
  const d = document.createElement("div"); d.className = "bubble";
  if ($("chatView").classList.contains("wide")){ const n = document.createElement("span"); n.className = "bname"; n.textContent = name; n.style.color = colorOf(name) || ""; d.appendChild(n);
    const a = cleanAct(act); if (a){ const s = document.createElement("span"); s.className = "bact"; s.textContent = a; d.appendChild(s); }
    d.appendChild(document.createTextNode(text)); }
  else d.textContent = text.length > 24 ? text.slice(0, 23) + "…" : text;
  b.appendChild(d); positionBubble();
}
async function typeOut(el, text, ms){
  const tok = ++app.typeTok; el.textContent = "";
  for (let i = 1; i <= text.length; i++){ if (tok !== app.typeTok){ el.textContent = text; return; } el.textContent = text.slice(0, i); await sleep(ms); }
}
function cleanAct(a){ a = String(a || "").trim().replace(/^[（(]+|[)）]+$/g, ""); return a ? `（${a}）` : ""; }
function boxSay(name, text, act, color){
  $("dName").textContent = name; $("dName").style.color = color || "var(--ink)"; $("dAct").textContent = cleanAct(act);
  return typeOut($("dText"), text, fast() ? 10 : 55);
}
function talkMsg(from, text, auto, act){
  const st = app.stage; if (!st) return;
  if (from === "me"){ st.speaking = null; st.thinking = null; updateStage(); showBubble(null); app.typeTok++;
    const me = st.me; if (me){ me.speaking = true; clearTimeout(me._t); me._t = setTimeout(() => { me.speaking = false; }, 1800); }
    if (st.three){ app.talk3d?.playerSaid(); st.meSpeaking = true; updateStage(); clearTimeout(st._mt); st._mt = setTimeout(() => { st.meSpeaking = false; updateStage(); }, 2200); }
    $("dName").textContent = "你"; $("dName").style.color = "var(--accent)"; $("dAct").textContent = auto === "choice" ? "（你選的方向）" : auto === "action" ? "" : auto ? "（AI 代說）" : ""; $("dText").textContent = text; }
  else { st.speaking = from; st.thinking = null; updateStage(); if (st.three){ const k = window.Stage3D?.actFor(act); if (k) app.talk3d.gesture(from, k); } else gestureActor(actorOf(from), act);
    // 3D：先讓動作開始（轉頭、吸氣、手勢起手），再出字，玩家才不會只顧著看字而錯過
    const lead = st.three && !fast() ? 420 : 0; if (!lead) showBubble(from, text, act);
    if (st.three) app.talk3d?.speakText?.(from, text, lead / 1000, fast() ? 10 : 55);
    app.lastSay = sleep(lead).then(() => { if (lead) showBubble(from, text, act); return boxSay(from, text, act, colorOf(from)); }).then(() => { if (app.stage === st && st.speaking === from){ st.speaking = null; updateStage(); } }); }
}
function talkThinking(who){ const st = app.stage; if (!st) return; if (who){ st.thinking = who; st.speaking = null; updateStage(); showBubble(who, "……"); } else { st.thinking = null; updateStage(); showBubble(null); } }
function talkSys(text){ app.typeTok++; $("dName").textContent = ""; $("dAct").textContent = ""; $("dText").textContent = text; }
function styleRules(){
  if (app.ui !== "talk") return STYLE_RULES;
  return STYLE_RULES.replace(/^規則：\n1\.[^\n]*/, "規則：\n1. 這是面對面講話，不是傳訊息：口語、可以有停頓「…」。這一輪總共說 1 到 3 段，每段不超過 40 字。每段盡量加一個看得到的動作 act（10 字內），多用手和身體：放下筷子、拿起杯子、攤手、指著你、扶額、抱胸、點頭、搖頭、別過頭、站起來、走到窗邊；沒有就空字串。");
}

/* ===================== 環境音（全部用 Web Audio 即時合成，不載入外部檔案） ===================== */
const SND = { ctx: null, master: null, on: true, cur: "", nodes: [], timers: [], changedAt: 0, last: null };
try { SND.on = localStorage.getItem("snd") !== "off"; } catch {}
function sndInit(){
  if (SND.ctx) return !!SND.ctx;
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
    SND.ctx = new C(); SND.master = SND.ctx.createGain(); SND.master.gain.value = 1; SND.master.connect(SND.ctx.destination);
    SND.amb = SND.ctx.createGain(); SND.amb.gain.value = 1; SND.amb.connect(SND.master); SND.tickG = SND.ctx.createGain(); SND.tickG.gain.value = .5; SND.tickG.connect(SND.master);
    const len = SND.ctx.sampleRate * 4;
    SND.white = SND.ctx.createBuffer(1, len, SND.ctx.sampleRate); SND.brown = SND.ctx.createBuffer(1, len, SND.ctx.sampleRate);
    const w = SND.white.getChannelData(0), b = SND.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++){ const x = Math.random() * 2 - 1; w[i] = x; last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5; }
  } catch { SND.ctx = null; }
  return !!SND.ctx;
}
function sndNoise(buf, type, freq, q, gain, fade = 1.5){
  const c = SND.ctx; const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = .9 + Math.random() * .2;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(gain, c.currentTime + fade);
  src.connect(f).connect(g).connect(SND.amb || SND.master); src.start(); SND.nodes.push({ src, g }); return { src, f, g };
}
function sndEvery(min, max, fn){ const tick = () => { try { fn(); } catch {} SND.timers.push(setTimeout(tick, min + Math.random() * (max - min))); }; SND.timers.push(setTimeout(tick, Math.random() * max)); }
function sndOut(node, pan){ if (SND.ctx.createStereoPanner){ const p = SND.ctx.createStereoPanner(); p.pan.value = pan ?? (Math.random() * 1.4 - .7); node.connect(p).connect(SND.master); } else node.connect(SND.master); }
function blip(buf, type, freq, dur, gain, pan){ const c = SND.ctx, t = c.currentTime; const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(f).connect(g); sndOut(g, pan); s.start(t, Math.random() * 3); s.stop(t + dur + .05); }
function tone(freq, dur, gain, type = "sine", at = 0, pan){ const c = SND.ctx, t = c.currentTime + at; const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); sndOut(g, pan); o.start(t); o.stop(t + dur + .05); }
const SFX = {
  clink(){ const f = 2300 + Math.random() * 1500, p = Math.random() * 1.2 - .6; tone(f, .35, .05, "sine", 0, p); tone(f * 2.7, .2, .02, "sine", 0, p); },
  keys(){ const n = 3 + Math.floor(Math.random() * 7); const p = Math.random() * 1.2 - .6; for (let i = 0; i < n; i++) setTimeout(() => SND.ctx && blip(SND.white, "highpass", 2600, .025, .06, p), i * (70 + Math.random() * 90)); },
  chime(){ tone(659, 1.2, .06); tone(523, 1.6, .06, "sine", .7); },
  drop(){ blip(SND.white, "bandpass", 2500 + Math.random() * 2000, .03, .04); },
  scooter(){ const c = SND.ctx, t = c.currentTime; const s = c.createBufferSource(); s.buffer = SND.white; const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3;
    f.frequency.setValueAtTime(220, t); f.frequency.linearRampToValueAtTime(620, t + 1.6); f.frequency.linearRampToValueAtTime(240, t + 3.4);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + 1.6); g.gain.linearRampToValueAtTime(0, t + 3.4);
    s.connect(f).connect(g); sndOut(g, Math.random() < .5 ? -.6 : .6); s.start(t); s.stop(t + 3.5); },
  espresso(){ blip(SND.white, "highpass", 3200, 1.6, .025, .4); },
  steps(){ for (let i = 0; i < 5; i++) setTimeout(() => SND.ctx && blip(SND.brown, "lowpass", 400, .08, .12, -.3 + i * .15), i * 480); },
  // v0.24 新增
  tick(){ const c = SND.ctx, t = c.currentTime; const s2 = c.createBufferSource(); s2.buffer = SND.white; const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3800; f.Q.value = 6;
    const g = c.createGain(); g.gain.setValueAtTime(.09, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03); s2.connect(f).connect(g).connect(SND.tickG); s2.start(t, Math.random() * 3); s2.stop(t + .05); },
  chop(){ const p = Math.random() * .8 - .4; blip(SND.white, "bandpass", 3000, .02, .05, p); setTimeout(() => SND.ctx && blip(SND.white, "bandpass", 2600, .02, .04, p), 90 + Math.random() * 60); },
  phone(){ for (let i = 0; i < 2; i++){ tone(1180, .35, .012, "sine", i * .5, .7); tone(1480, .35, .01, "sine", i * .5 + .02, .7); } },
  murmur(){ const c = SND.ctx, t = c.currentTime; const s2 = c.createBufferSource(); s2.buffer = SND.brown; const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 420 + Math.random() * 200; f.Q.value = 2.5;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .4); g.gain.linearRampToValueAtTime(0, t + 1.8 + Math.random()); s2.connect(f).connect(g); sndOut(g, Math.random() < .5 ? -.7 : .7); s2.start(t, Math.random() * 2); s2.stop(t + 3); },
  cup(){ blip(SND.brown, "lowpass", 900, .09, .14); tone(1900 + Math.random() * 400, .12, .015); },
};
/* v0.24 氣氛：越緊張環境聲越小、時鐘聲越清楚；冷戰時幾乎只剩時鐘 */
function sndMood(level){ if (!SND.ctx || !SND.amb) return; const t = SND.ctx.currentTime; const amb = [1, .7, .35][level] ?? 1, tick = [.45, .8, 1.4][level] ?? .45;
  if (SND.mood === level) return; SND.mood = level; SND.amb.gain.setTargetAtTime(amb, t, .8); SND.tickG.gain.setTargetAtTime(tick, t, .8); }
function stopScape(){
  for (const t of SND.timers){ if (t && t.iv) clearInterval(t.iv); else clearTimeout(t); } SND.timers = []; SND.mood = undefined; if (SND.ctx && SND.amb){ SND.amb.gain.value = 1; SND.tickG.gain.value = .45; }
  if (SND.ctx) for (const n of SND.nodes){ try { n.g.gain.cancelScheduledValues(SND.ctx.currentTime); n.g.gain.setTargetAtTime(0, SND.ctx.currentTime, .3); n.src.stop(SND.ctx.currentTime + 1.5); } catch {} }
  SND.nodes = []; SND.cur = "";
}
function playScape(c, force){
  if (!c) return; SND.last = c; if (!SND.on) return;
  const key = `${c.loc}|${c.weather}|${timeOf(c.hour)}|${c.mode || ""}`; if (key === SND.cur) return;
  if (!force && Date.now() - SND.changedAt < 2500 && SND.cur) return;
  if (!sndInit()) return; SND.ctx.resume?.(); stopScape(); SND.cur = key; SND.changedAt = Date.now();
  const night = timeOf(c.hour) === "night"; const L = c.loc;
  sndNoise(SND.brown, "lowpass", L === "office" || L === "lab" ? 220 : 160, .7, L === "office" || L === "lab" ? .09 : .06);
  if (c.weather === "rain"){ const n = sndNoise(SND.white, "bandpass", 1300, .5, L === "cafe" ? .05 : .035); sndEvery(150, 700, SFX.drop); }
  if (L === "dinner"){ sndEvery(1800, 5500, SFX.clink); sndEvery(3500, 9000, SFX.chop); sndEvery(15000, 40000, SFX.scooter); }
  if (L === "dinner" || L === "family" || L === "rented" || L === "home"){ const iv = setInterval(() => { try { SND.on && SFX.tick(); } catch {} }, 1000); SND.timers.push({ iv }); }
  if (L === "home"){ const h = SND.ctx.createOscillator(); h.type = "sine"; h.frequency.value = 100; const hg = SND.ctx.createGain(); hg.gain.value = .006; h.connect(hg).connect(SND.amb); h.start(); SND.nodes.push({ src: h, g: hg }); sndEvery(night ? 18000 : 10000, night ? 45000 : 28000, SFX.scooter); }
  if (L === "cafe"){ const m = sndNoise(SND.white, "bandpass", 480, .9, .03);
    const lfo = SND.ctx.createOscillator(); const lg = SND.ctx.createGain(); lfo.frequency.value = .27; lg.gain.value = .012; lfo.connect(lg).connect(m.g.gain); lfo.start(); SND.nodes.push({ src: lfo, g: lg });
    sndEvery(2500, 8000, SFX.clink); sndEvery(22000, 50000, SFX.espresso); }
  if (L === "office"){ sndEvery(2500, 8000, SFX.keys); sndEvery(5000, 14000, SFX.murmur); sndEvery(30000, 70000, SFX.phone); }
  if (L === "lab"){ sndNoise(SND.white, "bandpass", 210, 2, .02); sndEvery(4000, 12000, SFX.keys); }
  if (L === "hospital"){ sndNoise(SND.white, "bandpass", 520, .8, .012); sndEvery(16000, 32000, SFX.chime); sndEvery(9000, 20000, SFX.steps); }
  if (L === "family" || L === "rented"){ sndEvery(night ? 14000 : 9000, night ? 40000 : 25000, SFX.scooter); if (c.mode === "" && !night) sndEvery(6000, 15000, SFX.keys); }
}
function sndToggle(){
  SND.on = !SND.on; try { localStorage.setItem("snd", SND.on ? "on" : "off"); } catch {}
  for (const b of document.querySelectorAll(".sndBtn")) b.textContent = SND.on ? "🔊 環境音" : "🔈 已靜音";
  if (SND.on){ SND.cur = ""; playScape(SND.last, true); } else stopScape();
}
document.addEventListener("click", e => { if (e.target.closest?.(".sndBtn")) sndToggle(); });
function syncGfx(){ for (const s of document.querySelectorAll(".gfxSel:not(#viewSel)")){ s.value = use3D() ? "3d" : "2d"; s.disabled = !window.Stage3D?.ok; s.title = window.Stage3D?.ok ? "" : "這台裝置的瀏覽器不支援 3D，已改用簡易插畫"; } }
document.addEventListener("change", e => { if (e.target.id === "viewSel"){ app.talk3d?.setViewMode(e.target.value); try { localStorage.setItem("view", e.target.value); } catch {} return; }
  if (!e.target.classList?.contains("gfxSel")) return; GFX.mode = e.target.value; try { localStorage.setItem("gfx", GFX.mode); } catch {}
  syncGfx(); if (!$("dayView").hidden && app.world){ app.day3dAt = 0; renderDayHead(app.world); } if (!$("chatView").hidden && app.ui === "talk"){ drawStage(); updateStage(); } });
window.addEventListener("stage3d-ready", () => { syncGfx(); if (!$("dayView").hidden && app.world) renderDayHead(app.world); });
syncGfx(); try { const v = localStorage.getItem("view"); if (v) $("viewSel").value = v; } catch {}
for (const b of document.querySelectorAll(".sndBtn")) b.textContent = SND.on ? "🔊 環境音" : "🔈 已靜音";

/* ===================== 場景互動：點人、點東西、限時選項 ===================== */
Object.assign(RULES.intents, { listen: { respect: +6 }, phone: { trust: -6, respect: -4 }, window: { trust: -3 } });
Object.assign(WORLD.sceneIntent, { listen: +3, phone: -4, window: -2 });
function giveWord(){ const l = app.stage?.ctx.loc; return l === "dinner" ? "倒茶" : l === "cafe" ? "加水" : "遞一杯水"; }
const ACT = {
  sip:    { label: () => "喝一口，停一下", note: () => "（你喝了一口，停了幾秒）" },
  pour:   { label: n => `幫${n}${giveWord()}`, note: n => `（你幫${n}${giveWord()}）`, intents: ["help"], target: true },
  listen: { label: n => `看著${n}，等他說完`, note: n => `（你放下手邊的東西，看著${n}，等他把話說完）`, intents: ["listen"], target: true },
  phone:  { label: () => "低頭看手機", note: () => "（你低頭滑了一下手機）", intents: ["phone"] },
  window: { label: () => "轉頭望向窗外", note: () => "（你沒有回答，轉頭望向窗外）", intents: ["window"] },
  leave:  { label: () => "起身離開", note: () => "（你站起來，離開了位子）" },
  putdown:{ label: () => "已讀，先不回", note: () => "（你看了訊息，把手機蓋在一旁。過了二十分鐘都沒有回）", intents: ["avoid"] },
  sleep:  { label: () => "回「先睡了，明天再說」", note: () => "先睡了，明天再說" },
  silent: { label: () => "沉默", note: () => "（你沉默了好幾秒，沒有回答）", intents: ["avoid"] },
};
function actEnded(){ return app.mode === "ch0" ? !!app.cur?.ending : !!app.scene?.done; }
function renderActRow(){
  const row = $("actRow"); if (!row) return; row.innerHTML = "";
  if (app.ui === "chat" && app.msgCtx){ row.hidden = false; const lab = document.createElement("span"); lab.className = "note"; lab.textContent = "動作："; row.appendChild(lab); const off = app.busy || actEnded();
    for (const k of ["putdown", "sleep"]){ const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = ACT[k].label(); b.disabled = off; b.onclick = () => doAct(k); row.appendChild(b); } return; }
  row.hidden = app.ui !== "talk" || !app.stage; if (row.hidden) return;
  const lab = document.createElement("span"); lab.className = "note"; lab.textContent = "動作："; row.appendChild(lab);
  const off = app.busy || actEnded();
  const add = (k, who) => { const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = ACT[k].label(who); b.disabled = off; b.onclick = () => doAct(k, who); row.appendChild(b); };
  const ppl = (app.stage.people || []).filter(n => !(app.mode === "ch0" && app.cur?.states?.[n]?.ending === "cold"));
  const focus = ppl.includes(app.lastSpeaker) ? app.lastSpeaker : ppl[0];
  if (focus){ add("listen", focus); add("pour", focus); }
  if (app.stage.ctx.loc !== "hospital") add("sip");
  add("phone"); add("window"); add("leave");
}
async function doAct(k, who){
  if (app.busy || actEnded()) return; hideHotMenu(); cancelWheel();
  const A = ACT[k]; const note = A.note(who);
  if (app.stage?.three && app.talk3d){ const g = { sip: "sip", pour: "pour", phone: "phone", window: "look", listen: "nod" }[k]; if (g) app.talk3d.gesture("me", g, undefined, who); }
  if (k === "sip"){ addSys(note); return; }
  if (k === "putdown") msg3d()?.setPhone({ down: true });
  if (k === "sleep"){
    addMsg("me", note); await sleep(900);
    if (app.mode === "ch0"){ for (const c of ch0()){ const s = app.cur.states[c.call]; if (!s.ending) s.respect = clamp(s.respect - 6); } app.cur.memories.push("第 0 章你回了一句「先睡了，明天再說」就沒再回"); finishCh0("quit"); }
    else { const w = app.world; w.rel[app.scene.relKey] = clamp((w.rel[app.scene.relKey] ?? 55) - 3); w.memories.push(`${ymd(w)}你跟${app.scene.name}傳訊息傳到一半，回了「先睡了」`); endScene(); }
    return;
  }
  if (k === "leave"){
    addSys(note);
    if (app.mode === "ch0"){ for (const c of ch0()){ const s = app.cur.states[c.call]; if (!s.ending) s.respect = clamp(s.respect - 15); } app.cur.memories.push("第 0 章你話沒說完就起身離開"); finishCh0("quit"); }
    else { const w = app.world; w.rel[app.scene.relKey] = clamp((w.rel[app.scene.relKey] ?? 55) - 6); w.memories.push(`${ymd(w)}你跟${app.scene.name}談到一半就起身離開`); endScene(); }
    return;
  }
  const preset = { intents: A.intents, targets: A.target && who ? [who] : null };
  if (app.mode === "ch0") sendCh0(note, "action", preset); else sendScene(note, "action", preset);
}
function hideHotMenu(){ const m = $("hotMenu"); if (m) m.hidden = true; }
function showHotMenu(at, title, items){
  const m = $("hotMenu"); m.innerHTML = ""; const t = document.createElement("b"); t.textContent = title; m.appendChild(t);
  for (const [label, fn] of items){ const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = () => { hideHotMenu(); fn(); }; m.appendChild(b); }
  m.style.left = Math.min(78, Math.max(22, at.x)) + "%"; m.style.top = Math.min(52, Math.max(4, at.y)) + "%"; m.hidden = false;
}
function onTalkHot(id, at){
  if (!id || app.busy || actEnded()){ hideHotMenu(); return; }
  if (app.ui === "chat"){ if (id === "phone") return showHotMenu(at, "你的手機", [["拿起來回", () => { msg3d()?.setPhone({ down: false }); $("msgInput").focus(); }], [ACT.putdown.label(), () => doAct("putdown")]]);
    if (id === "bed") return showHotMenu(at, "床", [[ACT.sleep.label(), () => doAct("sleep")]]); hideHotMenu(); return; }
  if (id.startsWith("person:")){ const n = id.slice(7); return showHotMenu(at, n, [[ACT.listen.label(n), () => doAct("listen", n)], [ACT.pour.label(n), () => doAct("pour", n)]]); }
  const k = { cup: "sip", phone: "phone", window: "window", door: "leave" }[id]; if (!k){ hideHotMenu(); return; }
  showHotMenu(at, { cup: "你的杯子", phone: "你的手機", window: "窗戶", door: "門" }[id], [[ACT[k].label(), () => doAct(k)]]);
}
function onTalkHover(h){ const t = $("hotTip"); if (!h){ t.hidden = true; return; } t.textContent = h.label; t.style.left = h.x + "%"; t.style.top = h.y + "%"; t.hidden = false; }
Object.assign(STYLE_TEXT, {
  soothe: "先承認並回應對方的擔心與感受，語氣放軟，再帶一點自己的想法。",
  ask: "不急著辯解，用一個真誠的問題反問對方真正擔心的是什麼。",
  firm: "語氣平穩但堅定，維持自己的決定，不讓步，也不頂嘴。",
});
const WHEEL = [["honest", "說明理由"], ["soothe", "先安撫"], ["ask", "反問"], ["firm", "堅持"]];
function maybeWheel(text, who){
  if (!$("wheelOn")?.checked || actEnded() || !text) return;
  if (!/[？?]\s*$|[嗎呢吧][。？?！!…]*\s*$/.test(String(text).trim())) return;
  showWheel(who);
}
function showWheel(who){
  cancelWheel(); const o = $("wheelOpts"); o.innerHTML = "";
  for (const [st, label] of WHEEL){ const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = () => { cancelWheel(); aiSay(st, false, "choice"); }; o.appendChild(b); }
  $("wheelQ").textContent = `${who}在等你回答。選一個方向，或直接打字；時間到就算沉默。`; $("wheel").hidden = false;
  const dur = fast() ? 7000 : 14000, t0 = Date.now(); $("wheelBar").style.width = "100%";
  app.wheelTimer = setInterval(() => { const left = 1 - (Date.now() - t0) / dur; $("wheelBar").style.width = Math.max(0, left * 100) + "%";
    if (left <= 0){ cancelWheel(); doAct("silent"); } }, 100);
}
function cancelWheel(){ clearInterval(app.wheelTimer); app.wheelTimer = null; const w = $("wheel"); if (w) w.hidden = true; }

/* ===================== 每天可以點的事（一天各一次） ===================== */
const DAY_ACT = {
  laptop: { label: "多做一小時", fx: { growth: +.6, energy: -1.5 }, note: "你多做了一個小時。", mode: "work" },
  bed:    { label: "早點睡", fx: { energy: +1.6, growth: -.15 }, note: "你今天早點上床。", mode: "bed" },
  window: { label: "在窗邊發呆一下", fx: { doubt: -.4, energy: +.3 }, note: "你在窗邊站了一會兒，什麼也沒想。" },
  door:   { label: "出門走走", fx: { energy: +1, money: -150 }, note: "你出門走了一圈，買了杯飲料。" },
  phone:  { label: "拿起手機查一下", query: true },
};
function renderDayActs(w){
  const box = $("dayActs"); if (!box) return; box.innerHTML = "";
  const lab = document.createElement("span"); lab.className = "note"; lab.textContent = "今天想做的事："; box.appendChild(lab);
  const used = w.dayActs?.[w.day] || []; const off = !w.day || app.dayBusy || !$("evPanel").hidden;
  for (const [k, a] of Object.entries(DAY_ACT)){ const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = a.label; b.disabled = a.query ? !!app.dayBusy : (off || used.includes(k)); b.onclick = () => dayAct(k); box.appendChild(b); }
}
function dayAct(k){
  const w = app.world; const A = DAY_ACT[k]; if (!w || !A || app.dayBusy) return; if (A.query){ openPhone(); return; } if (!w.day || !$("evPanel").hidden) return;
  stopPlay();
  w.dayActs = w.dayActs || {}; const used = w.dayActs[w.day] || (w.dayActs[w.day] = []); if (used.includes(k)) return; used.push(k);
  for (const [f, v] of Object.entries(A.fx)){ if (f === "money") w.money += v; else w[f] = clampF(w[f] + v); }
  addFeed(w, A.note, "sys"); if (A.mode) w.todayMode = { day: w.day, mode: A.mode };
  app.day3dAt = 0; renderDayHead(w); if (k === "window" && app.day3d) app.day3d.gesture("me", "look", 3);
}
function onDayHover(h){ const t = $("dayTip"); const w = app.world; if (!h || !DAY_ACT[h.id] || !w){ t.hidden = true; return; }
  const used = (w.dayActs?.[w.day] || []).includes(h.id); t.textContent = DAY_ACT[h.id].label + (used ? "（今天做過了）" : ""); t.style.left = h.x + "%"; t.style.top = h.y + "%"; t.hidden = false; }

/* ===================== 匯入聊天紀錄或 Email ===================== */
function parseChat(text){
  const re = /^(?:(?:上午|下午)\s*)?\d{1,2}:\d{2}(?:\s*[AP]M)?\t([^\t]+)\t(.*)$/i; const msgs = [];
  for (const l of String(text).replace(/\r/g, "").split("\n")){
    const m = l.match(re); if (m){ msgs.push({ who: m[1].trim(), text: m[2] }); continue; }
    if (msgs.length && l.trim() && !/^\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}/.test(l) && !/^\[LINE\]|^儲存日期|^Saved on/i.test(l)) msgs[msgs.length - 1].text += " " + l.trim();
  }
  return msgs.length >= 3 ? msgs : null;
}
function redact(t){
  return String(t).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/https?:\/\/\S+/g, "[網址]")
    .replace(/(\+?886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}/g, "[電話]").replace(/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[電話]")
    .replace(/[A-Z][12]\d{8}/g, "[身分證]").replace(/\d+\s*(?:號|巷|弄|樓|段)/g, "[地址]").replace(/\b\d{10,19}\b/g, "[號碼]");
}
function chatExcerpt(text, who){
  const msgs = parseChat(text); const out = []; let n = 0;
  if (!msgs || !who) return redact(String(text).slice(-6000));
  for (let i = msgs.length - 1; i >= 0 && n < 6000; i--){ const m = msgs[i]; const line = `${m.who === who ? "他" : "其他人"}：${redact(m.text).slice(0, 220)}`; out.push(line); n += line.length; }
  return out.reverse().join("\n");
}
function importPrompt(call, rel, excerpt, lineMode){
  return `你在幫一個人生演練工具整理角色卡。以下是玩家提供的、跟「${call}」（${rel}）之間的真實${lineMode ? "對話節錄" : "文字（可能是 Email 或對話）"}，個資已經遮掉。${lineMode ? `「他」是${call}，「其他人」是玩家或別人。` : `請只分析看得出是${call}寫的部分。`}
只根據${call}自己寫的話，分析他的說話方式與在意的事；看不出來就寫「看不出來」。不要推測健康、政治、宗教、性傾向等敏感特質，不要評價他的人格，不要重複任何個資。
只回傳 JSON：{"cares":"他在意的事（1-2 句）","phrase":"他常用的說法或口頭禪（10 字內）","bottom":"從文字看得出的底線（看不出來就這樣寫）","style":"說話方式：句子長短、語氣、會不會用貼圖或表情符號、怎麼表達不同意（2-3 句）","softeners":"什麼樣的說法比較能讓他接受","triggers":"什麼樣的說法容易讓他不高興","examples":["3 句符合他語氣的例句：必須是重新寫過的新句子，不可以照抄原文"],"summary":"一句話總結"}
節錄：
${excerpt}`;
}
function importPanel(d){
  const wrap = document.createElement("div"); wrap.className = "imp";
  const tog = document.createElement("button"); tog.type = "button"; tog.className = "small"; tog.textContent = "從聊天紀錄或 Email 匯入（選填）"; wrap.appendChild(tog);
  const box = document.createElement("div"); box.className = "impbox"; box.hidden = true; wrap.appendChild(box);
  box.innerHTML = `<p class="note">貼上你跟他的 LINE 對話、從 LINE 匯出的 .txt，或 Email。頁面會先把電話、Email、網址、地址、證號遮掉，把名字換成「他／其他人」，只送出最近一段給 AI 整理成角色卡。原文不會保存，也不會出現在「複製紀錄給團隊」裡。</p>
    <input type="file" accept=".txt,text/plain">
    <textarea rows="5" placeholder="或直接貼上對話、Email⋯"></textarea>
    <div class="field"><label>對話裡哪一位是他</label><select></select></div>
    <label class="check"><input type="checkbox"> 這是我自己參與的對話，只用來自己演練</label>
    <div class="btns"><button type="button" class="small primary">分析他的說話方式</button></div>
    <p class="status" aria-live="polite"></p>`;
  const [file] = box.getElementsByTagName("input"), ta = box.querySelector("textarea"), sel = box.querySelector("select"), ok = box.querySelector(".check input"), go = box.querySelector(".btns button"), st = box.querySelector(".status");
  tog.onclick = () => { box.hidden = !box.hidden; };
  const refresh = () => { const msgs = parseChat(ta.value); sel.innerHTML = "";
    if (!msgs){ const o = document.createElement("option"); o.value = ""; o.textContent = ta.value.trim() ? "不是 LINE 格式：整段一起分析" : "（先貼上內容）"; sel.appendChild(o); return; }
    const cnt = {}; for (const m of msgs) cnt[m.who] = (cnt[m.who] || 0) + 1;
    const call = d.querySelector('[data-k="call"]')?.value.trim();
    for (const [n, c] of Object.entries(cnt).sort((a, b) => b[1] - a[1])){ const o = document.createElement("option"); o.value = n; o.textContent = `${n}（${c} 則）`; sel.appendChild(o); }
    const guess = Object.keys(cnt).find(n => call && n.includes(call)); if (guess) sel.value = guess; };
  ta.addEventListener("input", refresh);
  file.onchange = () => { const f = file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { ta.value = String(r.result).slice(-200000); file.value = ""; refresh(); }; r.readAsText(f); };
  refresh();
  go.onclick = async () => {
    st.classList.remove("error");
    if (!sample){ st.textContent = "請先回到首頁設定你的 Gemini API 金鑰。"; return; }
    if (!ta.value.trim()){ st.textContent = "先貼上內容。"; return; }
    if (!ok.checked){ st.textContent = "請先勾選確認。"; return; }
    const call = d.querySelector('[data-k="call"]')?.value.trim() || "他", rel = d.querySelector('[data-k="rel"]')?.value || "";
    const lineMode = !!parseChat(ta.value) && !!sel.value; go.disabled = true; st.textContent = "整理中⋯（約 10 到 30 秒）";
    try {
      const r = await sample.json(importPrompt(call, rel, chatExcerpt(ta.value, sel.value), lineMode), { cache: false });
      const set = (k, v) => { const el = d.querySelector(`[data-k="${k}"]`); if (el && v && !/^看不出來/.test(v)) el.value = v; };
      set("cares", r.cares); set("phrase", r.phrase); set("bottom", r.bottom);
      d.dataset.voice = JSON.stringify({ style: r.style || "", softeners: r.softeners || "", triggers: r.triggers || "", examples: (Array.isArray(r.examples) ? r.examples : []).slice(0, 3).map(String) });
      ta.value = ""; refresh(); st.textContent = `已整理：${r.summary || "完成"}。上面的欄位已更新，可以再修改；原文已清掉。`;
    } catch (e) { st.textContent = errCopy(e); st.classList.add("error"); }
    finally { go.disabled = false; }
  };
  return wrap;
}

/* ===================== 共用的聊天畫面 ===================== */
const COLORS = ["var(--p1)","var(--p2)","var(--p3)","var(--p4)"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fast = () => !!window.__fast; /* v0.19 拿掉「快速回覆」；測試用 */
const wait = (slow, quick) => sleep(fast() ? quick : slow);
function colorOf(name){ const names = [...app.cards.map(c=>c.call), ...Object.values(app.world?.npcs || {}).map(n=>n.name)]; const i = names.indexOf(name); return COLORS[(i < 0 ? 3 : i) % 4]; }
function fmtClock(ms){ const t = Math.max(0, Math.ceil(ms/1000)); return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`; }
function scroll(){ $("msgs").scrollTop = $("msgs").scrollHeight; }
function addMsg(from, text, auto, group, act){
  const w = document.createElement("div"); w.className = "msg " + (from === "me" ? "me" : "them");
  if (from !== "me" && group){ const s = document.createElement("span"); s.className = "sender"; s.textContent = from; s.style.color = colorOf(from); w.appendChild(s); }
  if (act && cleanAct(act)){ const a = document.createElement("span"); a.className = "actl"; a.textContent = cleanAct(act); w.appendChild(a); }
  const b = document.createElement("div"); b.className = "b"; b.textContent = text; w.appendChild(b);
  if (auto){ const a = document.createElement("span"); a.className = "auto"; a.textContent = auto === "choice" ? "你選的方向" : auto === "action" ? "動作" : "AI 代說"; w.appendChild(a); }
  $("msgs").appendChild(w); scroll(); if (app.ui === "talk") talkMsg(from, text, auto, act);
  const m3 = msg3d(); if (m3 && auto !== "action"){ if (from === "me"){ sfx3d("send"); m3.setPhone({ typing: true }); m3.after(.9, () => m3.setPhone({ down: true })); } else m3.buzz(); }
  return w;
}
function addSys(text){ const p = document.createElement("div"); p.className = "sys"; p.textContent = text; $("msgs").appendChild(p); scroll(); if (app.ui === "talk") talkSys(text); }
function setTyping(who, group){
  $("typingDots")?.remove(); if (app.ui === "talk"){ talkThinking(who); return; } if (!who) return;
  const t = document.createElement("div"); t.id = "typingDots"; t.className = "typing"; t.setAttribute("aria-label", `${who} 正在輸入`);
  if (group){ const s = document.createElement("span"); s.className = "sender"; s.textContent = who; s.style.color = colorOf(who); t.appendChild(s); }
  const d = document.createElement("div"); d.className = "dots"; d.innerHTML = "<i></i><i></i><i></i>"; t.appendChild(d);
  $("msgs").appendChild(t); scroll();
}
function openChat(title, sub, avatar){
  $("msgs").innerHTML = ""; $("chatName").textContent = title; $("chatSub").textContent = sub; $("avatar").textContent = avatar.slice(0,1);
  $("msgInput").value = ""; const talk = app.ui === "talk";
  $("chatView").classList.toggle("talk", talk); $("stage").hidden = !talk; $("dbox").hidden = !talk;
  $("bubbles").innerHTML = ""; $("dName").textContent = ""; $("dAct").textContent = ""; $("dText").textContent = "";
  $("msgInput").placeholder = talk ? "你要說⋯" : "輸入訊息⋯"; $("sendBtn").textContent = talk ? "說" : "傳送";
  cancelWheel(); hideHotMenu(); show("chatView");
  const ms = !talk && !!app.msgCtx && use3D(); $("chatView").classList.toggle("msgscene", ms);
  setLogOpen(false); $("logBtn").hidden = !(talk || ms); syncWide();
  if ((talk || ms) && !$("chatView").classList.contains("wide") && screen.width >= 1000 && !app.wideHinted){ app.wideHinted = true; addSys("視窗再寬一點，畫面會變成全寬、文字放在左邊。"); }
  if (talk){ drawStage(); playScape(app.stage.ctx, true); } else if (ms){ $("stage").hidden = false; drawMsg3D(); playScape(app.msgCtx, true); } else stopScape(); renderActRow(); syncWide();
}
function setBusy(b){ app.busy = b; const ended = app.mode === "ch0" ? !!app.cur?.ending : !!app.scene?.done; $("sendBtn").disabled = b || ended; $("aiSay").disabled = b || ended; renderActRow(); if (b) hideHotMenu(); }
async function playReplies(msgs, pauseSec, group){
  const ps = Math.max(.5, Number(pauseSec) || 1.5); await wait((app.ui === "talk" ? Math.min(1.8, ps * .5) : Math.min(4, ps)) * 1000, 200);
  const shown = [];
  for (let i = 0; i < msgs.length; i++){
    const m = msgs[i]; const talk = app.ui === "talk"; setTyping(m.who, group);
    await wait(talk ? Math.min(2500, 600 + m.text.length * 25) : Math.min(7000, 1500 + m.text.length * 90), talk ? 150 : 400);
    setTyping(null); addMsg(m.who, m.text, false, group, m.act); shown.push(m);
    if (talk && app.lastSay) await app.lastSay;
    if (i < msgs.length - 1) await wait(800 + Math.random() * 1500, 150);
  }
  return shown;
}
const WIDE_MQ = matchMedia("(min-width: 720px) and (min-aspect-ratio: 6/5)");
function syncWide(){ const v = $("chatView"); const on = !v.hidden && (v.classList.contains("talk") || v.classList.contains("msgscene")) && WIDE_MQ.matches;
  const was = v.classList.contains("wide"); v.classList.toggle("wide", on); if (on) setLogOpen(false);
  const pad = on ? (v.querySelector(".chathead")?.offsetWidth || 0) : 0; app.talk3d?.setPadLeft(pad);
  if (was !== on && app.stage?.bubbleFor){ const t = $("bubbles").firstChild?.textContent; if (t) positionBubble(); } }
WIDE_MQ.addEventListener?.("change", syncWide); addEventListener("resize", () => { if (!$("chatView").hidden) syncWide(); });
function setLogOpen(on){ const v = $("chatView"); v.classList.toggle("logopen", !!on); $("logBtn").setAttribute("aria-pressed", on ? "true" : "false"); $("logBtn").textContent = on ? "回到畫面" : "看紀錄"; if (on){ const m = $("msgs"); m.scrollTop = m.scrollHeight; } }
$("toolsBtn").onclick = () => { const v = $("chatView"), on = !v.classList.contains("toolsopen"); v.classList.toggle("toolsopen", on); $("toolsBtn").setAttribute("aria-expanded", on ? "true" : "false"); $("toolsBtn").textContent = on ? "收起選項" : "更多選項"; };
$("logBtn").onclick = () => setLogOpen(!$("chatView").classList.contains("logopen"));
$("msgInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); $("compose").requestSubmit(); } });
$("msgInput").addEventListener("input", () => { delete $("msgInput").dataset.auto; cancelWheel(); msg3d()?.setPhone({ down: false, typing: true }); if (app.ui === "talk" && app.stage?.three) app.talk3d?.playerTyping(); });
$("compose").addEventListener("submit", ev => { ev.preventDefault(); const t = $("msgInput").value.trim(); if (!t) return;
  const auto = $("msgInput").dataset.auto === "1"; if (app.mode === "ch0") sendCh0(t, auto); else sendScene(t, auto); });
$("aiSay").onclick = () => aiSay($("aiStyle").value, $("aiEdit").checked);
async function aiSay(style, edit, label){
  if (app.busy) return;
  const ctx = app.mode === "ch0" ? { situation: `第 0 章，跟${ch0().map(c=>c.call).join("、")}攤牌`, recent: recentText(app.cur) }
    : { situation: `${dayLabel(app.world)}，跟${app.scene.name}談：${app.scene.moment}`, recent: app.scene.messages.map(m => `${m.from === "me" ? "玩家" : m.from}：${m.text}`).join("\n") };
  setBusy(true); $("aiSay").textContent = "產生中⋯";
  try {
    const r = await sample.json(playerPrompt(ctx, style), { modelTier: "quick", cache: false });
    const t = String(r.text || "").trim();
    app.playerDetails = app.playerDetails || [];
    for (const d of (Array.isArray(r.newDetails) ? r.newDetails : [])) if (d && !app.playerDetails.includes(d)) app.playerDetails.push(String(d));
    app.playerDetails = app.playerDetails.slice(-24); setBusy(false); $("aiSay").textContent = "AI 幫我說一句"; if (!t) return;
    if (edit){ $("msgInput").value = t; $("msgInput").dataset.auto = "1"; $("msgInput").focus(); }
    else if (app.mode === "ch0") sendCh0(t, label || true); else sendScene(t, label || true);
  } catch (e) { addSys(errCopy(e)); setBusy(false); $("aiSay").textContent = "AI 幫我說一句"; }
}
$("endChat").onclick = () => { if (app.busy) return; cancelWheel(); if (app.mode === "ch0"){ if (!app.cur.ending) finishCh0("quit"); } else endScene(); };

/* ===================== 第 0 章：攤牌 ===================== */
function allFacts(run){ return [app.setup.facts, ...run.facts].filter(Boolean).join("；"); }
function recentText(run, n = 18){ return run.messages.slice(-n).map(m => `${m.from === "me" ? "玩家" : m.from}：${m.text}`).join("\n") || "（還沒有訊息）"; }
$("startChat").onclick = () => { app.cards = readCards(); beginMode(false); };
function beginMode(keep){
  if (!keep) app.timelines = [];
  app.chosenPath = null;
  if (app.setup.mode === "discuss") return startCh0();
  if (app.setup.mode === "after" && !ch0().length) app.setup.mode = "alone";
  showPathPick();
}
function showPathPick(){
  const m = app.setup.mode;
  $("pathEyebrow").textContent = "第 0 章 · 做決定";
  $("pathTitle").textContent = m === "after" ? "你決定先斬後奏。選哪一條？" : "你沒有問任何人。選哪一條？";
  $("ch0Result").hidden = true; $("ch0Feedback").hidden = true; $("emoPath").hidden = true;
  $("pathNote").textContent = m === "after" ? `選完之後就已經定了（回覆了、辦好了）。接著你要傳訊息告訴${ch0().map(c=>c.call).join("、")}。` : "沒有人知道你做了這個決定。故事從下個月開始。";
  const pb = $("pathBtns"); pb.innerHTML = "";
  for (const p of ["A","B"]){ const b = document.createElement("button"); b.className = p === app.setup.leanKey ? "primary" : "";
    b.textContent = `${p}：${pathName(p)}`;
    b.onclick = () => { if (m === "after"){ app.chosenPath = p; startCh0(); }
      else { app.cur = { states: {}, facts: [], memories: [], messages: [], log: [], ending: "alone" }; app.ch0Summary = MODE_TEXT.alone; beginYears(p); } };
    pb.appendChild(b); }
  show("pathView");
}
function startCh0(){
  app.mode = "ch0"; app.snaps = []; app.world = null;
  const cs = ch0(); const after = app.setup.mode === "after";
  const states = {}; for (const c of cs){ states[c.call] = newState(c.concerns, c.firm); if (after) states[c.call].respect = 45; }
  const run = { startedAt: Date.now(), states, facts: [], memories: [], messages: [], log: [], ending: null };
  app.cur = run; const group = cs.length > 1;
  app.ui = $("c_medium").value === "face" ? "talk" : "chat";
  app.stage = app.ui === "talk" ? { ctx: stageCtxCh0(), people: cs.map(c => c.call), w: null } : null;
  app.msgCtx = app.ui === "chat" ? msgCtxFor({ ...stageCtxCh0(), loc: /爸媽|家裡|老家|跟家人|父母/.test(app.setup.live || "") ? "family" : "rented", hour: 22, min: 40 }, "desk") : null;
  openChat(group ? `${app.setup.group}（${cs.length + 1}）` : cs[0].call, `第 0 章 · ${after ? "事後告知" : "攤牌"}${group ? " · " + cs.map(c=>c.call).join("、") : ""}`, group ? app.setup.group : cs[0].call);
  const d = document.createElement("div"); d.className = "day"; d.textContent = "今天"; $("msgs").appendChild(d);
  if (msg3d()) $("chatSub").textContent = `第 0 章 · ${msgCaption(app.msgCtx)}`;
  if (app.ui === "talk"){ $("chatSub").textContent = `第 0 章 · ${sceneCaption(app.stage.ctx)}`;
    addSys(app.stage.ctx.loc === "dinner" ? `晚上七點多，${cs.map(c => c.call).join("、")}都在餐桌前。${after ? "事情你已經決定好了。" : "你想好要怎麼開口了。"}` : `你約了${cs.map(c => c.call).join("、")}出來，咖啡剛送上桌。`); }
  $("endChat").textContent = "結束對話"; setBusy(false); $("msgInput").focus();
  clearInterval(app.timer);
  app.timer = setInterval(() => { const left = RULES.limitMs - (Date.now() - run.startedAt); $("clock").textContent = fmtClock(left);
    if (left <= 0 && !run.ending && !app.busy) finishCh0("pending", true); }, 500);
  if ($("c_first").checked) ch0Respond(run, true);
}
async function ch0Respond(run, opening, spec){
  setBusy(true); const group = ch0().length > 1; let last = null;
  try {
    /* spec：跟分析同時送出的回應；這一輪有人結束（同意或不想談）時，要照新狀態重問 */
    const changed = ch0().some(c => run.states[c.call].justEnded);
    let r = null; if (spec && !changed){ try { r = await spec; } catch { r = null; } }
    if (!r || !Array.isArray(r.messages)) r = await sample.json(ch0ReplyPrompt(run, opening, Date.now() - run.startedAt >= RULES.limitMs), { modelTier: "quick", cache: false });
    const msgs = (Array.isArray(r.messages) ? r.messages : []).filter(m => m && m.text && run.states[m.who] && (run.states[m.who].ending !== "cold" || run.states[m.who].justEndedNow)).slice(0,3);
    for (const c of ch0()) delete run.states[c.call].justEnded;
    const shown = await playReplies(msgs, r.pauseSec, group);
    for (const m of shown) run.messages.push({ from: m.who, text: m.text, at: Date.now() }); last = shown.at(-1) || null; if (last) app.lastSpeaker = last.who;
    if (!shown.length) addSys("（已讀，沒有人回覆）");
  } catch (e) { setTyping(null); addSys(errCopy(e)); }
  finally {
    for (const c of ch0()) delete run.states[c.call].justEndedNow;
    setBusy(false);
    const st = Object.values(run.states);
    if (!run.ending && st.every(s => s.ending)) { await sleep(1500); finishCh0("done"); }
    else if (!run.ending && Date.now() - run.startedAt >= RULES.limitMs) { await sleep(1200); finishCh0("pending", true); }
    else if (!run.ending){ $("msgInput").focus(); if (last) maybeWheel(last.text, last.who); }
  }
}
async function sendCh0(text, auto, preset){
  const run = app.cur; if (!text || app.busy || run.ending) return;
  $("msgInput").value = ""; delete $("msgInput").dataset.auto;
  const group = ch0().length > 1;
  const el = addMsg("me", text, auto, group); run.messages.push({ from: "me", text, at: Date.now(), auto: !!auto });
  setBusy(true);
  try {
    const ctx = { people: ch0().map(c => ({ name: c.call, concerns: c.concerns })), situation: `玩家要談：${app.setup.decision}`, facts: allFacts(run), recent: recentText(run) };
    const spec = preset ? null : sample.json(ch0ReplyPrompt(run, false, Date.now() - run.startedAt >= RULES.limitMs), { modelTier: "quick", cache: false }); spec?.catch(() => {});
    run.spec = spec;
    const cls = preset ? { intents: preset.intents, targets: preset.targets || [], addressed: {}, newFacts: [], contradicts: false, confidence: 1 } : await sample.json(classifyPrompt(ctx, text), { modelTier: "quick", cache: false });
    if (cls.distress && !auto){ finishCh0("help"); return; }
    if ((cls.confidence ?? 1) < 0.5) cls.intents = ["avoid"];
    for (const f of (cls.newFacts || [])) if (f && !run.facts.includes(f)) run.facts.push(f);
    if (cls.memorable) run.memories.push(`第 0 章你說過：${cls.memorable}`);
    const targets = (Array.isArray(cls.targets) && cls.targets.filter(t => run.states[t]).length) ? cls.targets.filter(t => run.states[t]) : ch0().map(c => c.call);
    const entry = { text, auto: !!auto, targets, intents: cls.intents || [], people: {} };
    for (const who of targets){ const before = run.states[who]; if (before.ending) continue;
      const after = applyTurn(before, { intents: cls.intents, addressed: (cls.addressed || {})[who] || [], contradicts: cls.contradicts });
      if (after.ending){ after.justEnded = after.ending; after.justEndedNow = true; }
      run.states[who] = after; entry.people[who] = { trust: after.trust, respect: after.respect, stage: after.stage, ending: after.ending }; }
    run.log.push(entry);
  } catch (e) { run.messages.pop(); el.remove(); $("msgInput").value = text; addSys(errCopy(e)); setBusy(false); return; }
  const sp = run.spec; run.spec = null; await ch0Respond(run, false, sp);
}
function ch0Summary(run){ return ch0().map(c => `${c.call}${ENDING_TEXT[run.states[c.call].ending || "pending"]}`).join("；"); }
async function finishCh0(ending, byTimer){
  const run = app.cur; if (run.ending) return;
  cancelWheel(); hideHotMenu(); run.ending = ending; clearInterval(app.timer); setBusy(false);
  if (ending === "help"){ show("helpView"); return; }
  if (byTimer){ setTyping(null); addSys("（時間到了）"); await sleep(800); }
  const after = app.setup.mode === "after";
  app.ch0Summary = (after ? `先斬後奏，已經決定走「${pathName(app.chosenPath)}」才告訴大家。` : "") + (ending === "quit" ? `你先離開了對話（${ch0Summary(run)}）` : ch0Summary(run));
  $("pathEyebrow").textContent = "第 0 章 · 結束"; $("ch0Result").hidden = false;
  $("pathTitle").textContent = after ? "說完了。事情已經定了。" : "說完了。你最後選哪一條？";
  $("pathNote").textContent = after ? "他們剛才的反應會帶進接下來的三年。故事從下個月開始。" : "剛才的對話會影響接下來你跟他們的關係。現在做出你真正的選擇，故事從下個月開始。";
  const box = $("ch0Result"); box.innerHTML = "";
  for (const c of ch0()){ const s = run.states[c.call]; const p = document.createElement("p");
    p.textContent = `${c.call}：${ENDING_TEXT[s.ending || "pending"]}（信任${lvl(s.trust)}、覺得被尊重${lvl(s.respect)}）`; box.appendChild(p); }
  const pb = $("pathBtns"); pb.innerHTML = "";
  showFeedback(run); $("emoPath").hidden = true;
  if (app.quick){ $("pathTitle").textContent = "說完了。"; $("pathNote").textContent = "5 分鐘版到這裡結束。可以換個說法再講一次，或補完資料，看選了之後的三年。";
    emoCheck("emoPath");
    const mk = (t, cls, fn) => { const b = document.createElement("button"); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; pb.appendChild(b); };
    mk("再講一次", "primary", () => beginMode(true)); mk("補完資料，看接下來三年", "", () => { setQuick(false); show("setupView"); $("f_who").focus(); }); mk("回到開頭", "", () => { setQuick(false); show("introView"); });
    show("pathView"); return; }
  if (after){ const b = document.createElement("button"); b.className = "primary"; b.textContent = `繼續：走「${pathName(app.chosenPath)}」的三年`; b.onclick = () => beginYears(app.chosenPath); pb.appendChild(b); }
  else for (const p of ["A","B"]){ const b = document.createElement("button"); b.className = p === app.setup.leanKey ? "primary" : "";
    b.textContent = `${p}：${pathName(p)}`; b.onclick = () => beginYears(p); pb.appendChild(b); }
  show("pathView");
}

/* ===================== 生活畫面（程式畫的插畫，不畫臉） ===================== */
function hh(n){ let x = Math.imul((n | 0) ^ 0x9E3779B9, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
const LOCNAME = { family: "家裡的房間", rented: "租屋處", office: "公司", lab: "實驗室", hospital: "醫院", cafe: "咖啡店", dinner: "家裡的餐桌" };
const EV_SCENE = {
  health: { loc: "hospital", hour: 10 }, family: { loc: "dinner", hour: 19 }, foundout: { loc: "dinner", hour: 20 }, future: { loc: "dinner", hour: 19 },
  money: { loc: "home", hour: 23, mode: "bills" }, burnout: { loc: "home", hour: 1, mode: "bed" }, peer: { loc: "home", hour: 0, mode: "phone" },
  partner: { loc: "cafe", hour: 19 }, crossroad: { loc: "cafe", hour: 15 }, review: { loc: "work", hour: 10 }, win: { loc: "work", hour: 16 }, workload: { loc: "work", hour: 17 },
};
function timeOf(h){ return h >= 5 && h < 9 ? "morning" : h >= 9 && h < 17 ? "day" : h >= 17 && h < 19 ? "evening" : "night"; }
function dayCtx(w, d = Math.max(1, w.day)){
  const dt = dayDate(w, d); const m = dt.getMonth(); const we = dt.getDay() === 0 || dt.getDay() === 6;
  const rainP = [.25,.3,.3,.35,.5,.55,.4,.45,.4,.25,.25,.28][m]; const r = hh(d * 7 + 1);
  const weather = r < rainP ? "rain" : r < rainP + .25 ? "cloud" : "clear";
  const temp = Math.round([16,16,18,22,25,28,30,30,28,25,21,18][m] + (hh(d * 7 + 2) - .5) * 4 - (weather === "rain" ? 2 : 0));
  const season = ["winter","winter","spring","spring","spring","summer","summer","summer","autumn","autumn","autumn","winter"][m];
  const work = /研究所|讀|碩|博|學校|研究|升學|唸書|念書/.test(pathName(w.path)) ? "lab" : "office";
  const homeKind = /爸媽|家裡|老家|跟家人|父母/.test(app.setup.live || "") ? "family" : "rented";
  const late = !we && (w.energy < 40 || hh(d * 7 + 3) < .25);
  const hour = we ? 10 + Math.floor(hh(d * 7 + 4) * 8) : late ? 22 + Math.floor(hh(d * 7 + 4) * 2) : 18 + Math.floor(hh(d * 7 + 4) * 4);
  const loc = we ? homeKind : late ? (hh(d * 7 + 6) < .5 ? work : homeKind) : hour >= 20 ? homeKind : work;
  return { d, dt, m, we, weather, temp, season, hour, min: Math.floor(hh(d * 7 + 5) * 60), loc, work, homeKind, mode: "" };
}
function eventCtx(w, ev){
  const c = dayCtx(w); const o = EV_SCENE[ev.id] || {};
  if (o.loc) c.loc = o.loc === "home" ? c.homeKind : o.loc === "work" ? c.work : o.loc;
  if (o.hour !== undefined) c.hour = o.hour; c.mode = o.mode || ""; return c;
}
function msgCaption(c){ const hm = `${c.hour < 10 ? "0" : ""}${c.hour}:${String(c.min ?? 10).padStart(2, "0")}`; return c.msg === "bed" ? `${hm}，躺在床上，房間燈關了` : c.bills ? `${hm}，書桌前，帳單攤在旁邊` : `${hm}，房間書桌前`; }
function sceneCaption(c){
  const wt = { rain: "下雨", cloud: "陰天", clear: c.hour >= 19 || c.hour < 5 ? "晴朗的夜晚" : "晴天" }[c.weather];
  return `${dayDateLabel(c)} ${String(c.hour).padStart(2,"0")}:${String(c.min).padStart(2,"0")} · ${LOCNAME[c.loc] || ""} · ${wt} ${c.temp}°C`;
}
function dayDateLabel(c){ return `週${WD[c.dt.getDay()]}`; }
function person(x, y, col, opt = {}){ // 背影或側影，不畫臉
  const s = opt.scale || 1; const hr = 15 * s;
  let g = `<g transform="translate(${x},${y})">`;
  g += `<path d="M${-24*s},${40*s} Q${-24*s},${4*s} 0,${2*s} Q${24*s},${4*s} ${24*s},${40*s} Z" fill="${col}"/>`;
  g += `<circle cx="0" cy="${-12*s}" r="${hr}" fill="${opt.hair || "#2B2F38"}"/>`;
  if (opt.phone) g += `<rect x="${10*s}" y="${4*s}" width="${8*s}" height="${13*s}" rx="2" fill="#CFE6FF"/><circle cx="${14*s}" cy="${10*s}" r="${18*s}" fill="#CFE6FF" opacity=".18"/>`;
  return g + `</g>`;
}
function sceneSVG(w, c, id){
  const Wd = 640, Ht = 300; const t = timeOf(c.hour); const dark = t === "night";
  const SKY = { morning: ["#CFE6F2","#F6E2C2"], day: ["#86BDE3","#DDEFF8"], evening: ["#F0A066","#6A6EA6"], night: ["#121831","#2C3762"] }[t];
  const sky = c.weather === "rain" ? (dark ? ["#0F1424","#232B40"] : ["#8B97A3","#B9C3CC"]) : c.weather === "cloud" && !dark ? ["#A9BBC9","#DCE4EA"] : SKY;
  const WALL = { family: "#EFE4D2", rented: "#E3DED5", office: "#E2E7EB", lab: "#DFE6E0", hospital: "#E4EEEB", cafe: "#E7D6BF", dinner: "#F0E3CE" }[c.loc] || "#E6E2DA";
  const FLOOR = { office: "#AEB7BE", lab: "#B5BDB6", hospital: "#C5D1CE" }[c.loc] || "#B89C7A";
  const R = k => hh(c.d * 31 + k);
  const bg = c.mode === "bg";
  const partnerKey = app.cards.find(x => x.rel === "伴侶")?.call;
  let s = `<svg viewBox="0 0 ${Wd} ${Ht}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${sceneCaption(c)}">`;
  s += `<defs><linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>`;
  s += `<radialGradient id="glow${id}"><stop offset="0" stop-color="#FFE9B0" stop-opacity=".75"/><stop offset="1" stop-color="#FFE9B0" stop-opacity="0"/></radialGradient>`;
  s += `<clipPath id="win${id}"><rect x="40" y="34" width="${c.loc === "cafe" ? 330 : 200}" height="150"/></clipPath></defs>`;
  s += `<rect width="${Wd}" height="${Ht}" fill="${WALL}"/>`;
  // 窗外
  const ww = c.loc === "cafe" ? 330 : 200;
  s += `<g clip-path="url(#win${id})"><rect x="40" y="34" width="${ww}" height="150" fill="url(#sky${id})"/>`;
  if (c.weather !== "rain"){ if (dark) s += `<circle cx="${40 + ww*.75}" cy="62" r="10" fill="#F2EFD9"/>`; else if (c.weather === "clear") s += `<circle cx="${40 + ww*.75}" cy="${t === "evening" ? 150 : 66}" r="15" fill="${t === "evening" ? "#FFC27A" : "#FFE7A3"}"/>`; }
  s += `<g class="drift">`;
  if (c.weather !== "clear") for (let i = 0; i < 3; i++) s += `<ellipse cx="${60 + i*70 + R(i)*30}" cy="${60 + R(i+5)*30}" rx="38" ry="12" fill="${c.weather === "rain" ? (dark ? "#2A3348" : "#7F8B97") : "#FFFFFF"}" opacity=".8"/>`;
  s += `</g>`;
  for (let i = 0; i < 8; i++){ const bx = 40 + i * ww / 8, bh = 40 + hh(i * 13 + 7) * 70, by = 184 - bh;
    s += `<rect x="${bx}" y="${by}" width="${ww/8 - 3}" height="${bh}" fill="${dark ? "#262D49" : c.weather === "rain" ? "#7E8894" : "#9AA8B6"}"/>`;
    if (dark) for (let j = 0; j < 6; j++) if (hh(i*50 + j + c.d % 7) < .45) s += `<rect x="${bx + 4 + (j%2)*9}" y="${by + 6 + Math.floor(j/2)*12}" width="5" height="6" fill="#F5D676"/>`; }
  const TREE = { spring: "#8FC47E", summer: "#3F8650", autumn: "#C98238", winter: "#7D8C70" }[c.season];
  s += `<rect x="62" y="140" width="6" height="44" fill="#5B4636"/>`;
  if (c.season !== "winter" || R(3) < .5) s += `<circle cx="65" cy="134" r="22" fill="${TREE}"/><circle cx="50" cy="146" r="14" fill="${TREE}"/><circle cx="82" cy="146" r="15" fill="${TREE}"/>`;
  if (c.season === "spring") for (let i = 0; i < 6; i++) s += `<circle cx="${48 + R(i+20)*36}" cy="${124 + R(i+30)*26}" r="2.5" fill="#F4B6C8"/>`;
  if (c.weather === "rain") s += `<g class="rainfx">`;
  if (c.weather === "rain") for (let i = 0; i < 26; i++){ const rx = 40 + R(i+40) * ww, ry = 34 + R(i+70) * 150; s += `<line x1="${rx}" y1="${ry}" x2="${rx - 4}" y2="${ry + 12}" stroke="#D6E4F0" stroke-width="1.2" opacity=".7"/>`; }
  if (c.weather === "rain") s += `</g>`;
  s += `</g><rect x="40" y="34" width="${ww}" height="150" fill="none" stroke="#FAF8F3" stroke-width="8"/>`;
  if (c.loc !== "cafe") s += `<line x1="140" y1="34" x2="140" y2="184" stroke="#FAF8F3" stroke-width="5"/><line x1="40" y1="109" x2="240" y2="109" stroke="#FAF8F3" stroke-width="5"/>`;
  // 地板
  s += `<rect y="252" width="${Wd}" height="48" fill="${FLOOR}"/><rect y="250" width="${Wd}" height="3" fill="#00000018"/>`;
  const desk = (x, wdt, col) => `<rect x="${x}" y="196" width="${wdt}" height="9" fill="${col}"/><rect x="${x + 6}" y="205" width="6" height="47" fill="${col}"/><rect x="${x + wdt - 12}" y="205" width="6" height="47" fill="${col}"/>`;
  const laptop = (x) => `<path d="M${x},196 l6,-36 h62 l6,36 Z" fill="#3A404A"/><path d="M${x+10},192 l5,-28 h54 l5,28 Z" fill="${dark ? "#BFD8FF" : "#DDE7F2"}"/>${dark ? `<circle cx="${x+40}" cy="178" r="60" fill="#BFD8FF" opacity=".12"/>` : ""}`;
  const props = (x) => { let p = "";
    if (w.money < w.exp() * 2) p += `<path d="M${x},196 l3,-18 h18 l3,18 Z" fill="#F1EADB"/><rect x="${x+2}" y="183" width="20" height="4" fill="#C8473B"/>`;
    if (w.growth >= 60) p += `<rect x="${x+30}" y="186" width="34" height="10" fill="#4C6A8C"/><rect x="${x+32}" y="177" width="30" height="9" fill="#8C5A4C"/><rect x="${x+29}" y="169" width="33" height="8" fill="#6C8C5A"/>`;
    if (partnerKey && (w.rel[partnerKey] ?? 0) >= 70) p += `<rect x="${x+72}" y="170" width="20" height="26" fill="#FFFFFF" stroke="#8B6B4A" stroke-width="3"/>`;
    if (w.energy >= 60) p += `<rect x="${x+100}" y="182" width="14" height="14" fill="#B5763F"/><circle cx="${x+107}" cy="174" r="10" fill="#5E9B5E"/>`;
    return p; };
  const mess = () => { let p = ""; if (w.energy < 35) for (let i = 0; i < 7; i++){ const px = 270 + R(i+90) * 330, py = 258 + R(i+95) * 30; p += `<rect x="${px}" y="${py}" width="22" height="14" fill="${["#FFFFFF","#E9E2D0","#6B7A99","#C9A06B"][i % 4]}" transform="rotate(${R(i)*60-30} ${px} ${py})"/>`; } return p; };
  const lamp = (x) => `<rect x="${x}" y="190" width="18" height="6" fill="#444"/><line x1="${x+9}" y1="190" x2="${x+22}" y2="150" stroke="#444" stroke-width="3"/><path d="M${x+12},150 h24 l-6,-12 h-12 Z" fill="#555"/>`;
  const loc = c.loc;
  if (loc === "family" || loc === "rented"){
    if (loc === "rented") s += `<rect x="20" y="214" width="210" height="38" fill="#7C8FA6"/><rect x="20" y="200" width="60" height="20" rx="6" fill="#EDEAE3"/><rect x="80" y="206" width="150" height="14" fill="#A9B7C7"/>`;
    else s += `<rect x="20" y="120" width="12" height="132" fill="#9A7A58"/><rect x="250" y="70" width="60" height="182" fill="#C7AC86"/><rect x="256" y="80" width="48" height="76" fill="#B89A72"/><rect x="256" y="164" width="48" height="76" fill="#B89A72"/>`;
    if (c.mode === "bed"){
      s += `<rect x="330" y="200" width="290" height="52" fill="#6F7F99"/><rect x="330" y="186" width="70" height="22" rx="8" fill="#EDEAE3"/>`;
      s += `<path d="M380,200 Q420,176 520,186 Q600,190 610,206 L610,214 L380,214 Z" fill="#8A9AB4"/><circle cx="378" cy="192" r="14" fill="#2B2F38"/><rect x="396" y="176" width="9" height="14" rx="2" fill="#CFE6FF"/><circle cx="400" cy="183" r="26" fill="#CFE6FF" opacity=".18"/>`;
    } else {
      s += desk(330, 280, "#8B6B4A") + laptop(450) + props(340) + (dark ? lamp(570) : "");
      if (c.mode === "bills") for (let i = 0; i < 4; i++) s += `<rect x="${360 + i*18}" y="${189 - i*2}" width="26" height="8" fill="#FFFFFF" stroke="#D9D2C4" transform="rotate(${i*6-8} ${360+i*18} 190)"/>`;
      s += `<rect x="458" y="214" width="56" height="8" fill="#5A4636"/><rect x="482" y="222" width="8" height="30" fill="#5A4636"/>`;
      s += person(486, 194, "#4F6D8A", { phone: c.mode === "phone" });
    }
    s += mess();
  } else if (loc === "office"){
    s += `<rect x="270" y="20" width="140" height="10" fill="#FFFFFF" opacity=".8"/><rect x="460" y="20" width="140" height="10" fill="#FFFFFF" opacity=".8"/>`;
    s += `<rect x="260" y="150" width="370" height="46" fill="#9AA6B0"/>`;
    if (!bg){
      s += person(330, 140, "#7A8B6E", { scale: .8 }) + person(560, 142, "#8B6E7A", { scale: .8 });
      s += desk(250, 380, "#D5DADE") + `<rect x="400" y="150" width="80" height="44" fill="#2F343C"/><rect x="404" y="154" width="72" height="36" fill="${dark ? "#BFD8FF" : "#DDE7F2"}"/><rect x="436" y="194" width="8" height="4" fill="#2F343C"/>`;
      if (w.growth >= 60) s += `<rect x="490" y="156" width="66" height="38" fill="#2F343C"/><rect x="494" y="160" width="58" height="30" fill="#E6EEF5"/><polyline points="498,184 512,176 526,180 546,166" fill="none" stroke="#3E8E6A" stroke-width="2"/>`;
      s += props(270) + `<rect x="412" y="214" width="56" height="8" fill="#333"/><rect x="436" y="222" width="8" height="30" fill="#333"/>` + person(440, 194, "#4F6D8A") + mess();
    }
  } else if (loc === "lab"){
    s += `<rect x="262" y="36" width="160" height="96" fill="#FBFBF8" stroke="#B7BDB8" stroke-width="4"/>`;
    for (let i = 0; i < 4; i++) s += `<path d="M${276},${54 + i*18} q20,-8 40,0 t40,0 t40,0" fill="none" stroke="${["#3C6EA8","#B0443A","#3C6EA8","#2E7D4F"][i]}" stroke-width="2" opacity="${.5 + R(i+60)*.5}"/>`;
    s += `<rect x="460" y="30" width="150" height="160" fill="#A08462"/>`;
    for (let r2 = 0; r2 < 3; r2++){ s += `<rect x="460" y="${80 + r2*50}" width="150" height="5" fill="#7E6548"/>`;
      for (let i = 0; i < 9; i++) s += `<rect x="${466 + i*15 + (r2%2)*3}" y="${44 + r2*50}" width="11" height="36" fill="${["#4C6A8C","#8C5A4C","#6C8C5A","#C9A44C","#5A5A7A"][(i + r2) % 5]}"/>`; }
    if (!bg){
      s += desk(300, 300, "#C9CFC8") + laptop(410) + props(310) + (dark ? lamp(560) : "");
      s += `<rect x="418" y="214" width="56" height="8" fill="#333"/><rect x="442" y="222" width="8" height="30" fill="#333"/>` + person(446, 194, "#4F6D8A") + mess();
    }
  } else if (loc === "hospital"){
    s += `<rect x="300" y="44" width="150" height="36" rx="4" fill="#2E7D6F"/><text x="375" y="69" text-anchor="middle" font-size="18" fill="#FFFFFF" font-family="sans-serif">候診區</text>`;
    s += `<rect x="470" y="24" width="120" height="8" fill="#FFFFFF"/><rect x="290" y="24" width="120" height="8" fill="#FFFFFF"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${290 + i*64}" y="206" width="54" height="10" fill="#3F7FB0"/><rect x="${290 + i*64}" y="176" width="54" height="30" rx="4" fill="#4D8FC2"/><rect x="${312 + i*64}" y="216" width="8" height="36" fill="#7A8A96"/>`;
    if (!bg) s += person(381, 172, "#4F6D8A", { phone: true }) + person(509, 174, "#9A7A6E", { scale: .95, hair: "#8E8E8E" });
  } else if (loc === "cafe"){
    s += `<rect x="400" y="40" width="200" height="90" fill="#6E4B32"/><text x="500" y="72" text-anchor="middle" font-size="15" fill="#F3E3C8" font-family="sans-serif">今日咖啡</text><line x1="420" y1="88" x2="580" y2="88" stroke="#F3E3C8" stroke-width="1.5"/><line x1="420" y1="104" x2="560" y2="104" stroke="#F3E3C8" stroke-width="1.5"/>`;
    if (!bg){
      s += person(330, 186, "#4F6D8A") + person(470, 180, "#B07A8C", { scale: .95 });
      s += `<ellipse cx="400" cy="214" rx="90" ry="12" fill="#5C4030"/><rect x="396" y="214" width="8" height="38" fill="#5C4030"/><rect x="376" y="198" width="16" height="14" rx="3" fill="#FFFFFF"/><rect x="410" y="198" width="16" height="14" rx="3" fill="#FFFFFF"/>`;
    }
  } else if (loc === "dinner"){
    s += `<rect x="300" y="30" width="20" height="40" fill="#8B6B4A"/><path d="M290,70 h40 l-8,14 h-24 Z" fill="#F4D58D"/>`;
    if (!bg){
      s += person(400, 150, "#9A6B5B", { scale: .9, hair: "#3B3B3B" }) + person(500, 150, "#5B6B7A", { scale: .9, hair: "#555" });
      s += `<rect x="300" y="196" width="300" height="12" fill="#8B6B4A"/><rect x="316" y="208" width="8" height="44" fill="#8B6B4A"/><rect x="576" y="208" width="8" height="44" fill="#8B6B4A"/>`;
      for (let i = 0; i < 4; i++) s += `<ellipse cx="${360 + i*60}" cy="194" rx="16" ry="5" fill="#F5F1E8"/><path d="M${346 + i*60},192 q14,-12 28,0" fill="${["#D9A441","#7FA35A","#C25B3F","#E8E1CF"][i]}"/>`;
      s += person(450, 222, "#4F6D8A", { scale: 1.15 });
    }
  }
  if (bg) s += "<!--TALK-->";
  if (dark){ const indoorLit = loc === "office" || loc === "hospital" || loc === "cafe" || loc === "dinner";
    s += `<rect width="${Wd}" height="${Ht}" fill="#0A0F25" opacity="${indoorLit ? .12 : .42}"/>`;
    if (!indoorLit && c.mode !== "bed") s += `<circle cx="560" cy="180" r="140" fill="url(#glow${id})"/>`; }
  if (t === "evening") s += `<rect width="${Wd}" height="${Ht}" fill="#F0A066" opacity=".08"/>`;
  return s + `</svg>`;
}
function day3dSpec(w, c){ const partner = app.cards.find(x => x.rel === "伴侶")?.call;
  const ov = w.todayMode && w.todayMode.day === w.day ? w.todayMode.mode : null;
  const mode = c.mode || ov || (c.we && ["family", "rented"].includes(c.loc) && hh(c.d * 7 + 9) < .35 ? "phone" : "work");
  const loc = ov === "bed" ? c.homeKind : c.loc, hour = ov === "bed" ? 23 : c.hour;
  return { loc, hour, weather: c.weather, season: c.season, dayMode: mode, people: [],
    props: { noodles: w.money < w.exp() * 2, books: w.growth >= 60, plant: w.energy >= 60, frame: !!partner && (w.rel[partner] ?? 0) >= 70, mess: w.energy < 35, bills: mode === "bills" } }; }
function drawScene(el, capEl, w, c, id){
  if (id === "m" && use3D()){
    if (!el.classList.contains("three")){ el.innerHTML = ""; el.classList.add("three"); if (app.day3d) el.appendChild(app.day3d.renderer.domElement); }
    if (!app.day3d){ app.day3d = Stage3D.create(el, { touch: "pan-y" }); app.day3d.onSound = sfx3d; app.day3d.onHot = id => { if (id && DAY_ACT[id]) dayAct(id); }; app.day3d.onHover = onDayHover; }
    const now = Date.now(); if (!app.day3d.spec || !app.playTimer || now - (app.day3dAt || 0) > 2500){ app.day3dAt = now; app.day3d.setLighting(day3dSpec(w, c)); }
    app.day3d.resize(); if (!$("dayView").hidden) app.day3d.start();
    el.setAttribute("aria-label", sceneCaption(c)); if (capEl) capEl.textContent = sceneCaption(c); return; }
  if (id === "m"){ el.classList.remove("three"); app.day3d?.stop(); }
  el.innerHTML = sceneSVG(w, c, id); el.setAttribute("aria-label", sceneCaption(c)); if (capEl) capEl.textContent = sceneCaption(c); }

/* ===================== 三年：一天一天 ===================== */
function beginYears(path){
  const w = W(makeWorld(app.setup, app.cur, path, Math.floor(Math.random() * 1e9)));
  w.memories = [...app.cur.memories]; w.mode = app.setup.mode; w.secret = app.setup.mode === "alone"; w.branchFrom = "第 0 章";
  app.world = w; app.snaps = [];
  enterDays(w, `你走上了「${pathName(path)}」。`);
}
function enterDays(w, note){
  stopPlay(); $("feed").innerHTML = ""; $("evPanel").hidden = true; $("dStatus").textContent = ""; $("qStatus").textContent = "";
  renderQueries(w); renderChips(w);
  if (note) addFeed(w, note, "big");
  maybeFetch(w); renderDayHead(w); setControls(true); show("dayView");
}
function snapshot(w){ return JSON.parse(JSON.stringify(w)); }
function restore(s){ return W(JSON.parse(JSON.stringify(s))); }
function statStrip(w, prev){
  const p = $("statPanel"); p.innerHTML = "";
  const box = document.createElement("div"); box.className = "stats";
  const r = Math.round;
  const items = [["存款", `NT$${r(w.money/1000)}k`, prev ? w.money - prev.money : 0, null, true], ["精力", r(w.energy), prev ? r(w.energy - prev.energy) : 0, w.energy], ["成長", r(w.growth), prev ? r(w.growth - prev.growth) : 0, w.growth], ["動搖", r(w.doubt), prev ? r(w.doubt - prev.doubt) : 0, w.doubt, false, true]];
  for (const [label, val, d, bar, money, inverse] of items){
    const s = document.createElement("div"); s.className = "stat";
    const sm = document.createElement("small"); sm.textContent = label + (prev ? "（比月初）" : ""); s.appendChild(sm);
    const b = document.createElement("b"); b.textContent = val; s.appendChild(b);
    const dd = money ? r(d / 1000) : d;
    if (dd){ const ds = document.createElement("span"); ds.className = "d " + ((inverse ? dd < 0 : dd > 0) ? "up" : "down"); ds.textContent = (dd > 0 ? "+" : "") + (money ? `${dd}k` : dd); s.appendChild(ds); }
    if (bar !== null && bar !== undefined){ const br = document.createElement("div"); br.className = "bar"; const i = document.createElement("i"); i.style.width = bar + "%"; br.appendChild(i); s.appendChild(br); }
    box.appendChild(s);
  }
  p.appendChild(box);
  const rels = document.createElement("div"); rels.className = "rels";
  for (const [k, v] of Object.entries(w.rel)){ const x = document.createElement("span"); x.className = "rel"; x.textContent = `${relName(k)} · 關係${lvl(v)}`; rels.appendChild(x); }
  const pathTag = document.createElement("span"); pathTag.className = "rel"; pathTag.textContent = `走的路：${pathName(w.path)}`; rels.prepend(pathTag);
  p.appendChild(rels);
}
function renderDayHead(w){
  $("dEyebrow").textContent = w.day ? `「${pathName(w.path)}」${sinceText(w)} · 還有 ${WORLD.days - w.day} 天` : `「${pathName(w.path)}」· 明天開始`;
  $("dDate").textContent = w.day ? dayLabel(w) : dayLabel(w, 1);
  statStrip(w, w.day ? w.ref : null);
  const dc = dayCtx(w); drawScene($("scene"), $("sceneCap"), w, dc, "m"); if ($("evPanel").hidden) playScape(dc); renderDayActs(w);
}
function addFeed(w, text, cls){
  const row = document.createElement("div"); row.className = "fd" + (cls ? " " + cls : "");
  const a = document.createElement("small"); a.textContent = w.day ? shortDay(w) : ""; const b = document.createElement("span"); b.textContent = text;
  row.append(a, b); $("feed").prepend(row);
  while ($("feed").children.length > 150) $("feed").lastChild.remove();
}
const pickR = arr => arr[Math.floor(Math.random() * arr.length)];
function templateLine(w, dt){
  const we = dt.getDay() === 0 || dt.getDay() === 6;
  const ppl = [...app.cards.map(c => c.call), ...Object.values(w.npcs).map(n => n.name)];
  if (Math.random() < 0.22 && ppl.length) return `${pickR(ppl)}：「${pickR(["吃飯了沒","最近還好嗎","週末有空嗎","你看這個哈哈","在忙嗎","記得早點睡"])}」`;
  if (w.energy < 35) return pickR(["很累，回到家就躺平了。","早上差點起不來。","整天提不起勁，事情拖到很晚。","頭有點痛，早點睡了。"]);
  if (w.money < w.exp() * 2) return pickR(["看了一下存款，默默把購物車清空。","這個月要再省一點。","午餐吃便利商店就好。"]);
  if (we) return pickR(["週末，睡到快中午。","週末在家整理東西。","出門走走，買了杯飲料。","週末補了一點進度。","跟朋友吃了頓飯。"]);
  return pickR(["照常忙了一天。","今天還算順利。","事情有點多，晚餐隨便吃。","忙完去走了一下。","今天學到一點新東西。","被交代了一件小事，做完了。"]);
}
function dayFeed(w){
  const dt = dayDate(w);
  if (dt.getDate() === 1) addFeed(w, `${dt.getMonth() + 1} 月了。存款大約 NT$${Math.round(w.money).toLocaleString()}。`, "sys");
  addFeed(w, w.monthLines[w.day] || templateLine(w, dt));
}
async function maybeFetch(w){
  if (w.fetching || w.day + 10 < w.nextFetchDay || w.nextFetchDay > WORLD.days) return;
  const from = w.nextFetchDay; w.nextFetchDay += 30; w.fetching = true;
  const days = new Set(); while (days.size < 7) days.add(from + Math.floor(Math.random() * 30));
  const list = [...days].filter(d => d <= WORLD.days).sort((a,b) => a - b);
  try {
    const r = await sample.json(monthPrompt(w, list), { modelTier: "quick", cache: false });
    if (app.world === w) for (const l of (r.lines || [])) if (l && list.includes(Number(l.day)) && l.text) w.monthLines[Number(l.day)] = String(l.text);
  } catch {} finally { w.fetching = false; }
}
app.playTimer = null; app.dayBusy = false;
function setControls(on){ for (const id of ["dNext","dPlay","dJump","dSpeed"]) $(id).disabled = !on; }
function stopPlay(){ clearInterval(app.playTimer); app.playTimer = null; $("dPlay").textContent = "▶ 自動播放"; if (app.world && $("evPanel").hidden && !$("dayView").hidden) playScape(dayCtx(app.world), true); }
function advanceOne(){
  const w = app.world; if (!w || app.dayBusy) return false;
  if (w.day >= WORLD.days){ stopPlay(); showFinal(); return false; }
  stepDay(w); dayFeed(w); maybeFetch(w);
  if (rollEvent(w)){ stopPlay(); renderDayHead(w); fireEvent(w); return false; }
  if (w.day >= WORLD.days){ stopPlay(); renderDayHead(w); setControls(false); addFeed(w, "三年到了。", "big"); setTimeout(showFinal, 1200); return false; }
  return true;
}
$("dNext").onclick = () => { advanceOne(); if (app.world) renderDayHead(app.world); };
$("dPlay").onclick = () => {
  if (app.playTimer){ stopPlay(); return; }
  $("dPlay").textContent = "⏸ 暫停";
  app.playTimer = setInterval(() => { const go = advanceOne(); renderDayHead(app.world); if (!go) stopPlay(); }, 1000 / Number($("dSpeed").value));
};
$("dSpeed").onchange = () => { if (app.playTimer){ stopPlay(); $("dPlay").click(); } };
$("dJump").onclick = () => { stopPlay(); let n = 0; while (advanceOne() && n++ < 1200); renderDayHead(app.world); };
function npcFor(w, role){
  const existing = w.npcs[role];
  const roleText = { boss: `跟你的工作或研究有關、能評估你的人（依你走的路：${pathName(w.path)}）`, peer: "走了另一條路的同學", partner: "你很重要的朋友或伴侶", other: "能提供另一條路機會的人", parent: "家人" }[role] || "相關的人";
  return existing ? { ...existing, roleText, isNew: false } : { name: "", roleText, isNew: true };
}
function fireEvent(w){
  app.snaps.push({ label: ymd(w), title: "", snap: snapshot(w) });
  const ev = pickEvent(w); w.used.push(ev.id); w.lastEventDay = w.day;
  app.snaps[app.snaps.length - 1].title = ev.title;
  const target = roleTarget(w, ev.role); const npc = target ? null : npcFor(w, ev.role);
  app.chapterEv = ev; app.chapterTarget = target; app.dayBusy = true; setControls(false);
  addFeed(w, `大事：${ev.title}`, "big");
  app.evCtx = eventCtx(w, ev); drawScene($("evScene"), $("evCap"), w, app.evCtx, "e"); playScape(app.evCtx, true);
  $("evEyebrow").textContent = `大事 · ${dayLabel(w)}`; $("evTitle").textContent = ev.title;
  $("evStory").textContent = "正在寫這一天⋯"; $("evNotifs").innerHTML = ""; $("evMoment").textContent = "";
  $("enterScene").disabled = true; $("skipScene").disabled = true; $("evPanel").hidden = false;
  $("evPanel").scrollIntoView({ block: "nearest" });
  loadEvent(w, ev, target, npc);
}
async function loadEvent(w, ev, target, npc){
  $("dStatus").textContent = ""; $("dStatus").classList.remove("error");
  try {
    const r = await sample.json(eventPrompt(w, ev, target, npc), { modelTier: "quick", cache: false });
    if (npc){ const name = npc.isNew ? (String(r.npcName || "").trim() || { boss: "主管", peer: "阿哲", partner: "小安", other: "學長" }[ev.role] || "他") : npc.name;
      w.npcs[ev.role] = { name, roleText: npc.roleText }; if (w.rel[`npc:${ev.role}`] === undefined) w.rel[`npc:${ev.role}`] = 55; }
    app.chapter = r; app.chapter.ev = ev;
    $("evStory").textContent = r.story || ev.desc;
    const nb = $("evNotifs"); nb.innerHTML = "";
    for (const n of (r.notifs || []).slice(0,2)){ const d = document.createElement("div"); d.className = "notif";
      const b = document.createElement("b"); b.textContent = n.who; b.style.color = colorOf(n.who); const s = document.createElement("span"); s.textContent = n.text; d.append(b, s); nb.appendChild(d); }
    const who = target || w.npcs[ev.role].name;
    $("evMoment").textContent = `${r.momentText || ev.desc}（對話對象：${who}）`;
    $("enterScene").disabled = false; $("skipScene").disabled = false; renderDayHead(w); renderChips(w);
  } catch (e) { $("dStatus").textContent = errCopy(e); $("dStatus").classList.add("error");
    const b = document.createElement("button"); b.className = "small"; b.textContent = "重試"; b.onclick = () => { b.remove(); loadEvent(w, ev, target, npc); }; $("dStatus").appendChild(b); }
}
function resumeDays(){
  const w = app.world; app.dayBusy = false; app.mode = "map";
  $("evPanel").hidden = true; show("dayView"); renderDayHead(w); renderChips(w);
  if (app.lastOutcome) addFeed(w, app.lastOutcome, "sys");
  if (w.day >= WORLD.days){ showFinal(); return; }
  setControls(true); $("dNext").focus();
}
/* 查一下 */
function renderChips(w){
  const box = $("qChips"); box.innerHTML = "";
  const parent = roleTarget(w, "parent");
  const qs = [`${parent}最近身體還好嗎？`, "我的錢還能撐多久？", ...app.cards.filter(c => c.call !== parent).slice(0, 2).map(c => `${c.call}最近在忙什麼？`), "走另一條路的人現在怎樣？"];
  for (const q of qs){ const b = document.createElement("button"); b.type = "button"; b.textContent = q; b.onclick = () => runQuery(q); box.appendChild(b); }
}
function renderQueries(w){
  const box = $("qAnswers"); box.innerHTML = "";
  for (const x of [...(w.queries || [])].reverse()) box.appendChild(qaNode(x));
}
function qaNode(x){
  const d = document.createElement("div"); d.className = "qa";
  const q = document.createElement("b"); q.textContent = x.q; const s = document.createElement("small"); s.textContent = `${x.date} · ${x.how || ""}`; const a = document.createElement("p"); a.textContent = x.answer;
  d.append(q, s, a); return d;
}
function openPhone(){ const w = app.world; if (!w) return; stopPlay(); if ($("qPanel").hidden) addFeed(w, "你拿起手機。", "sys"); $("qPanel").hidden = false; $("qInput").focus(); }
$("qClose").onclick = () => { $("qPanel").hidden = true; };
$("qForm").addEventListener("submit", e => { e.preventDefault(); const q = $("qInput").value.trim(); if (q) runQuery(q); });
async function runQuery(q){
  const w = app.world; if (!w || app.querying) return;
  stopPlay(); app.querying = true; $("qBtn").disabled = true; $("qStatus").classList.remove("error"); $("qStatus").textContent = "查詢中⋯";
  try {
    const r = await sample.json(queryPrompt(w, q), { modelTier: "quick", cache: false });
    if (app.world !== w) return;
    const x = { day: w.day, date: w.day ? shortDay(w) : "出發前", q, how: r.how || "", answer: r.answer || "（沒有查到什麼）", topic: r.topic || "other" };
    w.queries.push(x); if (r.fact) w.facts.push(`${x.date}：${r.fact}`); w.facts = w.facts.slice(-20);
    if (x.topic === "health"){ if (w.health < 60) w.healthKnown = true; const pk = roleTarget(w, "parent"); w.rel[pk] = clamp((w.rel[pk] ?? 55) + 2); }
    $("qAnswers").prepend(qaNode(x)); $("qInput").value = ""; $("qStatus").textContent = "";
    addFeed(w, `你查了：${q}`, "sys");
  } catch (e) { $("qStatus").textContent = errCopy(e); $("qStatus").classList.add("error"); }
  finally { app.querying = false; $("qBtn").disabled = false; }
}
$("enterScene").onclick = () => startScene();
$("skipScene").onclick = () => showChoices();
function startScene(){
  const w = app.world; const ev = app.chapterEv; const target = app.chapterTarget;
  const name = target || w.npcs[ev.role].name;
  app.mode = "scene";
  app.ui = TALK_EVENTS.includes(ev.id) ? "talk" : "chat";
  app.stage = app.ui === "talk" ? { ctx: { ...app.evCtx, mode: "bg" }, people: [name], w, enter: ["cafe","office","lab"].includes(app.evCtx.loc) } : null;
  app.msgCtx = app.ui === "chat" ? msgCtxFor({ ...app.evCtx, loc: ["family", "rented"].includes(app.evCtx.loc) ? app.evCtx.loc : app.evCtx.homeKind, mess: w.energy < 35 }, app.evCtx.mode === "bills" ? "desk" : "bed") : null;
  app.scene = { name, target, roleText: w.npcs[ev.role]?.roleText || "", relKey: target || `npc:${ev.role}`, story: app.chapter.story, moment: app.chapter.momentText || ev.desc, messages: [], turns: 0, done: false, line: "" };
  openChat(name, `${shortDay(w)} · ${ev.title}`, name);
  $("clock").textContent = `最多 ${WORLD.sceneMaxTurns} 句`; $("endChat").textContent = "做決定";
  if (app.ui !== "talk" && !msg3d()){ const fig = document.createElement("figure"); fig.className = "scene"; fig.innerHTML = sceneSVG(w, app.evCtx, "c"); $("msgs").appendChild(fig); playScape(app.evCtx, true); }
  else if (app.ui !== "talk") $("chatSub").textContent = `${ev.title} · ${msgCaption(app.msgCtx)}`;
  else $("chatSub").textContent = `${ev.title} · ${sceneCaption(app.evCtx)}`;
  const d = document.createElement("div"); d.className = "day"; d.textContent = sceneCaption(app.evCtx); $("msgs").appendChild(d);
  if (app.ui === "talk") addSys(app.scene.moment);
  setBusy(true);
  (async () => {
    if (app.stage?.enter && !fast() && !reduceMotion()) await sleep(app.stage.three ? 5600 : 3600);
    const op = String(app.chapter.opener || "").trim();
    if (op){ await playReplies([{ who: name, text: op }], 1, false); app.scene.messages.push({ from: name, text: op }); app.lastSpeaker = name; }
    setBusy(false); $("msgInput").focus(); if (op) maybeWheel(op, name);
  })();
}
async function sendScene(text, auto, preset){
  const sc = app.scene; const w = app.world; if (!text || app.busy || sc.done) return;
  $("msgInput").value = ""; delete $("msgInput").dataset.auto;
  const el = addMsg("me", text, auto, false); sc.messages.push({ from: "me", text, auto: !!auto });
  setBusy(true); let lastS = null;
  try {
    const ctx = { people: [{ name: sc.name }], situation: sc.moment, facts: app.setup.facts, recent: sc.messages.map(m => `${m.from === "me" ? "玩家" : m.from}：${m.text}`).join("\n") };
    const cls = preset ? { intents: preset.intents } : await sample.json(classifyPrompt(ctx, text), { modelTier: "quick", cache: false });
    if (cls.distress && !auto){ show("helpView"); return; }
    let d = 0; for (const i of (cls.intents || [])) d += WORLD.sceneIntent[i] || 0;
    w.rel[sc.relKey] = clamp((w.rel[sc.relKey] ?? 55) + d);
    if (cls.memorable) w.memories.push(`${ymd(w)}你對${sc.name}說過：${cls.memorable}`);
    if (!sc.line || (cls.intents || []).some(i => ["plan","defy","acknowledge"].includes(i))) sc.line = text;
    sc.turns += 1;
    await wait(1200 + Math.random() * 1500, 300);
    const r = await sample.json(sceneReplyPrompt(sc, w), { modelTier: "quick", cache: false });
    const msgs = (Array.isArray(r.messages) ? r.messages : []).filter(m => m && m.text).map(m => ({ who: sc.name, text: m.text, act: m.act })).slice(0,3);
    const shown = await playReplies(msgs, r.pauseSec, false);
    for (const m of shown) sc.messages.push({ from: sc.name, text: m.text }); lastS = shown.at(-1) || null; if (lastS) app.lastSpeaker = lastS.who;
  } catch (e) { sc.messages.pop(); el.remove(); $("msgInput").value = text; addSys(errCopy(e)); setBusy(false); return; }
  setBusy(false);
  if (sc.turns >= WORLD.sceneMaxTurns){ addSys("（該做決定了）"); await sleep(1200); endScene(); } else { $("msgInput").focus(); if (lastS) maybeWheel(lastS.text, lastS.who); }
}
function endScene(){ if (!app.scene || app.scene.done) return; cancelWheel(); hideHotMenu(); app.scene.done = true; setBusy(false); showChoices(); }
function showChoices(){
  const w = app.world; const ev = app.chapterEv; const r = app.chapter;
  $("choEyebrow").textContent = dayLabel(w);
  $("choTitle").textContent = `「${ev.title}」你要怎麼做？`;
  const box = $("choices"); box.innerHTML = ""; $("outcomeBox").hidden = true;
  for (const base of ev.choices){
    const c = (r.choices || []).find(x => x.id === base.id) || {};
    const b = document.createElement("button"); b.className = "choice";
    const t = document.createElement("b"); t.textContent = c.label || base.label; const s = document.createElement("small"); s.textContent = c.detail || "";
    b.append(t, s); b.onclick = () => choose(base, c, b); box.appendChild(b);
  }
  show("choiceView");
}
function choose(base, c, btn){
  const w = app.world; const ev = app.chapterEv;
  for (const b of $("choices").children) b.disabled = true; btn.style.borderColor = "var(--accent)";
  const fx = { ...base.fx };
  if (ev.id === "health" && w.healthKnown){ fx.rel_parent = (fx.rel_parent || 0) + 5; fx.energy = (fx.energy || 0) + 5; }
  const before = applyFx(w, fx, ev.role);
  const inScene = app.mode === "scene" && app.scene && !app.scene.used;
  w.log.push({ day: w.day, chapter: w.chapter, date: ymd(w), event: ev.id, target: app.chapterTarget || "", title: ev.title, choice: base.id, choiceLabel: c.label || base.label,
    sceneLine: inScene ? app.scene.line : "", sceneMessages: inScene ? app.scene.messages : [], path: w.path,
    after: { money: Math.round(w.money), energy: Math.round(w.energy), growth: Math.round(w.growth), doubt: Math.round(w.doubt) } });
  app.mode = "map"; if (app.scene) app.scene.used = true;
  const extra = (base.fx.switchPath ? `（你換到了「${pathName(w.path)}」。）` : "") + (ev.id === "health" && w.healthKnown ? "（因為你之前就有留意，這次處理得比較從容。）" : "");
  $("outcomeText").textContent = (c.outcome || "") + extra;
  app.lastOutcome = `你選了「${c.label || base.label}」。${c.outcome || ""}`;
  const ds = $("deltas"); ds.innerHTML = "";
  const R = Math.round;
  const parts = [["存款", R(w.money - before.money), true], ["精力", R(w.energy - before.energy)], ["成長", R(w.growth - before.growth)], ["動搖", R(w.doubt - before.doubt), false, true]];
  for (const [k, d, money, inverse] of parts){ if (!d) continue; const s = document.createElement("span"); s.className = (inverse ? d < 0 : d > 0) ? "up" : "down";
    s.textContent = `${k} ${d > 0 ? "+" : ""}${money ? `NT$${d.toLocaleString()}` : d}`; ds.appendChild(s); }
  for (const [k, v] of Object.entries(w.rel)){ const d = R(v - (before.rel[k] ?? v)); if (!d) continue; const s = document.createElement("span"); s.className = d > 0 ? "up" : "down"; s.textContent = `跟${relName(k)}的關係 ${d > 0 ? "+" : ""}${d}`; ds.appendChild(s); }
  if (!ds.children.length){ const s = document.createElement("span"); s.className = "note"; s.textContent = "表面上沒什麼變化。"; ds.appendChild(s); }
  $("nextChapter").textContent = "回到日常";
  $("outcomeBox").hidden = false; $("nextChapter").focus();
}
$("nextChapter").onclick = () => resumeDays();

/* ===================== 三年後 ===================== */
function moneyChart(hist, other){
  const W0 = 520, H0 = 160, pad = 34; const all = [...hist, ...(other || [])];
  const max = Math.max(...all, 1), min = Math.min(...all, 0);
  const x = i => pad + i * (W0 - pad * 1.5) / Math.max(1, (hist.length - 1));
  const y = v => H0 - 22 - (v - min) / (max - min || 1) * (H0 - 40);
  const line = arr => arr.map((v,i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  let s = `<svg class="chart" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="存款變化">`;
  s += `<line x1="${pad}" x2="${W0 - pad/2}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" stroke-width="1"/>`;
  if (other) s += `<path d="${line(other)}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 4"/>`;
  s += `<path d="${line(hist)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  hist.forEach((v,i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="2" fill="var(--accent)"/>`; if (i % 6 === 0) s += `<text x="${x(i)}" y="${H0 - 6}" text-anchor="middle">${i === 0 ? "開始" : i + " 個月"}</text>`; });
  const last = hist[hist.length - 1]; s += `<text x="${x(hist.length - 1)}" y="${y(last) - 8}" text-anchor="end">NT$${Math.round(last/1000)}k</text>`;
  return s + `</svg>`;
}
async function showFinal(){
  const w = app.world; stopPlay(); setControls(false); app.dayBusy = true;
  if (w.moneyHist[w.moneyHist.length - 1] !== Math.round(w.money)) w.moneyHist.push(Math.round(w.money));
  app.timelines.push(snapshot(w));
  const other = app.timelines.length > 1 ? app.timelines[app.timelines.length - 2] : null;
  $("finalTitle").textContent = `三年後 · ${monthLabel()}`;
  $("finalBody").hidden = true; $("finalStatus").textContent = "正在整理這三年⋯（約 20 到 60 秒）"; $("finalStatus").classList.remove("error");
  $("moneyChart").innerHTML = moneyChart(w.moneyHist, other?.moneyHist);
  const fr = $("finalRels"); fr.innerHTML = "";
  for (const [k, v] of Object.entries(w.rel)){ const r = document.createElement("span"); r.className = "rel"; r.textContent = `${relName(k)} · 關係${lvl(v)}`; fr.appendChild(r); }
  const tl = $("timeline"); tl.innerHTML = "";
  for (const l of w.log){ const row = document.createElement("div"); row.className = "tl";
    const a = document.createElement("small"); a.textContent = l.date; const b = document.createElement("div"); b.textContent = `${l.title}：${l.choiceLabel}`; row.append(a, b); tl.appendChild(row); }
  const rb = $("rewindBtns"); rb.innerHTML = "";
  app.snaps.forEach((sn, i) => { const b = document.createElement("button"); b.className = "small"; b.textContent = `${sn.label}「${sn.title}」重選`;
    b.onclick = () => { const s = restore(sn.snap); s.branchFrom = `${sn.label}「${sn.title}」`; app.world = s; app.snaps = app.snaps.slice(0, i);
      app.dayBusy = false; enterDays(s, `回到 ${sn.label}，重新面對「${sn.title}」。`); fireEvent(s); }; rb.appendChild(b); });
  const modeBtns = [["discuss","第 0 章改成：先談再決定"],["after","第 0 章改成：先斬後奏"],["alone","第 0 章改成：誰都不說"]];
  for (const [m, label] of modeBtns.reverse()){ if (m !== "alone" && !ch0().length) continue;
    const b = document.createElement("button"); b.className = "small"; b.textContent = label + (m === w.mode ? "（重來）" : ""); b.onclick = () => startCh0Again(m); rb.prepend(b); }
  const tx = $("transcript"); tx.innerHTML = "";
  for (const m of app.cur.messages){ const p = document.createElement("p"); p.textContent = `${m.from === "me" ? (m.auto ? "你（AI 代說）" : "你") : m.from}：${m.text}`; tx.appendChild(p); }
  $("copyStatus").textContent = ""; emoCheck("emoFinal"); show("finalView"); finalHopes(w).then(() => { const lt = app.timelines[app.timelines.length - 1]; if (lt && w.hopeReal) lt.hopeReal = w.hopeReal; });
  try {
    const r = await sample.json(finalPrompt(w, other ? { ...other, branchFrom: w.branchFrom } : null), { cache: false });
    w.final = r; app.timelines[app.timelines.length - 1].final = r;
    $("finalStory").textContent = r.story || "";
    const tu = $("turning"); tu.innerHTML = "";
    for (const t of (r.turning || [])){ const d = document.createElement("div"); d.className = "quote"; const q = document.createElement("q"); q.textContent = `${t.when}：${t.what}`; const s = document.createElement("small"); s.textContent = t.effect || ""; d.append(q, s); tu.appendChild(d); }
    $("saidCare").textContent = r.saidCare || ""; $("actualStance").textContent = r.actualStance || ""; $("gapNote").textContent = r.gapNote || "";
    $("saidDread").textContent = app.setup.dread ? `你也說過最怕：${app.setup.dread}` : "";
    const P = r.paths || {}, fill = (id, arr) => { const ul = $(id); ul.innerHTML = ""; for (const x of (Array.isArray(arr) ? arr : []).slice(0, 2)){ const li = document.createElement("li"); li.textContent = x; ul.appendChild(li); } };
    $("takenName").textContent = `你走的：${pathName(w.path)}`; $("otherName").textContent = `沒走的：${pathName(w.path === "A" ? "B" : "A")}`;
    fill("takenGain", P.taken?.gains); fill("takenCost", P.taken?.costs); fill("otherGain", P.other?.gains); fill("otherCost", P.other?.costs); $("otherSketch").textContent = P.other?.sketch || "";
    const qs = $("questions"); qs.innerHTML = ""; for (const q of (r.questions || []).slice(0,3)){ const li = document.createElement("li"); li.textContent = q; qs.appendChild(li); }
    if (r.compare){ $("compareText").textContent = r.compare; $("compareBox").hidden = false; } else $("compareBox").hidden = true;
    $("finalStatus").textContent = ""; $("finalBody").hidden = false;
  } catch (e) { $("finalStatus").textContent = errCopy(e); $("finalStatus").classList.add("error"); }
}
function startCh0Again(mode){ app.setup.mode = mode; beginMode(true); }
/* ===================== 還沒決定之前：先看看你想要的樣子 ===================== */
const HOPE_ACTS = ["talk", "listen", "laugh", "clap", "cheer", "wave", "hug", "eat", "sip", "type", "phone", "read", "look", "present", "walk", "idle"];
const HOPE_MAX = 3;
app.hopes = app.hopes || [];
function hopePrompt(text){
  const kits = Object.entries(window.Stage3D?.kits || {}).map(([k, v]) => `${k}＝${v}`).join("、");
  const ppl = (app.cards || []).map(c => `${c.call}（${c.rel}）`).join("、") || "（尚未設定）";
  return `你在一個人生演練工具裡，把玩家描述的「希望三年內出現的畫面」轉成可以用 3D 演出的場景設定。
玩家正在考慮的決定：${app.setup?.decision || "（未填）"}
玩家生活中的人：${ppl}
玩家描述的畫面：「${text}」
可用場景（kit 只能選一個 key）：${kits}
人物可做的動作 act：talk（說話）、listen（聽）、laugh（笑）、clap（鼓掌）、cheer（舉手歡呼）、wave（揮手）、hug（靠在一起）、eat（吃飯）、sip（喝東西）、type（打電腦）、phone（看手機）、read（看書）、look（看窗外或遠方）、present（上台報告或講課）、walk（一起走路）、idle（沒特別做什麼）。
規則：
- cast 第一個一定是玩家本人 {"me":true,...}；其他人最多 4 位。玩家生活中的人請用上面括號前的稱呼；沒有名字的人用簡短身分（例如「同事」「朋友」「學生」）。
- 不要加入玩家沒提到的重要人物；背景有多少陌生人用 crowd（0 到 1）表示。
- place 只能是 seat、stand、walk，或省略。
- texts 只放畫面上真的會出現的短字：screen（台上投影片標題，12 字內）、sub（副標，18 字內）、board（黑板或看板，14 字內）、sign（招牌或布條，8 字內）。沒有就給 {}。
- props 可用：flowers（新家桌上有花）、cake（聚餐有蛋糕）。沒有就給 {}。
- hour 是 0 到 23 的整數；weather 是 clear、cloud、rain；season 是 spring、summer、autumn、winter。
- title：10 字內的標題。caption：一句話客觀描述這個畫面，不要用「幸福」「終於」「完美」這類評價詞。
- dependsOnOthers：這個畫面能不能成立，關鍵是不是別人的態度或決定（例如「媽終於支持我」「主管升我」「對方答應」）？是的話 others 寫「誰的什麼反應」；mine 改寫成一個只靠玩家自己就做得到、同樣具體的畫面（一句話）。不依賴就 false，others 與 mine 給空字串。
- missing：如果地點用上面的場景演不出來（例如國外某個景點、演唱會），用一句話說明改用了哪個最接近的場景；否則空字串。
只回傳 JSON：{"title":"","caption":"","kit":"apartment","hour":20,"weather":"clear","season":"autumn","crowd":0.3,"texts":{},"props":{},"cast":[{"me":true,"act":"talk","place":"seat"},{"name":"媽","act":"listen"}],"dependsOnOthers":false,"others":"","mine":"","missing":""}`;
}
function hopeLook(name, i){
  const c = (app.cards || []).find(x => x.call === name);
  if (c) return look3d(name, i);
  const long = /媽|姊|姐|妹|女|阿姨|奶奶|外婆|老婆|太太/.test(name) || (!/爸|哥|弟|男|叔|爺|老公|先生/.test(name) && hh(name.length * 7 + (name.charCodeAt(0) || 0)) < .45);
  return { name, col: ["#8c6e5a", "#6e7f8c", "#7a8c6e", "#8c7a9a"][i % 4], long, hair: /奶奶|爺爺|外婆|外公|阿嬤|阿公/.test(name) ? "#9a9a96" : "#22252b" };
}
function hopeSpec(r){
  const kits = window.Stage3D?.kits || {};
  const cast = []; const seen = new Set();
  for (const c of (Array.isArray(r.cast) ? r.cast : [])){
    if (c.me){ if (cast.some(x => x.me)) continue; cast.unshift({ me: true, act: HOPE_ACTS.includes(c.act) ? c.act : "idle", place: ["seat", "stand", "walk"].includes(c.place) ? c.place : undefined }); continue; }
    const name = String(c.name || "").replace(/\s/g, "").slice(0, 6); if (!name || seen.has(name) || cast.filter(x => !x.me).length >= 4) continue; seen.add(name);
    cast.push({ name, act: HOPE_ACTS.includes(c.act) ? c.act : "idle", place: ["seat", "stand", "walk"].includes(c.place) ? c.place : undefined, look: hopeLook(name, cast.length) });
  }
  if (!cast.some(x => x.me)) cast.unshift({ me: true, act: "idle" });
  const t = r.texts && typeof r.texts === "object" ? r.texts : {}; const texts = {};
  for (const [k, n] of [["screen", 12], ["sub", 18], ["board", 14], ["sign", 8]]) if (t[k]) texts[k] = String(t[k]).slice(0, n);
  const hour = Number.isFinite(+r.hour) ? Math.max(0, Math.min(23, Math.round(+r.hour))) : 19;
  return { kit: kits[r.kit] ? r.kit : "apartment", hour, weather: ["clear", "cloud", "rain"].includes(r.weather) ? r.weather : "clear", season: ["spring", "summer", "autumn", "winter"].includes(r.season) ? r.season : "autumn",
    crowd: Math.max(0, Math.min(1, Number(r.crowd) || 0)), texts, props: { flowers: !!r.props?.flowers, cake: !!r.props?.cake }, cast, rented: /租/.test(app.setup?.live || "") };
}
function visHost(el){ // 只用一個 3D 畫布，在需要的地方搬過去
  if (!use3D()) return null;
  if (!app.vis3d){ app.vis3d = Stage3D.create(el, { wheel: false, touch: "pan-y" }); app.vis3d.onSound = sfx3d; }
  else if (app.vis3d.renderer.domElement.parentNode !== el){ el.appendChild(app.vis3d.renderer.domElement); }
  app.vis3d.el = el; app.vis3d.ro.disconnect(); app.vis3d.ro.observe(el); app.vis3d.resize(); return app.vis3d;
}
function playVision(el, spec){ const s = visHost(el); if (!s) return false; s.buildVision(spec); s.start(); return true; }
function hopeCard(h){
  const d = document.createElement("div"); d.className = "panel hopecard"; d.dataset.id = h.id;
  d.innerHTML = `<div class="field"><label>畫面 ${app.hopes.indexOf(h) + 1}</label><textarea rows="3" class="hopeText" placeholder="例：三年後的某個週六晚上，在我自己租的小公寓客廳，跟女朋友一起吃外送、聊這週的工作，窗外在下雨。"></textarea></div>
    <div class="btns"><button type="button" class="primary small hopePlay">演出來</button><button type="button" class="small hopeDel">刪掉這個畫面</button></div>
    <p class="status hopeStatus"></p>
    <div class="hopeShow" hidden><div class="hopestage"></div><p class="hopecap"></p><p class="note hopeMiss" hidden></p>
      <div class="hopeOthers quote" hidden><b>這個畫面有一部分要靠別人</b><p class="hopeOthersTxt"></p><div class="btns"><button type="button" class="small hopeMine">改成只靠我自己的版本</button></div></div>
      <div class="hopeAsk" hidden>
        <div class="field"><label>在你自己身上，最可能讓這個畫面不會發生的是什麼？</label><textarea rows="2" class="hopeObs" placeholder="例：我很容易一忙就不回家人訊息，拖到他們不想再問。"></textarea></div>
        <div class="field"><label>那就先想好：如果……</label><input type="text" class="hopeWhen" placeholder="例：連續三天沒回媽的訊息"></div>
        <div class="field"><label>我就……</label><input type="text" class="hopeThen" placeholder="例：當天晚上打一通五分鐘的電話"></div>
      </div></div>`;
  const q = sel => d.querySelector(sel);
  q(".hopeText").value = h.text || ""; q(".hopeObs").value = h.obstacle || ""; q(".hopeWhen").value = h.ifWhen || ""; q(".hopeThen").value = h.ifThen || "";
  q(".hopeText").oninput = e => { h.text = e.target.value; };
  q(".hopeObs").oninput = e => { h.obstacle = e.target.value; }; q(".hopeWhen").oninput = e => { h.ifWhen = e.target.value; }; q(".hopeThen").oninput = e => { h.ifThen = e.target.value; };
  q(".hopeDel").onclick = () => { app.hopes = app.hopes.filter(x => x !== h); if (app.vis3d?.el && d.contains(app.vis3d.el)) app.vis3d.stop(); renderHopes(); };
  q(".hopePlay").onclick = () => runHope(h, d);
  q(".hopeMine").onclick = () => { if (!h.r?.mine) return; h.text = h.r.mine; q(".hopeText").value = h.r.mine; runHope(h, d); };
  if (h.r) showHope(h, d, false);
  return d;
}
function renderHopes(){
  const box = $("hopes"); box.innerHTML = ""; if (!app.hopes.length) app.hopes.push({ id: Date.now() });
  for (const h of app.hopes) box.appendChild(hopeCard(h));
  $("addHope").disabled = app.hopes.length >= HOPE_MAX; $("addHope").textContent = app.hopes.length >= HOPE_MAX ? `最多 ${HOPE_MAX} 個畫面` : "再加一個畫面";
}
async function runHope(h, d){
  const q = sel => d.querySelector(sel); const text = (q(".hopeText").value || "").trim(); h.text = text;
  if (text.length < 8){ q(".hopeStatus").textContent = "多寫一點：什麼時候、在哪裡、誰在、在做什麼。"; return; }
  q(".hopePlay").disabled = true; q(".hopeStatus").textContent = "正在把畫面搭起來⋯"; q(".hopeStatus").classList.remove("error");
  try {
    const r = await sample.json(hopePrompt(text), { modelTier: "quick", cache: false });
    h.r = { title: String(r.title || "").slice(0, 14), caption: String(r.caption || "").slice(0, 120), dependsOnOthers: !!r.dependsOnOthers, others: String(r.others || "").slice(0, 80), mine: String(r.mine || "").slice(0, 160), missing: String(r.missing || "").slice(0, 100) };
    h.spec = hopeSpec(r); h.real = null; q(".hopeStatus").textContent = ""; showHope(h, d, true);
  } catch (e) { q(".hopeStatus").textContent = errCopy(e); q(".hopeStatus").classList.add("error"); }
  q(".hopePlay").disabled = false;
}
function showHope(h, d, play){
  const q = sel => d.querySelector(sel); q(".hopeShow").hidden = false;
  const who = h.spec.cast.filter(c => !c.me).map(c => c.name).join("、");
  q(".hopecap").textContent = `${h.r.title ? `「${h.r.title}」` : ""}${h.r.caption}${who ? `（在場：你、${who}）` : ""}`;
  q(".hopeMiss").hidden = !h.r.missing; q(".hopeMiss").textContent = h.r.missing ? `演不出來的部分：${h.r.missing}` : "";
  q(".hopeOthers").hidden = !h.r.dependsOnOthers; q(".hopeOthersTxt").textContent = h.r.dependsOnOthers ? `${h.r.others}──那是對方的決定，不是你能控制的。只靠你自己的版本：${h.r.mine || "（沒有整理出來）"}` : "";
  q(".hopeMine").hidden = !h.r.mine;
  const st = q(".hopestage"); st.hidden = !use3D();
  if (play){ const ok = playVision(st, h.spec); h.played = true;
    const reveal = () => { q(".hopeAsk").hidden = false; };
    if (ok && !fast()) setTimeout(reveal, 7000); else reveal(); }
  else { q(".hopeAsk").hidden = !h.played; if (use3D()){ st.innerHTML = ""; const b = document.createElement("button"); b.type = "button"; b.className = "small hopeReplay"; b.textContent = "播放這個畫面"; b.onclick = () => { st.innerHTML = ""; playVision(st, h.spec); }; st.appendChild(b); } }
}
function openHopes(){ app.cards = readCards(); renderHopes(); show("hopeView"); }
$("toHope").onclick = openHopes;
$("addHope").onclick = () => { if (app.hopes.length >= HOPE_MAX) return; app.hopes.push({ id: Date.now() }); renderHopes(); };
$("hopeDone").onclick = () => { app.vis3d?.stop(); app.hopes = app.hopes.filter(h => h.r || (h.text || "").trim()); show("cardView"); hopeBadge(); };
function hopeBadge(){ const n = app.hopes.filter(h => h.r).length; $("toHope").textContent = n ? `你想要的樣子（${n} 個畫面）` : "先看看你想要的樣子"; }

/* ---- 三年後：同一個畫面，在這條時間線的樣子 ---- */
function hopeRealPrompt(w){
  const tl = w.log.map(l => `${l.date}「${l.title}」：你選了「${l.choiceLabel}」`).join("\n");
  const kits = Object.keys(window.Stage3D?.kits || {}).join("、");
  const list = app.hopes.filter(h => h.r).map((h, i) => `${i + 1}. 「${h.r.title}」：${h.r.caption}（在場：你${h.spec.cast.filter(c => !c.me).map(c => "、" + c.name).join("")}；場景 ${h.spec.kit}；${h.spec.hour} 點）`).join("\n");
  return `你是人生演練工具的回顧助手。玩家在做決定之前，寫下了希望三年內出現的畫面。請根據這條時間線三年的模擬紀錄，判斷每個畫面在第 1095 天實際是什麼樣子。
要誠實：紀錄沒有支持的就不要讓它發生；紀錄支持的也不要刻意寫得更糟。不要安慰，不要評價玩家。
決定：${app.setup.decision}；這條線走的是「${pathName(w.path)}」；做決定的方式：${MODE_TEXT[w.mode] || ""}
三年後的狀態（系統計算）：${worldSummary(w)}
三年間的選擇：
${tl}
最近的記憶：${(w.memories || []).slice(-12).join("；")}
玩家希望的畫面：
${list}
每個畫面依序回傳：
- status：yes（大致發生）、partly（發生了一部分）、no（沒有發生）
- why：一句話，指出紀錄裡的哪個選擇、事件或數值造成這個結果
- caption：一句話客觀描述同一個時段實際的樣子
- absent：原本在場、但這天不在的人（用原本的稱呼）
- meAct：玩家那時在做什麼，從 talk、listen、laugh、eat、sip、type、phone、read、look、walk、idle 選一個
- hour：0 到 23
- kit：實際在哪裡，通常跟原本一樣；從這些 key 選：${kits}
只回傳 JSON：{"items":[{"status":"partly","why":"","caption":"","absent":[],"meAct":"idle","hour":20,"kit":"apartment"}]}`;
}
function hopeRealFallback(w, h){ // 叫不到 AI 時，用關係與精力粗估
  const others = h.spec.cast.filter(c => !c.me); const absent = others.filter(c => (w.rel[c.name] ?? 60) < 45).map(c => c.name);
  const tired = w.energy < 35; const status = absent.length === others.length && others.length ? "no" : absent.length || tired ? "partly" : "yes";
  return { status, why: tired ? `你三年後的精力${lvl(w.energy)}。` : absent.length ? `你跟${absent.join("、")}的關係${lvl(w.rel[absent[0]] ?? 40)}。` : "照目前的關係與狀態推算。", caption: "", absent, meAct: tired ? "phone" : (h.spec.cast[0].act || "idle"), hour: tired ? 23 : h.spec.hour, kit: h.spec.kit, rough: true };
}
function realSpec(h, it){
  const s = JSON.parse(JSON.stringify(h.spec)); const absent = new Set(Array.isArray(it.absent) ? it.absent : []);
  s.cast = s.cast.filter(c => c.me || !absent.has(c.name));
  const me = s.cast.find(c => c.me); if (["talk", "listen", "laugh", "eat", "sip", "type", "phone", "read", "look", "walk", "idle"].includes(it.meAct)) me.act = it.meAct;
  if (s.cast.length === 1 && ["talk", "listen", "laugh"].includes(me.act)) me.act = "phone";
  if (Number.isFinite(+it.hour)) s.hour = Math.max(0, Math.min(23, Math.round(+it.hour)));
  if (window.Stage3D?.kits?.[it.kit]) s.kit = it.kit;
  if (it.status === "no"){ s.texts = {}; s.props = {}; s.crowd = Math.min(s.crowd, .2); }
  return s;
}
async function finalHopes(w){
  const list = $("hopeFinalList"); const hs = app.hopes.filter(h => h.r && h.spec);
  list.innerHTML = ""; $("hopeFinalStatus").textContent = ""; if (!hs.length) return;
  $("hopeFinalStatus").textContent = "正在對照你開始前寫下的畫面⋯";
  let items = null;
  if (w.hopeReal && w.hopeReal.length === hs.length) items = w.hopeReal;
  else { try { const r = await sample.json(hopeRealPrompt(w), { modelTier: "quick", cache: false }); items = Array.isArray(r.items) ? r.items : null; } catch {}
    items = hs.map((h, i) => items && items[i] ? items[i] : hopeRealFallback(w, h)); w.hopeReal = items; }
  $("hopeFinalStatus").textContent = items.some(x => x.rough) ? "有些畫面沒辦法請 AI 對照，先用關係與精力粗估。" : "";
  hs.forEach((h, i) => { const it = items[i]; const real = realSpec(h, it);
    const d = document.createElement("div"); d.className = "hopefinal";
    const tag = { yes: "大致發生了", partly: "發生了一部分", no: "沒有發生" }[it.status] || "不確定";
    d.innerHTML = `<h4></h4><p class="hopeTag"></p><div class="btns"><button type="button" class="small hfWant">當初想要的</button><button type="button" class="small hfReal">這條路的第 1095 天</button></div><div class="hopestage"></div><p class="hopecap"></p><p class="note hfWhy"></p><p class="note hfObs"></p>`;
    const q = sel => d.querySelector(sel);
    q("h4").textContent = h.r.title || `畫面 ${i + 1}`; q(".hopeTag").textContent = tag; q(".hopeTag").dataset.s = it.status || "";
    q(".hfWhy").textContent = it.why ? `為什麼：${it.why}` : "";
    q(".hfObs").textContent = h.obstacle ? `你開始前寫的阻礙：${h.obstacle}${h.ifWhen && h.ifThen ? `；你的計畫：如果${h.ifWhen}，就${h.ifThen}` : ""}` : "你開始前沒有寫下阻礙。";
    const st = q(".hopestage"); st.hidden = !use3D();
    const pick = which => { q(".hfWant").classList.toggle("on", which === "want"); q(".hfReal").classList.toggle("on", which === "real");
      q(".hopecap").textContent = which === "want" ? h.r.caption : (it.caption || "（沒有描述）");
      if (use3D()){ for (const o of list.querySelectorAll(".hopestage")) if (o !== st) o.innerHTML = ""; playVision(st, which === "want" ? h.spec : real); } };
    q(".hfWant").onclick = () => pick("want"); q(".hfReal").onclick = () => pick("real");
    list.appendChild(d);
    q(".hopecap").textContent = it.caption || ""; q(".hfReal").classList.add("on");
    if (i === 0) pick("real"); else if (use3D()){ const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = "播放這個畫面"; b.onclick = () => pick("real"); st.appendChild(b); }
  });
}
$("copyLog").onclick = async () => {
  const data = { tool: "LifeFork v0.23", playerDetails: app.playerDetails, exportedAt: new Date().toISOString(), setup: { ...app.setup, people: app.setup.people.map(({ voice, ...p }) => ({ ...p, imported: !!voice })) }, cards: app.cards.map(({ voiceEx, ...c }) => c), hopes: app.hopes.filter(h => h.r).map(h => ({ title: h.r.title, kit: h.spec.kit, dependsOnOthers: h.r.dependsOnOthers })),
    chapter0: { summary: app.ch0Summary, feedback: app.cur?.feedback, messages: app.cur?.messages, log: app.cur?.log, autoTurns: app.cur?.messages.filter(m => m.auto).length },
    timelines: app.timelines.map(t => ({ mode: t.mode, path: t.path, branchFrom: t.branchFrom, money: t.money, energy: t.energy, growth: t.growth, doubt: t.doubt, rel: t.rel, npcs: t.npcs, health: Math.round(t.health), healthKnown: t.healthKnown, queries: t.queries, facts: t.facts, moneyHist: t.moneyHist, log: t.log, final: t.final, hopeReal: (t.hopeReal || []).map(x => ({ status: x.status, why: x.why })) })) };
  const text = JSON.stringify(data, null, 2);
  try { await navigator.clipboard.writeText(text); $("copyStatus").textContent = "已複製。貼到 LINE 或 Email 傳給團隊即可；傳之前可以先刪掉不想分享的內容。"; }
  catch { const ta = document.createElement("textarea"); ta.value = text; ta.rows = 8; $("copyStatus").textContent = "無法自動複製，請手動全選下面的文字："; $("copyStatus").after(ta); ta.select(); }
};
