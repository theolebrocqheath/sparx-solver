const $ = (sel) => document.querySelector(sel);

let sessionId = null;
let homeworkTasks = [];

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

// Login
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const errorEl = $('#login-error');
  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Logging in...';
  btn.querySelector('.spinner').classList.remove('hidden');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school: $('#school').value,
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
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Log In';
    btn.querySelector('.spinner').classList.add('hidden');
  }
});

// Load homework
async function loadHomework() {
  $('#homework-loading').classList.remove('hidden');
  $('#homework-list').classList.add('hidden');
  $('#homework-empty').classList.add('hidden');

  try {
    const res = await fetch(`/api/homework/${sessionId}`);
    const data = await res.json();
    homeworkTasks = data.homework || [];

    if (homeworkTasks.length === 0) {
      $('#homework-empty').classList.remove('hidden');
    } else {
      const list = $('#homework-list');
      list.innerHTML = '';
      homeworkTasks.forEach((task, i) => {
        const item = document.createElement('div');
        item.className = 'homework-item';
        item.innerHTML = `
          <div class="hw-info">
            <h3>${escapeHtml(task.name)}</h3>
            <p>${escapeHtml(task.status || 'Not started')}${task.questions ? ' &middot; ' + escapeHtml(task.questions) : ''}</p>
          </div>
          <div class="hw-action">Solve &rarr;</div>
        `;
        item.addEventListener('click', () => startSolving(task));
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

// Solve a task
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
      body: JSON.stringify({ taskUrl: task.url }),
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
          try {
            const event = JSON.parse(line.slice(6));
            handleSolverEvent(event);
          } catch {}
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
    const pct = Math.min(100, (solved / Math.max(total, 10)) * 100);
    $('#progress-bar').style.width = `${pct}%`;
  }

  if (event.type === 'complete') {
    $('#progress-bar').style.width = '100%';
  }
}

// Back to homework
$('#back-btn').addEventListener('click', () => {
  showScreen('dashboard');
  loadHomework();
});

// Logout
$('#logout-btn').addEventListener('click', async () => {
  if (sessionId) {
    await fetch(`/api/logout/${sessionId}`, { method: 'POST' }).catch(() => {});
    sessionId = null;
  }
  showScreen('login');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
