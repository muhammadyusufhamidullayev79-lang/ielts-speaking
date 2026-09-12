/* Vercel serverless funksiya — IELTS Mock uchun haqiqiy AI tahlili (proxy).
 *
 * NEGA PROXY: API kalitini brauzerga qo'yib bo'lmaydi (maxfiy, pul sarflanadi).
 * Kalit faqat serverda turadi. Frontend shu /api/analyze ga murojaat qiladi.
 *
 * Muhit o'zgaruvchilari (Vercel → Settings → Environment Variables):
 *   AI_PROVIDER    = openai | gemini | auto   (default: auto)
 *   OPENAI_API_KEY = sk-...                     (OpenAI yoki mos provider)
 *   OPENAI_MODEL   = gpt-4o-mini                (default)
 *   GEMINI_API_KEY = AIza...                    (Google Gemini)
 *   GEMINI_MODEL   = gemini-1.5-flash           (default)
 *
 * Kalit sozlanmagan bo'lsa {ok:false} qaytaradi va frontend eski (audio+matn)
 * heuristik bahoga avtomatik qaytadi — sayt hech qachon buzilmaydi.
 */

function buildPrompt(questions){
  const blocks = questions.map(q =>
    '[Savol ' + q.index + ' | ' + (q.part || 'Part') + ']\n' +
    'Savol: ' + (q.question || '') + '\n' +
    'Talaba javobi (transkript): ' + (q.transcript || '') + '\n' +
    'Namuna javob: ' + (q.bestAnswer || '')
  );

  return [
    'Sen IELTS Speaking imtihonining tajribali, qattiqqo\u2018l ekspertisan. Talabaning transkriptini halol bahola.',
    'JAVOB FAQAT JSON bo\u2018lsin (boshqa matn, izoh yoki markdown kod bloki qo\u2018shma). Sxema:',
    '{',
    '  "overallBand": 6.5,',
    '  "criteria": {"fluency":6.5,"lexical":6.0,"grammar":6.0,"pronunciation":7.0},',
    '  "summary": "2-3 jumla, o\u2018zbek tilida, asosiy kuchli va zaif tomonlar",',
    '  "questions": [',
    '    {"index":0,"corrections":["xato -> to\u2018g\u2018rilangan variant"],"betterExample":"qisqa, yaxshiroq namuna jumla"}',
    '  ]',
    '}',
    'Qoidalar: bandlar 0.5 qadam bilan 0\u20139 oralig\u2018ida. "summary" o\u2018zbek tilida. "corrections" ingliz tilida. "questions" faqat yuborilgan savollar uchun va ularning "index" qiymati bilan mos bo\u2018lsin.',
    '',
    'SAVOLLAR:',
    blocks.join('\n')
  ].join('\n');
}

function parseJSON(text){
  if(!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```\s*$/g, '').trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if(s >= 0 && e > s) t = t.slice(s, e + 1);
  try{ return JSON.parse(t); }catch(err){ return null; }
}

async function callOpenAI(prompt, key){
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Sen IELTS Speaking ekspertisan. Faqat to\u2018g\u2018ri JSON qaytarasan.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('OpenAI ' + res.status + ': ' + t.slice(0, 200));
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return content || '';
}

async function callGemini(prompt, key){
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
    ':generateContent?key=' + encodeURIComponent(key);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('Gemini ' + res.status + ': ' + t.slice(0, 200));
  }
  const data = await res.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  return parts ? parts.map(p => p.text || '').join('') : '';
}

module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS'){ res.status(204).end(); return; }
  if(req.method !== 'POST'){ res.status(405).json({ ok:false, reason:'method', message:'POST only' }); return; }

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const provider = String(process.env.AI_PROVIDER || 'auto').toLowerCase();

  let chosen = null;
  if(provider === 'openai' && openaiKey) chosen = 'openai';
  else if(provider === 'gemini' && geminiKey) chosen = 'gemini';
  else if(provider === 'auto') chosen = openaiKey ? 'openai' : (geminiKey ? 'gemini' : null);

  if(!chosen){
    res.status(200).json({ ok:false, reason:'no-api-key', message:'AI kalit sozlanmagan (OPENAI_API_KEY yoki GEMINI_API_KEY).' });
    return;
  }

  try{
    const body = req.body || {};
    const questions = Array.isArray(body.questions) ? body.questions.slice(0, 11) : [];
    if(!questions.length){
      res.status(400).json({ ok:false, reason:'no-questions', message:'Savollar yo\u2018q.' });
      return;
    }
    const prompt = buildPrompt(questions);
    const raw = chosen === 'openai' ? await callOpenAI(prompt, openaiKey) : await callGemini(prompt, geminiKey);
    const parsed = parseJSON(raw);
    if(!parsed){
      res.status(200).json({ ok:false, reason:'parse-error', message:'AI javobini tahlil qilib bo\u2018lmadi.' });
      return;
    }
    res.status(200).json({ ok:true, provider: chosen, result: parsed });
  }catch(e){
    res.status(200).json({ ok:false, reason:'error', message:String(e && e.message ? e.message : e) });
  }
};
