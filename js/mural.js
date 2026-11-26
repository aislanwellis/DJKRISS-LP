// Mural de mensagens dos visitantes
import { API_MURAL } from './tracks.js';

const $ = (s, r = document) => r.querySelector(s);

function ago(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function initMural() {
  const form = $('#mural-form');
  const list = $('#mural-list');
  const status = $('#mural-status');
  const count = $('#mural-count');
  const msg = form.elements.mensagem;
  const counter = $('[data-counter]', form);
  const btn = $('button[type=submit]', form);
  const total = $('#mural-total');

  const render = (items) => {
    list.replaceChildren(...items.map(card));
    total.textContent = items.length ? `${items.length} ${items.length === 1 ? 'salve' : 'salves'}` : '';
    $('#mural-empty').hidden = items.length > 0;
  };

  function card(m) {
    const li = document.createElement('li');
    li.className = 'mm';
    const av = document.createElement('span');
    av.className = 'mm-av';
    av.textContent = initials(m.nome) || '?';
    av.style.setProperty('--hue', [...m.nome].reduce((a, c) => a + c.charCodeAt(0), 0) % 360);
    const body = document.createElement('div');
    const head = document.createElement('p');
    head.className = 'mm-head';
    const b = document.createElement('b');
    b.textContent = m.nome;
    const t = document.createElement('time');
    t.dateTime = new Date(m.ts).toISOString();
    t.textContent = ago(m.ts);
    head.append(b, t);
    const p = document.createElement('p');
    p.className = 'mm-text';
    p.textContent = m.mensagem;
    body.append(head, p);
    li.append(av, body);
    return li;
  }

  let items = [];
  async function load() {
    try {
      const r = await fetch(API_MURAL, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      items = data.mensagens || [];
      render(items);
      form.classList.remove('is-offline');
    } catch (e) {
      form.classList.add('is-offline');
      $('#mural-empty').hidden = false;
      $('#mural-empty').textContent = 'O mural abre assim que a página estiver no ar.';
    }
  }

  msg.addEventListener('input', () => {
    counter.textContent = `${msg.value.length}/280`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = form.elements.nome.value.trim();
    const mensagem = msg.value.trim();
    if (nome.length < 2) return say('Coloca seu nome (mínimo 2 letras).', true);
    if (mensagem.length < 3) return say('Escreve sua mensagem.', true);
    btn.disabled = true;
    say('Enviando…');
    try {
      const r = await fetch(API_MURAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, mensagem, site: form.elements.site.value }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.erro || 'Não foi possível enviar agora.');
      if (data.mensagem) { items.unshift(data.mensagem); render(items); }
      form.reset();
      counter.textContent = '0/280';
      say(data.moderada ? 'Recebido! Sua mensagem aparece após aprovação.' : 'Salve enviado! 🔊');
      list.firstElementChild && list.firstElementChild.classList.add('is-new');
    } catch (err) {
      say(err.message || 'Não foi possível enviar agora.', true);
    } finally {
      btn.disabled = false;
    }
  });

  function say(text, bad = false) {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  }

  // carrega quando a seção se aproxima
  new IntersectionObserver((es, o) => {
    if (es[0].isIntersecting) { load(); o.disconnect(); setInterval(load, 45000); }
  }, { rootMargin: '400px' }).observe(count || list);
}
