const $ = (sel) => document.querySelector(sel);

let sessionId = null;
let selectedSchool = null;
let searchTimeout = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${id}-screen`).classList.add('active');
}

function addLog(message, type = 'progress') {
  const log = $('#log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// --- School search ---
$('#school').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimeout);
  selectedSchool = null;
  $('#school-slug').value = '';
  $('#google-btn').disabled = true;
  $('#google-hint').classList.remove('hidden');

  if (q.length < 2) {
    $('#school-dropdown').classList.add('hidden');
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/schools?q=${encodeURIComponent(q)}`);
      const schools = await res.json();
      const dropdown = $('#school-dropdown');

      if (schools.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-item muted">No schools found</div>';
        dropdown.classList.remove('hidden');
        return;
      }

      dropdown.innerHTML = schools
        .map(
          (s) =>
            `<div class="dropdown-item" data-slug="${escapeAttr(s.slug)}" data-name="${escapeAttr(s.name)}">
              <span class="school-name">${escapeHtml(s.name)}</span>
              <span class="school-town">${escapeHtml(s.town)}</span>
            </div>`
        )
        .join('');

      dropdown.querySelectorAll('.dropdown-item[data-slug]').forEach((item) => {
        item.addEventListener('click', () => {
          selectedSchool = { slug: item.dataset.slug, name: item.dataset.name };
          $('#school').value = item.dataset.name;
          $('#school-slug').value = item.dataset.slug;
          dropdown.classList.add('hidden');
          $('#google-btn').disabled = false;
          $('#google-hint').classList.add('hidden');
        });
      });

      dropdown.classList.remove('hidden');
    } catch {}
  }, 300);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.school-search')) {
    $('#school-dropdown').classList.add('hidden');
  }
});

// --- Login with username/password ---
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedSchool) {
    showError('Please select a school from the dropdown');
    return;
  }

  const btn = $('#login-btn');
  hideError();
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Logging in...';
  btn.querySelector('.spinner').classList.remove('hidden');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolSlug: selectedSchool.slug,
        username: $('#username').value,
        password: $('#password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    sessionId = data.sessionId;
    $('#student-name').textContent = data.studentName;
    $('#module-badge').textContent = data.module;
    showScreen('dashboard');
    loadHomework();
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Log In';
    btn.querySelector('.spinner').classList.add('hidden');
  }
});

// --- Login with Google ---
$('#google-btn').addEventListener('click', async () => {
  if (!selectedSchool) return;

  const btn = $('#google-btn');
  hideError();
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Opening browser — sign in with Google...';

  try {
    const res = await fetch('/api/login-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolSlug: selectedSchool.slug }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    sessionId = data.sessionId;
    $('#student-name').textContent = data.studentName;
    $('#module-badge').textContent = data.module;
    showScreen('dashboard');
    loadHomework();
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Log in with Google';
  }
});

// --- Homework ---
async function loadHomework() {
  $('#homework-loading').classList.remove('hidden');
  $('#homework-list').classList.add('hidden');
  $('#homework-empty').classList.add('hidden');

  try {
    const res = await fetch(`/api/homework/${sessionId}`);
    const data = await res.json();
    const homeworkTasks = data.homework || [];

    if (homeworkTasks.length === 0) {
      $('#homework-empty').classList.remove('hidden');
    } else {
      const list = $('#homework-list');
      list.innerHTML = '';
      homeworkTasks.forEach((task) => {
        const item = document.createElement('div');
        const done = task.status === 'Completed';
        item.className = `homework-item${done ? ' hw-done' : ''}`;
        item.innerHTML = `
          <div class="hw-info">
            <h3>${escapeHtml(task.name)}</h3>
            <p class="${done ? 'hw-completed' : ''}">${escapeHtml(task.status || 'Not started')}</p>
          </div>
          <div class="hw-action">${done ? '&#10003; Done' : 'Solve &rarr;'}</div>
        `;
        if (!done) item.addEventListener('click', () => startSolving(task));
        list.appendChild(item);
      });
      list.classList.remove('hidden');
    }
  } catch (err) {
    $('#homework-list').innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    $('#homework-list').classList.remove('hidden');
  } finally {
    $('#homework-loading').classList.add('hidden');
  }
}

// --- Solver ---
async function startSolving(task) {
  showScreen('solver');
  $('#task-title').textContent = task.name || 'Solving...';
  $('#stat-solved').textContent = '0';
  $('#stat-failed').textContent = '0';
  $('#stat-current').textContent = '0';
  $('#progress-bar').style.width = '0%';
  $('#log').innerHTML = '';

  addLog('Starting solver...', 'status');

  try {
    const res = await fetch(`/api/solve/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskUrl: task.url, taskName: task.name }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { handleSolverEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  } catch (err) {
    addLog(`Connection error: ${err.message}`, 'error');
  }
}

function handleSolverEvent(event) {
  addLog(event.message, event.type);
  if (event.solved !== undefined) $('#stat-solved').textContent = event.solved;
  if (event.failed !== undefined) $('#stat-failed').textContent = event.failed;
  if (event.questionNum !== undefined) $('#stat-current').textContent = event.questionNum;

  const solved = parseInt($('#stat-solved').textContent) || 0;
  const failed = parseInt($('#stat-failed').textContent) || 0;
  const total = solved + failed;
  if (total > 0) {
    $('#progress-bar').style.width = `${Math.min(100, (solved / Math.max(total, 10)) * 100)}%`;
  }
  if (event.type === 'complete') {
    $('#progress-bar').style.width = '100%';
  }
}

// --- Navigation ---
$('#back-btn').addEventListener('click', () => {
  showScreen('dashboard');
  loadHomework();
});

$('#logout-btn').addEventListener('click', async () => {
  if (sessionId) {
    await fetch(`/api/logout/${sessionId}`, { method: 'POST' }).catch(() => {});
    sessionId = null;
  }
  selectedSchool = null;
  $('#school').value = '';
  $('#school-slug').value = '';
  $('#google-btn').disabled = true;
  $('#google-hint').classList.remove('hidden');
  showScreen('login');
});

// --- Helpers ---
function showError(msg) {
  const el = $('#login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  $('#login-error').classList.add('hidden');
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
