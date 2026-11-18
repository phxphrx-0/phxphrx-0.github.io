/* LifeFork — AI 介面：使用玩家自己的 Google Gemini API 金鑰
   - 金鑰只存在玩家的瀏覽器（localStorage 或 sessionStorage），直接送到 Google，不經過任何其他伺服器。
   - 對外提供 window.LF_AI.json(prompt, { modelTier })，回傳解析好的 JSON，介面與原本的 Claude 版相同。
   - 模型名稱不寫死：用金鑰向 Google 查詢可用模型，自動挑最新的 Flash-Lite（省額度）或 Flash（品質優先）。 */
(function () {
  "use strict";
  const API = "https://generativelanguage.googleapis.com/v1beta";
  const K_KEY = "lf_gemini_key", K_MODE = "lf_gemini_mode", K_MODELS = "lf_gemini_models";
  let models = null;                      // { quick, full, all }
  const store = { // 儲存失敗（私密模式等）時不中斷
    get(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
    set(k, v, persist) { try { (persist ? localStorage : sessionStorage).setItem(k, v); (persist ? sessionStorage : localStorage).removeItem(k); } catch {} },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} }
  };
  const fail = (code, detail) => Object.assign(new Error(detail || code), { code });
  const getKey = () => (store.get(K_KEY) || "").trim();
  const getMode = () => store.get(K_MODE) || "lite";
  const changed = () => window.dispatchEvent(new Event("lf-ai-change"));

  async function call(path, init) {
    const key = getKey(); if (!key) throw fail("no_key");
    let r;
    try { r = await fetch(API + path, { ...init, headers: { "Content-Type": "application/json", "x-goog-api-key": key, ...(init && init.headers) } }); }
    catch { throw fail("network"); }
    if (r.ok) return r.json();
    let body = ""; try { body = await r.text(); } catch {}
    if (r.status === 429) throw fail("rate_limited", body);
    if (r.status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) throw fail("bad_key", body);
    if (r.status === 401 || r.status === 403) throw fail("bad_key", body);
    if (r.status >= 500) throw fail("server", body);
    throw fail("http_" + r.status, body);
  }

  // 依名稱挑模型：排除圖片、語音、嵌入等；穩定版優先，版本號越新越好
  function pick(names) {
    const ok = names.filter(n => /gemini/i.test(n) && !/(image|tts|audio|live|embed|vision|aqa|learnlm|computer-use|robotics)/i.test(n));
    const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const stable = n => /(preview|exp)/i.test(n) ? 0 : 1;
    const sort = a => a.slice().sort((x, y) => stable(y) - stable(x) || ver(y) - ver(x) || x.length - y.length);
    const lite = sort(ok.filter(n => /flash-lite/i.test(n)));
    const flash = sort(ok.filter(n => /flash/i.test(n) && !/lite/i.test(n)));
    const any = sort(ok);
    return { quick: lite[0] || flash[0] || any[0], full: flash[0] || lite[0] || any[0], all: any };
  }
  async function ensureModels(force) {
    if (models && !force) return models;
    if (!force) { try { const c = JSON.parse(store.get(K_MODELS) || "null"); if (c && c.quick) return (models = c); } catch {} }
    const j = await call("/models?pageSize=200", { method: "GET" });
    const names = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name.replace(/^models\//, ""));
    const m = pick(names); if (!m.quick) throw fail("no_model");
    let persisted = false; try { persisted = !!localStorage.getItem(K_KEY); } catch {}
    models = m; store.set(K_MODELS, JSON.stringify(m), persisted); return m;
  }

  // 從回覆中取出 JSON（容忍 ```json 包裹或前後多餘文字）
  function parseJSON(text) {
    let t = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { return JSON.parse(t); } catch {}
    const s = Math.min(...["{", "["].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
    const e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (s < Infinity && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
    throw fail("invalid_json");
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function json(prompt, opts = {}) {
    const m = await ensureModels();
    const model = (opts.modelTier === "quick" || getMode() === "lite") ? m.quick : m.full;
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: String(prompt) + "\n\n只輸出 JSON，不要任何說明文字或程式碼區塊標記。" }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 }
    });
    let last;
    for (let i = 0; i < 3; i++) {
      try {
        const j = await call(`/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", body });
        if (j.promptFeedback && j.promptFeedback.blockReason) throw fail("refused");
        const c = (j.candidates || [])[0];
        if (!c) throw fail("refused");
        if (c.finishReason === "SAFETY" || c.finishReason === "PROHIBITED_CONTENT") throw fail("refused");
        const text = ((c.content && c.content.parts) || []).map(p => p.text || "").join("");
        return parseJSON(text);
      } catch (e) {
        last = e;
        if (e.code === "rate_limited" && i === 0) { await wait(2500); continue; }
        if (e.code === "server" || e.code === "network" || e.code === "invalid_json") { await wait(800 * (i + 1)); continue; }
        throw e;
      }
    }
    throw last;
  }

  // 首頁的金鑰設定
  function bindUI() {
    const $ = id => document.getElementById(id);
    if (!$("aiKey")) return;
    const info = (t, err) => { $("aiInfo").textContent = t; $("aiInfo").classList.toggle("error", !!err); };
    const show = () => {
      const k = getKey();
      $("aiKey").value = ""; $("aiKey").placeholder = k ? `已設定（…${k.slice(-4)}）` : "貼上 Gemini API 金鑰（通常是 AIza 開頭）";
      $("aiClear").hidden = !k; $("aiMode").value = getMode();
      $("aiBox").open = !k;
      if (k && models) info(`已連線。省額度模式用 ${models.quick}，品質優先用 ${models.full}。`);
      else if (!k) info("");
    };
    $("aiSave").onclick = async () => {
      const v = $("aiKey").value.trim(); if (!v) { info("請先貼上金鑰。", true); return; }
      store.set(K_KEY, v, $("aiRemember").checked); store.del(K_MODELS); models = null;
      info("正在用你的金鑰向 Google 確認⋯");
      try { await ensureModels(true); show(); changed(); }
      catch (e) { store.del(K_KEY); show(); changed(); info(e.code === "bad_key" ? "金鑰無效，請重新複製一次。" : e.code === "rate_limited" ? "Google 回覆用量已達上限，請稍後再試。" : e.code === "network" ? "連不到 Google，請檢查網路。" : "確認失敗，請再試一次。", true); }
    };
    $("aiClear").onclick = () => { store.del(K_KEY); store.del(K_MODELS); models = null; show(); info("已清除這台電腦上的金鑰。"); changed(); };
    $("aiMode").onchange = () => { store.set(K_MODE, $("aiMode").value, true); show(); };
    show();
    if (getKey()) ensureModels().then(show).catch(() => {});
  }

  window.LF_AI = { json, hasKey: () => !!getKey(), ensureModels };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindUI); else bindUI();
})();
