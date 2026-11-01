(() => {
  'use strict';

  const STORAGE_KEY = 'daymark-personal-system-v1';
  const HABITS = [
    { key: 'wake', label: 'Подъём в 7:00', short: 'Подъём', target: '07:00' },
    { key: 'pushups', label: '100 отжиманий', short: 'Отжимания', target: '100 повторений' },
    { key: 'reading', label: 'Чтение', short: 'Чтение', target: '60 минут' },
    { key: 'course', label: 'Новый курс', short: 'Обучение', target: '60 минут' },
    { key: 'work', label: 'Рабочий план', short: 'Работа', target: 'Все задачи' },
    { key: 'home', label: 'Домашние дела', short: 'Дом', target: 'Все дела' },
    { key: 'ideas', label: 'Запись идей', short: 'Идеи', target: '1 идея' }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pad = n => String(n).padStart(2, '0');
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const dateFromKey = key => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  };
  const keyFromDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const shiftDate = (key, amount) => {
    const d = dateFromKey(key);
    d.setDate(d.getDate() + amount);
    return keyFromDate(d);
  };
  const formatDate = (key, options = { day: 'numeric', month: 'long' }) => dateFromKey(key).toLocaleDateString('ru-RU', options);
  const formatWeekday = key => dateFromKey(key).toLocaleDateString('ru-RU', { weekday: 'long' });
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const asNumber = value => Math.max(0, Number(value) || 0);
  const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function freshDay() {
    return {
      wake: { done: false, time: '' },
      pushups: { sets: [] },
      reading: { minutes: 0, title: '', pages: '', note: '' },
      course: { minutes: 0, name: '', topic: '' },
      work: { minutes: 0, tasks: [], note: '' },
      home: { tasks: [], note: '' },
      ideas: []
    };
  }

  function normaliseDay(day) {
    const base = freshDay();
    if (!day || typeof day !== 'object') return base;
    return {
      wake: { ...base.wake, ...(day.wake || {}) },
      pushups: { ...base.pushups, ...(day.pushups || {}), sets: Array.isArray(day.pushups?.sets) ? day.pushups.sets.filter(s => s && Number(s.reps) > 0).map(s => ({ id: String(s.id || makeId()), reps: asNumber(s.reps), time: String(s.time || '') })) : [] },
      reading: { ...base.reading, ...(day.reading || {}) },
      course: { ...base.course, ...(day.course || {}) },
      work: { ...base.work, ...(day.work || {}), tasks: Array.isArray(day.work?.tasks) ? day.work.tasks.filter(t => t && t.text).map(t => ({ id: String(t.id || makeId()), text: String(t.text), done: !!t.done })) : [] },
      home: { ...base.home, ...(day.home || {}), tasks: Array.isArray(day.home?.tasks) ? day.home.tasks.filter(t => t && t.text).map(t => ({ id: String(t.id || makeId()), text: String(t.text), done: !!t.done })) : [] },
      ideas: Array.isArray(day.ideas) ? day.ideas.filter(i => i && i.text).map(i => ({ id: String(i.id || makeId()), text: String(i.text), time: String(i.time || '') })) : []
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { days: {}, theme: 'light' };
      const parsed = JSON.parse(raw);
      const days = {};
      if (parsed.days && typeof parsed.days === 'object') {
        Object.entries(parsed.days).forEach(([key, value]) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(key)) days[key] = normaliseDay(value);
        });
      }
      return { days, theme: parsed.theme === 'dark' ? 'dark' : 'light' };
    } catch (error) {
      console.warn('DAYMARK: не удалось прочитать локальные данные', error);
      return { days: {}, theme: 'light' };
    }
  }

  let state = loadState();
  let selectedDate = todayKey();
  let activeView = 'today';
  let storageAvailable = true;

  function getDay(key = selectedDate) {
    if (!state.days[key]) state.days[key] = freshDay();
    return state.days[key];
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      $('#footer-storage').textContent = 'Локальное сохранение включено';
    } catch (error) {
      storageAvailable = false;
      $('#footer-storage').textContent = 'Не удалось сохранить — проверь хранилище браузера';
      toast('Не удалось сохранить данные в браузере.', true);
      console.error(error);
    }
  }

  function pushupTotal(day) { return day.pushups.sets.reduce((sum, set) => sum + asNumber(set.reps), 0); }
  function taskStats(tasks) { return { total: tasks.length, done: tasks.filter(task => task.done).length }; }
  function completionMap(day) {
    const work = taskStats(day.work.tasks);
    const home = taskStats(day.home.tasks);
    return {
      wake: !!day.wake.done,
      pushups: pushupTotal(day) >= 100,
      reading: asNumber(day.reading.minutes) >= 60,
      course: asNumber(day.course.minutes) >= 60,
      work: work.total > 0 && work.done === work.total,
      home: home.total > 0 && home.done === home.total,
      ideas: day.ideas.length > 0
    };
  }
  function completionCount(day) { return Object.values(completionMap(day)).filter(Boolean).length; }
  function dayPercent(day) { return Math.round(completionCount(day) / 7 * 100); }
  function daysInRange(endKey, count) { return Array.from({ length: count }, (_, i) => shiftDate(endKey, i - count + 1)); }
  function activeStreak() {
    let cursor = todayKey();
    let streak = 0;
    for (let i = 0; i < 366; i++) {
      const day = state.days[cursor];
      if (!day || completionCount(normaliseDay(day)) === 0) break;
      streak++;
      cursor = shiftDate(cursor, -1);
    }
    return streak;
  }
  function bestStreak(key, within = 365) {
    let best = 0, current = 0;
    const dates = daysInRange(key, within);
    dates.forEach(date => {
      const day = state.days[date] ? normaliseDay(state.days[date]) : freshDay();
      if (completionMap(day)[key]) { current++; best = Math.max(best, current); }
      else current = 0;
    });
    return best;
  }
  function averagePercent(keys) {
    if (!keys.length) return 0;
    return Math.round(keys.reduce((sum, key) => sum + (state.days[key] ? dayPercent(normaliseDay(state.days[key])) : 0), 0) / keys.length);
  }

  function toast(message, isError = false) {
    const node = document.createElement('div');
    node.className = `toast${isError ? ' error' : ''}`;
    node.textContent = message;
    $('#toast-region').appendChild(node);
    window.setTimeout(() => node.remove(), 3000);
  }

  function statusMarkup(key, isDone) {
    const node = $(`[data-status="${key}"]`);
    if (!node) return;
    node.classList.toggle('done', isDone);
    node.textContent = isDone ? 'ВЫПОЛНЕНО' : 'ОЖИДАЕТ';
  }

  function updateDayHeader() {
    $('#selected-date').value = selectedDate;
    const isToday = selectedDate === todayKey();
    const weekday = formatWeekday(selectedDate).toLocaleUpperCase('ru-RU');
    $('#today-eyebrow').textContent = `${weekday}, ${formatDate(selectedDate, { day: 'numeric', month: 'long' }).toLocaleUpperCase('ru-RU')}${isToday ? ' · СЕГОДНЯ' : ''}`;
    $('#prev-day').disabled = false;
    $('#next-day').disabled = selectedDate >= todayKey();
    $('#next-day').style.opacity = selectedDate >= todayKey() ? '.35' : '1';
  }

  function renderSetList(day) {
    const list = $('#set-list');
    if (!day.pushups.sets.length) {
      list.innerHTML = '<span class="empty-inline">Подходы появятся здесь</span>';
      return;
    }
    list.innerHTML = day.pushups.sets.map((set, index) => `<span class="set-chip">${index + 1}: ${set.reps} <button type="button" data-action="remove-set" data-id="${escapeHTML(set.id)}" aria-label="Удалить подход">×</button></span>`).join('');
  }

  function renderTasks(kind, tasks) {
    const root = $(`#${kind}-task-list`);
    if (!tasks.length) {
      root.innerHTML = `<div class="empty-task">${kind === 'work' ? 'Добавь 1–3 главных результата на сегодня.' : 'Запиши бытовые дела, которые нужно закрыть.'}</div>`;
      return;
    }
    root.innerHTML = tasks.map(task => `<div class="task-row${task.done ? ' completed' : ''}"><input type="checkbox" data-action="toggle-task" data-kind="${kind}" data-id="${escapeHTML(task.id)}" ${task.done ? 'checked' : ''} aria-label="Отметить задачу ${escapeHTML(task.text)}" /><span>${escapeHTML(task.text)}</span><button type="button" data-action="delete-task" data-kind="${kind}" data-id="${escapeHTML(task.id)}" aria-label="Удалить задачу">×</button></div>`).join('');
  }

  function renderTodayIdeas(day) {
    const root = $('#today-idea-list');
    if (!day.ideas.length) {
      root.innerHTML = '<span class="empty-inline">Здесь будут твои сегодняшние идеи</span>';
      return;
    }
    root.innerHTML = day.ideas.slice(-3).reverse().map(idea => `<div class="idea-preview"><span>${escapeHTML(idea.text)}</span><time>${escapeHTML(idea.time || '')}</time></div>`).join('');
  }

  function syncFields(day) {
    const fields = {
      'wake.time': day.wake.time,
      'reading.minutes': day.reading.minutes,
      'reading.title': day.reading.title,
      'reading.pages': day.reading.pages,
      'reading.note': day.reading.note,
      'course.minutes': day.course.minutes,
      'course.name': day.course.name,
      'course.topic': day.course.topic,
      'work.minutes': day.work.minutes,
      'work.note': day.work.note,
      'home.note': day.home.note
    };
    Object.entries(fields).forEach(([field, value]) => {
      const input = $(`[data-field="${field}"]`);
      if (input && document.activeElement !== input) input.value = value ?? '';
    });
  }

  function updateDailyMetrics() {
    const day = getDay();
    const completed = completionMap(day);
    const count = Object.values(completed).filter(Boolean).length;
    const percent = Math.round(count / 7 * 100);
    $('#done-count').textContent = count;
    $('#section-counter').textContent = `${count} из 7`;
    $('#progress-percent').textContent = `${percent}% выполнено`;
    $('#ring-percent').textContent = `${percent}%`;
    $('#progress-ring').style.setProperty('--progress', `${percent}%`);
    $('#progress-ring').setAttribute('aria-label', `Выполнение дня: ${percent} процентов`);
    $('#progress-track-fill').style.width = `${percent}%`;
    $('#progress-message').textContent = percent === 100 ? 'Все семь направлений закрыты. Отличная работа.' : count === 0 ? 'Начни с одного выполненного действия.' : count < 4 ? 'Хороший старт. Продолжай в своём темпе.' : 'Ты уже близко. Закрой оставшиеся пункты.';

    const wakeDone = completed.wake;
    statusMarkup('wake', wakeDone);
    $('#wake-button-label').textContent = wakeDone ? 'Выполнено' : 'Отметить';
    $('[data-action="toggle-wake"]').classList.toggle('checked', wakeDone);
    const wakeTime = day.wake.time;
    if (wakeTime) {
      const [wakeHour, wakeMinute] = wakeTime.split(':').map(Number);
      const delta = wakeHour * 60 + wakeMinute - 7 * 60;
      $('#wake-metric').textContent = delta === 0 ? `Ровно в 07:00 · ${wakeTime}` : delta < 0 ? `На ${Math.abs(delta)} мин раньше · ${wakeTime}` : `Опоздание ${delta} мин · ${wakeTime}`;
    } else {
      $('#wake-metric').textContent = 'Запиши время и отметь выполнение';
    }

    const pushups = pushupTotal(day);
    const pushupPct = Math.min(100, Math.round(pushups / 100 * 100));
    $('#pushup-total').textContent = pushups;
    $('#pushup-percent').textContent = `${pushupPct}%`;
    $('#pushup-fill').style.width = `${pushupPct}%`;
    statusMarkup('pushups', completed.pushups);
    renderSetList(day);

    ['reading', 'course'].forEach(key => {
      const minutes = asNumber(day[key].minutes);
      const pct = Math.min(100, Math.round(minutes / 60 * 100));
      $(`#${key}-time-label`).textContent = `${minutes} / 60`;
      $(`#${key}-fill`).style.width = `${pct}%`;
      statusMarkup(key, completed[key]);
    });

    const workStats = taskStats(day.work.tasks), homeStats = taskStats(day.home.tasks);
    $('#work-task-count').textContent = `${workStats.done}/${workStats.total}`;
    $('#work-target-pill').textContent = `${workStats.total} задач`;
    $('#home-task-count').textContent = `${homeStats.done}/${homeStats.total}`;
    $('#home-target-pill').textContent = `${homeStats.total} дел`;
    statusMarkup('work', completed.work);
    statusMarkup('home', completed.home);
    renderTasks('work', day.work.tasks);
    renderTasks('home', day.home.tasks);

    $('#ideas-count').textContent = day.ideas.length;
    statusMarkup('ideas', completed.ideas);
    renderTodayIdeas(day);
    $('#active-streak').innerHTML = `${activeStreak()} <small>дней</small>`;
    $('#sidebar-streak').textContent = activeStreak();
    const week = daysInRange(todayKey(), 7);
    $('#week-average').innerHTML = `${averagePercent(week)}<small>%</small>`;
    $('#week-mini-bars').innerHTML = week.map(key => `<i style="height:${Math.max(3, dayPercent(state.days[key] ? normaliseDay(state.days[key]) : freshDay()) * .19)}px"></i>`).join('');
    $('#streak-sparkline').innerHTML = week.map(key => `<i style="height:${Math.max(3, completionCount(state.days[key] ? normaliseDay(state.days[key]) : freshDay()) * 2.4)}px"></i>`).join('');
  }

  function renderToday() {
    updateDayHeader();
    const day = getDay();
    syncFields(day);
    updateDailyMetrics();
  }

  function renderAnalytics() {
    const range = Number($('#analytics-range').value || 30);
    const dates = daysInRange(todayKey(), range);
    const existingDays = dates.filter(key => state.days[key]);
    const activeDays = existingDays.filter(key => completionCount(normaliseDay(state.days[key])) > 0).length;
    const fullyDone = existingDays.filter(key => completionCount(normaliseDay(state.days[key])) === 7).length;
    const avg = averagePercent(dates);
    const bestDay = existingDays.reduce((best, key) => Math.max(best, dayPercent(normaliseDay(state.days[key]))), 0);
    $('#analytics-kpis').innerHTML = [
      ['СРЕДНИЙ ПРОГРЕСС', `${avg}%`, 'В среднем по всем дням периода'],
      ['АКТИВНЫЕ ДНИ', `${activeDays}`, `Из ${range} календарных дней`],
      ['ИДЕАЛЬНЫЕ ДНИ', `${fullyDone}`, 'Закрыты все 7 пунктов'],
      ['ЛУЧШИЙ РЕЗУЛЬТАТ', `${bestDay}%`, 'Максимум за один день']
    ].map(([label, value, desc]) => `<article class="analytics-kpi"><span>${label}</span><strong>${value}</strong><p>${desc}</p></article>`).join('');

    const chartDates = range <= 7 ? dates : dates.filter((_, index) => index % (range <= 30 ? 2 : 6) === 0 || index === dates.length - 1);
    $('#activity-chart').innerHTML = chartDates.map(key => {
      const day = state.days[key] ? normaliseDay(state.days[key]) : freshDay();
      const pct = dayPercent(day);
      const label = range <= 7 ? dateFromKey(key).toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '') : dateFromKey(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
      return `<div class="chart-day" title="${formatDate(key)}: ${pct}%"><div class="chart-bar-wrap"><div class="chart-bar${key === todayKey() ? ' today' : ''}" style="height:${Math.max(3, pct)}%"></div></div><span class="chart-label">${escapeHTML(label)}</span></div>`;
    }).join('');
    $('#chart-period-label').textContent = `${range} ${range === 7 ? 'дней' : 'дней'}`;

    const consistency = HABITS.map(habit => {
      const count = dates.filter(key => state.days[key] && completionMap(normaliseDay(state.days[key]))[habit.key]).length;
      const pct = Math.round(count / range * 100);
      return { ...habit, count, pct };
    });
    $('#habit-consistency').innerHTML = `<div class="consistency-list">${consistency.map(item => `<div class="consistency-row"><span class="consistency-name">${item.label}</span><strong class="consistency-percent">${item.pct}%</strong><div class="consistency-track"><span style="width:${item.pct}%"></span></div></div>`).join('')}</div>`;

    const metricRows = [
      { key: 'wake', label: 'Подъём до 07:00', hit: day => !!day.wake.time && day.wake.time <= '07:00', value: day => day.wake.time || '', average: values => `${Math.round(values.filter(v => v && v <= '07:00').length / Math.max(1, values.filter(Boolean).length) * 100)}% вовремя`, best: values => values.filter(Boolean).sort()[0] || '—' },
      { key: 'pushups', label: 'Отжимания', hit: day => pushupTotal(day) >= 100, value: day => pushupTotal(day), average: values => `${Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.filter(v => v > 0).length))} повт.`, best: values => `${Math.max(0, ...values)} повт.` },
      { key: 'reading', label: 'Чтение', hit: day => asNumber(day.reading.minutes) >= 60, value: day => asNumber(day.reading.minutes), average: values => `${Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.filter(v => v > 0).length))} мин`, best: values => `${Math.max(0, ...values)} мин` },
      { key: 'course', label: 'Обучение', hit: day => asNumber(day.course.minutes) >= 60, value: day => asNumber(day.course.minutes), average: values => `${Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.filter(v => v > 0).length))} мин`, best: values => `${Math.max(0, ...values)} мин` },
      { key: 'work', label: 'Рабочие задачи', hit: day => taskStats(day.work.tasks).total > 0 && taskStats(day.work.tasks).done === taskStats(day.work.tasks).total, value: day => taskStats(day.work.tasks).done, average: values => `${(values.reduce((a, b) => a + b, 0) / Math.max(1, values.filter(v => v > 0).length)).toFixed(1)} задачи`, best: values => `${Math.max(0, ...values)} задач` },
      { key: 'home', label: 'Домашние дела', hit: day => taskStats(day.home.tasks).total > 0 && taskStats(day.home.tasks).done === taskStats(day.home.tasks).total, value: day => taskStats(day.home.tasks).done, average: values => `${(values.reduce((a, b) => a + b, 0) / Math.max(1, values.filter(v => v > 0).length)).toFixed(1)} дела`, best: values => `${Math.max(0, ...values)} дел` },
      { key: 'ideas', label: 'Идеи', hit: day => day.ideas.length > 0, value: day => day.ideas.length, average: values => `${(values.reduce((a, b) => a + b, 0) / Math.max(1, values.filter(v => v > 0).length)).toFixed(1)} идеи`, best: values => `${Math.max(0, ...values)} шт.` }
    ];
    $('#metrics-table-body').innerHTML = metricRows.map(metric => {
      const entries = existingDays.map(date => normaliseDay(state.days[date]));
      const values = entries.map(metric.value);
      const hitRate = `${Math.round(entries.filter(metric.hit).length / range * 100)}%`;
      const recorded = values.some(value => value !== '' && value !== 0);
      const average = recorded ? metric.average(values) : '—';
      const best = recorded ? metric.best(values) : '—';
      return `<tr><td><span class="habit-table-name"><i class="habit-table-dot"></i>${metric.label}</span></td><td>${hitRate}</td><td>${average}</td><td>${best}</td></tr>`;
    }).join('');
  }

  function getAllIdeas() {
    return Object.entries(state.days).flatMap(([date, day]) => normaliseDay(day).ideas.map(idea => ({ ...idea, date }))).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  }

  function renderIdeas() {
    const query = ($('#idea-search').value || '').trim().toLocaleLowerCase('ru-RU');
    const sort = $('#idea-sort').value;
    let ideas = getAllIdeas();
    if (query) ideas = ideas.filter(item => item.text.toLocaleLowerCase('ru-RU').includes(query));
    if (sort === 'oldest') ideas.reverse();
    $('#all-ideas-total').textContent = getAllIdeas().length;
    const root = $('#all-ideas-list');
    if (!ideas.length) {
      root.innerHTML = `<div class="empty-state">${query ? 'По этому запросу ничего не найдено.' : 'Пока здесь пусто. Запиши первую идею в разделе «Мой день» — она автоматически появится здесь.'}</div>`;
      return;
    }
    root.innerHTML = ideas.map(idea => `<article class="all-idea-card"><div class="all-idea-meta"><span>${escapeHTML(formatDate(idea.date))}${idea.time ? ` · ${escapeHTML(idea.time)}` : ''}</span><span>DAYMARK / IDEA</span></div><p>${escapeHTML(idea.text)}</p></article>`).join('');
  }

  function setView(view) {
    if (!['today', 'analytics', 'ideas', 'data'].includes(view)) return;
    activeView = view;
    $$('.view').forEach(node => node.classList.toggle('active', node.id === `view-${view}`));
    $$('[data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === view));
    $('#topbar-section').textContent = ({ today: 'МОЙ ДЕНЬ', analytics: 'АНАЛИТИКА', ideas: 'БАНК ИДЕЙ', data: 'МОИ ДАННЫЕ' })[view];
    if (view === 'today') renderToday();
    if (view === 'analytics') renderAnalytics();
    if (view === 'ideas') renderIdeas();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function addSet() {
    const input = $('#pushup-entry');
    const reps = Math.floor(asNumber(input.value));
    if (reps < 1 || reps > 500) { toast('Введи количество повторений от 1 до 500.', true); input.focus(); return; }
    const day = getDay();
    day.pushups.sets.push({ id: makeId(), reps, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
    input.value = '';
    saveState(); updateDailyMetrics();
    toast(`Добавлен подход: ${reps} повторений.`);
  }

  function addTask(kind) {
    const input = $(`#${kind}-task-entry`);
    const text = input.value.trim();
    if (!text) { toast('Сначала напиши задачу.', true); input.focus(); return; }
    getDay()[kind].tasks.push({ id: makeId(), text, done: false });
    input.value = '';
    saveState(); updateDailyMetrics();
    toast('Задача добавлена.');
  }

  function addIdea() {
    const input = $('#idea-entry');
    const text = input.value.trim();
    if (!text) { toast('Напиши идею перед сохранением.', true); input.focus(); return; }
    getDay().ideas.push({ id: makeId(), text, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
    input.value = '';
    saveState(); updateDailyMetrics();
    toast('Идея сохранена в твоём банке.');
  }

  function exportJSON() {
    const payload = { app: 'DAYMARK', version: 1, exportedAt: new Date().toISOString(), days: state.days, theme: state.theme };
    downloadFile(`daymark-backup-${todayKey()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    toast('Резервная копия подготовлена.');
  }

  function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
  function exportCSV() {
    const header = ['Дата', 'Выполнено', 'Подъём', 'Подъём выполнен', 'Отжимания', 'Чтение, мин', 'Книга', 'Страниц', 'Обучение, мин', 'Курс', 'Урок', 'Работа: задач выполнено', 'Работа: всего задач', 'Работа, мин', 'Дом: дел выполнено', 'Дом: всего дел', 'Количество идей', 'Рабочая заметка', 'Заметка по дому'];
    const rows = Object.keys(state.days).sort().map(key => {
      const day = normaliseDay(state.days[key]);
      const work = taskStats(day.work.tasks), home = taskStats(day.home.tasks);
      return [key, `${completionCount(day)}/7`, day.wake.time, completionMap(day).wake ? 'Да' : 'Нет', pushupTotal(day), day.reading.minutes, day.reading.title, day.reading.pages, day.course.minutes, day.course.name, day.course.topic, work.done, work.total, day.work.minutes, home.done, home.total, day.ideas.length, day.work.note, day.home.note].map(csvCell).join(',');
    });
    const csv = '\ufeff' + [header.map(csvCell).join(','), ...rows].join('\r\n');
    downloadFile(`daymark-report-${todayKey()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV-таблица подготовлена.');
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJSON(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.days || typeof parsed.days !== 'object' || Array.isArray(parsed.days)) throw new Error('Неверная структура файла.');
      let imported = 0;
      Object.entries(parsed.days).forEach(([key, value]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
        const incoming = normaliseDay(value);
        const existing = state.days[key] ? normaliseDay(state.days[key]) : freshDay();
        // Merge conservatively: preserve existing content and add imported items with unique IDs.
        const merged = {
          ...existing,
          wake: { ...incoming.wake, ...existing.wake, done: !!(incoming.wake.done || existing.wake.done), time: existing.wake.time || incoming.wake.time },
          pushups: { sets: mergeById(existing.pushups.sets, incoming.pushups.sets) },
          reading: {
            minutes: asNumber(existing.reading.minutes) || asNumber(incoming.reading.minutes),
            title: existing.reading.title || incoming.reading.title,
            pages: existing.reading.pages || incoming.reading.pages,
            note: existing.reading.note || incoming.reading.note
          },
          course: {
            minutes: asNumber(existing.course.minutes) || asNumber(incoming.course.minutes),
            name: existing.course.name || incoming.course.name,
            topic: existing.course.topic || incoming.course.topic
          },
          work: {
            minutes: asNumber(existing.work.minutes) || asNumber(incoming.work.minutes),
            note: existing.work.note || incoming.work.note,
            tasks: mergeById(existing.work.tasks, incoming.work.tasks)
          },
          home: {
            note: existing.home.note || incoming.home.note,
            tasks: mergeById(existing.home.tasks, incoming.home.tasks)
          },
          ideas: mergeById(existing.ideas, incoming.ideas)
        };
        state.days[key] = normaliseDay(merged);
        imported++;
      });
      if (parsed.theme === 'dark' || parsed.theme === 'light') state.theme = parsed.theme;
      saveState(); applyTheme(); renderCurrentView();
      toast(`Импорт завершён. Обработано дней: ${imported}.`);
    } catch (error) {
      toast(`Не удалось импортировать файл: ${error.message}`, true);
    }
  }

  function mergeById(existing, incoming) {
    const result = [...existing];
    const seen = new Set(existing.map(item => item.id));
    incoming.forEach(item => { if (!seen.has(item.id)) { result.push({ ...item, id: seen.has(item.id) ? makeId() : item.id }); seen.add(item.id); } });
    return result;
  }

  function renderCurrentView() {
    if (activeView === 'today') renderToday();
    if (activeView === 'analytics') renderAnalytics();
    if (activeView === 'ideas') renderIdeas();
  }

  function applyTheme() {
    document.body.classList.toggle('dark-theme', state.theme === 'dark');
    $('#theme-icon').textContent = state.theme === 'dark' ? '☀' : '☾';
    $('meta[name="theme-color"]').setAttribute('content', state.theme === 'dark' ? '#111a16' : '#17231f');
  }

  // Navigation is delegated so controls remain functional after rendering dynamic cards.
  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { setView(viewButton.dataset.view); return; }
    const goView = event.target.closest('[data-go-view]');
    if (goView) { setView(goView.dataset.goView); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const { action: name, kind, id } = action.dataset;
    if (name === 'toggle-wake') {
      getDay().wake.done = !getDay().wake.done;
      saveState(); updateDailyMetrics();
      toast(getDay().wake.done ? 'Подъём отмечен.' : 'Отметка снята.');
    } else if (name === 'add-set') addSet();
    else if (name === 'remove-set') {
      getDay().pushups.sets = getDay().pushups.sets.filter(set => set.id !== id);
      saveState(); updateDailyMetrics(); toast('Подход удалён.');
    } else if (name === 'add-task') addTask(kind);
    else if (name === 'toggle-task') {
      const task = getDay()[kind].tasks.find(item => item.id === id);
      if (task) task.done = !task.done;
      saveState(); updateDailyMetrics();
    } else if (name === 'delete-task') {
      getDay()[kind].tasks = getDay()[kind].tasks.filter(item => item.id !== id);
      saveState(); updateDailyMetrics(); toast('Задача удалена.');
    } else if (name === 'add-idea') addIdea();
    else if (name === 'export-json') exportJSON();
    else if (name === 'export-csv') exportCSV();
    else if (name === 'clear-data') {
      if (window.confirm('Удалить всю историю DAYMARK из этого браузера? Это действие нельзя отменить.')) {
        state.days = {}; saveState(); renderCurrentView(); updateDailyMetrics(); toast('История очищена.');
      }
    }
  });

  document.addEventListener('input', event => {
    const field = event.target.dataset.field;
    if (!field) return;
    const [section, name] = field.split('.');
    if (!getDay()[section]) return;
    getDay()[section][name] = event.target.type === 'number' ? asNumber(event.target.value) : event.target.value;
    saveState();
    if (activeView === 'today') updateDailyMetrics();
  });

  $('#prev-day').addEventListener('click', () => { selectedDate = shiftDate(selectedDate, -1); renderToday(); });
  $('#next-day').addEventListener('click', () => { if (selectedDate < todayKey()) { selectedDate = shiftDate(selectedDate, 1); renderToday(); } });
  $('#go-today').addEventListener('click', () => { selectedDate = todayKey(); renderToday(); });
  $('#selected-date').addEventListener('change', event => { if (event.target.value) { selectedDate = event.target.value; renderToday(); } });
  $('#theme-toggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveState(); applyTheme(); });
  $('#analytics-range').addEventListener('change', renderAnalytics);
  $('#idea-search').addEventListener('input', renderIdeas);
  $('#idea-sort').addEventListener('change', renderIdeas);
  $('#import-file').addEventListener('change', event => { importJSON(event.target.files[0]); event.target.value = ''; });

  // Enter submits compact add fields without requiring a mouse.
  ['pushup-entry', 'work-task-entry', 'home-task-entry'].forEach(id => {
    $(`#${id}`).addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (id === 'pushup-entry') addSet();
      if (id === 'work-task-entry') addTask('work');
      if (id === 'home-task-entry') addTask('home');
    });
  });

  applyTheme();
  renderToday();
})();
