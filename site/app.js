const $ = (id) => document.getElementById(id);
const readSetting = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const saveSetting = (key, value) => { try { localStorage.setItem(key, value); } catch { /* optional */ } };
let zone = readSetting('timezone', 'Asia/Shanghai');
if (!['Asia/Shanghai', 'America/Los_Angeles'].includes(zone)) zone = 'Asia/Shanghai';
let feed, selected = null, limit = 6;
const safeUrl = (url) => /^https:\/\/x\.com\/thsottiaux\/status\/\d{15,25}$/.test(url || '') ? url : 'https://x.com/thsottiaux';
const dateKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
const fullDate = (date) => new Intl.DateTimeFormat('zh-CN', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date));
function relative(date) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000));
  return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes} 分钟前` : minutes < 1440 ? `${Math.floor(minutes / 60)} 小时前` : `${Math.floor(minutes / 1440)} 天前`;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function sourceLink(text, url, className) {
  const link = element('a', className, text);
  link.href = safeUrl(url); link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
function renderHealth() {
  if (!feed) return;
  const stale = !feed.lastSuccessAt || Date.now() - Date.parse(feed.lastSuccessAt) > 3600000;
  $('health-dot').className = `status-dot ${feed.status === 'ok' && !stale ? 'ok' : 'warning'}`;
  $('health-label').textContent = `${feed.status !== 'ok' ? '抓取失败 · 保留旧数据' : stale ? '更新延迟 · 当前为缓存' : '数据已更新'}${feed.lastSuccessAt ? ` · ${relative(feed.lastSuccessAt)}` : ''}`;
  $('health-label').title = feed.lastSuccessAt ? `最后成功检查：${fullDate(feed.lastSuccessAt)}` : '尚无成功抓取记录';
}
function renderEvents() {
  const events = feed.events.filter((event) => !selected || dateKey(event.publishedAt) === selected);
  $('feed').replaceChildren();
  $('clear-filter').hidden = !selected;
  if (!events.length) $('feed').append(element('div', 'empty panel', selected ? `${selected} 暂无收录公告。` : '暂时没有可用记录，请稍后再试。'));
  for (const event of events.slice(0, limit)) {
    const card = element('article', 'event panel');
    const top = element('div', 'event-top');
    const time = element('div');
    time.append(element('div', 'event-time', relative(event.publishedAt)), element('div', 'event-date', fullDate(event.publishedAt)));
    top.append(time, element('span', `badge ${event.status}`, event.status === 'confirmed' ? '已确认完成' : '公告已发布'));
    card.append(top, element('p', 'event-summary', event.kind === 'reserve' ? '备用额度相关重置公告' : 'Codex 额度重置公告'), element('blockquote', 'original', event.text));
    const bottom = element('div', 'event-bottom');
    bottom.append(sourceLink('查看 Tibo 原帖 ↗', event.url));
    if (event.confirmationUrl) bottom.append(sourceLink(`完成说明 · ${fullDate(event.confirmedAt)}`, event.confirmationUrl, 'confirmed-link'));
    else bottom.append(element('span', 'small-label', event.status === 'confirmed' ? '原帖包含完成说明' : '尚未关联完成确认'));
    card.append(bottom); $('feed').append(card);
  }
  $('load-more').hidden = events.length <= limit;
  $('load-more').textContent = `查看更多公告（还有 ${Math.max(0, events.length - limit)} 条） ↓`;
}
function renderCalendar() {
  const today = dateKey(Date.now()), end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 179); start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const covered = feed.coverageStartAt ? dateKey(feed.coverageStartAt) : today;
  const groups = new Map();
  for (const event of feed.events) { const key = dateKey(event.publishedAt); groups.set(key, [...(groups.get(key) || []), event]); }
  const columns = Math.ceil(((end - start) / 86400000 + 1) / 7);
  $('heatmap').replaceChildren(); $('months').replaceChildren();
  $('months').style.gridTemplateColumns = `repeat(${columns},minmax(14px,1fr))`;
  let lastMonth = '';
  for (let day = 0; day < columns * 7; day++) {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + day);
    const key = date.toISOString().slice(0, 10), events = groups.get(key) || [];
    if (day % 7 === 0) { const month = key.slice(0, 7); $('months').append(element('span', '', month !== lastMonth ? `${date.getUTCMonth() + 1}月` : '')); lastMonth = month; }
    const kind = events.some((event) => event.kind === 'regular') ? 'regular' : 'reserve';
    const state = key > today ? 'future' : events.length ? `has-event ${kind}` : key <= covered ? 'unknown' : '';
    const cell = element('button', `day ${state}${selected === key ? ' selected' : ''}`);
    cell.title = `${key} · ${key > today ? '未来日期' : events.length ? `${events.length} 条公告` : key <= covered ? '未完整采集' : '暂无收录记录'}`;
    cell.setAttribute('aria-label', cell.title); cell.setAttribute('aria-pressed', String(selected === key));
    cell.disabled = !events.length;
    if (events.length) cell.addEventListener('click', () => { selected = selected === key ? null : key; limit = 6; renderCalendar(); renderEvents(); $('announcements-heading').scrollIntoView({ block: 'start' }); });
    $('heatmap').append(cell);
  }
}
function render() {
  if (!feed) return;
  document.querySelectorAll('[data-zone]').forEach((button) => { const active = button.dataset.zone === zone; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  renderHealth();
  const latest = feed.events[0];
  if (latest) {
    $('latest-relative').textContent = relative(latest.publishedAt);
    $('latest-date').textContent = `${fullDate(latest.publishedAt)} · ${zone === 'Asia/Shanghai' ? '北京时间' : '洛杉矶时间'}`;
    $('latest-badge').textContent = latest.status === 'confirmed' ? '已确认完成' : '公告已发布';
    $('latest-badge').className = `badge ${latest.status}`;
    $('latest-source').href = safeUrl(latest.url);
    $('latest-note').textContent = latest.status === 'confirmed' ? '原帖或关联说明已确认完成；个人额度仍以账号内显示为准。' : '这是公告发布时间，尚未关联完成确认；不代表你的额度已经到账。';
  } else {
    $('latest-relative').textContent = '暂无数据'; $('latest-date').textContent = '等待成功采集'; $('latest-badge').textContent = '数据不可用';
  }
  $('stat-count').textContent = feed.lastSuccessAt ? feed.events.length : '—';
  const times = feed.events.map((event) => Date.parse(event.publishedAt));
  const intervals = times.slice(1).map((time, i) => (times[i] - time) / 86400000);
  $('stat-average').textContent = intervals.length ? `${(intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1)} 天` : '—';
  $('stat-longest').textContent = intervals.length ? `${Math.max(...intervals).toFixed(1)} 天` : '—';
  $('coverage').textContent = `采集范围：${feed.coverageStartAt ? dateKey(feed.coverageStartAt) : '未知'} 起 · 统计仅限已识别公告，不代表全部重置历史。`;
  $('challenge').hidden = !feed.challenge;
  if (feed.challenge) { $('challenge-day').textContent = feed.challenge.day; $('challenge-description').textContent = `最新进度：第 ${feed.challenge.day} / 28 天 · 查看 Tibo 的原始记录`; $('challenge').href = safeUrl(feed.challenge.url); }
  renderCalendar(); renderEvents();
}
async function refresh() {
  $('refresh').disabled = true;
  try {
    const response = await fetch(`./data/feed.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (data.schemaVersion !== 1 || data.author !== 'thsottiaux' || !Array.isArray(data.events) || data.events.some((event) => !Number.isFinite(Date.parse(event.publishedAt)) || typeof event.text !== 'string')) throw new Error('invalid');
    feed = data; render();
  } catch {
    $('health-label').textContent = feed ? '读取失败 · 显示上次数据' : '数据暂时不可用，请稍后刷新';
    $('health-dot').className = 'status-dot warning';
    if (!feed) { $('feed').replaceChildren(element('div', 'empty panel', '暂时无法读取记录。你仍可通过上方链接查看 Tibo 原帖。')); $('latest-badge').textContent = '数据不可用'; $('latest-date').textContent = '读取失败'; }
  } finally { $('refresh').disabled = false; }
}
function setTheme(theme) { document.documentElement.dataset.theme = theme; $('theme-toggle').textContent = theme === 'dark' ? '☀' : '☾'; $('theme-toggle').setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式'); }
setTheme(readSetting('theme', 'dark') === 'light' ? 'light' : 'dark');
$('theme-toggle').addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(theme); saveSetting('theme', theme); });
document.querySelectorAll('[data-zone]').forEach((button) => button.addEventListener('click', () => { zone = button.dataset.zone; selected = null; saveSetting('timezone', zone); render(); }));
$('load-more').addEventListener('click', () => { limit += 6; renderEvents(); });
$('clear-filter').addEventListener('click', () => { selected = null; limit = 6; renderCalendar(); renderEvents(); });
$('refresh').addEventListener('click', refresh);
setInterval(() => { if (!document.hidden) refresh(); }, 300000);
setInterval(() => { if (!document.hidden && feed) { renderHealth(); if (feed.events[0]) $('latest-relative').textContent = relative(feed.events[0].publishedAt); } }, 60000);
refresh();
