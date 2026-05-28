/* ============================================================
   TASKFLOW — script.js
   Features:
     - Full CRUD (Create, Read, Update, Delete)
     - localStorage persistence (auto-save on every change)
     - Advanced filtering: All / Active / Completed / High / Categories
     - Sorting: Newest, Oldest, Priority, A–Z, Due date
     - Live search across task text and notes
     - Priority & category tagging
     - Due date tracking + overdue detection
     - Multi-select bulk actions (mark done, delete)
     - Edit modal for full task editing
     - Stats panel and progress bar
     - Delegated event listeners on the task list
   ============================================================ */

'use strict';

/* ── Constants ───────────────────────────────────────────── */
const STORAGE_KEY = 'taskflow_v1';

/* ── State ───────────────────────────────────────────────── */
let tasks         = [];   // Array of task objects
let currentFilter = 'all';
let currentSort   = 'newest';
let searchQuery   = '';
let selected      = new Set();  // IDs of selected tasks
let editingTaskId = null;       // ID being edited in modal

/* ── Selectors ───────────────────────────────────────────── */
const taskList        = document.getElementById('taskList');
const taskInput       = document.getElementById('taskInput');
const addBtn          = document.getElementById('addBtn');
const prioritySelect  = document.getElementById('prioritySelect');
const categorySelect  = document.getElementById('categorySelect');
const dueInput        = document.getElementById('dueInput');
const noteInput       = document.getElementById('noteInput');
const searchInput     = document.getElementById('searchInput');
const sortSelect      = document.getElementById('sortSelect');
const emptyState      = document.getElementById('emptyState');
const bulkBar         = document.getElementById('bulkBar');
const bulkLabel       = document.getElementById('bulkLabel');
const bulkComplete    = document.getElementById('bulkComplete');
const bulkDelete      = document.getElementById('bulkDelete');
const bulkClear       = document.getElementById('bulkClear');
const clearCompleted  = document.getElementById('clearCompletedBtn');
const progressFill    = document.getElementById('progressFill');
const progressPct     = document.getElementById('progressPct');
const pageTitle       = document.getElementById('pageTitle');
const pageSubtitle    = document.getElementById('pageSubtitle');

// Stats
const statTotal   = document.getElementById('statTotal');
const statDone    = document.getElementById('statDone');
const statLeft    = document.getElementById('statLeft');
const statOverdue = document.getElementById('statOverdue');

// Sidebar counts
const countAll       = document.getElementById('countAll');
const countActive    = document.getElementById('countActive');
const countCompleted = document.getElementById('countCompleted');
const countHigh      = document.getElementById('countHigh');

// Modal
const modalOverlay  = document.getElementById('modalOverlay');
const modalClose    = document.getElementById('modalClose');
const modalCancel   = document.getElementById('modalCancel');
const modalSave     = document.getElementById('modalSave');
const editText      = document.getElementById('editText');
const editNote      = document.getElementById('editNote');
const editPriority  = document.getElementById('editPriority');
const editCategory  = document.getElementById('editCategory');
const editDue       = document.getElementById('editDue');

/* ── Utilities ───────────────────────────────────────────── */

/** Generate a unique ID */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Get today's ISO date string (YYYY-MM-DD) */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Check whether a due date is overdue */
function isOverdue(due) {
  return !!due && due < today();
}

/** Format a due date into a human-friendly label */
function formatDue(due) {
  if (!due) return '';
  if (due === today()) return 'Due today';
  const d = new Date(due + 'T00:00:00');
  const label = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return isOverdue(due) ? '⚠ ' + label : label;
}

/** Map priority string to a sort weight */
function priorityWeight(p) {
  return p === 'high' ? 3 : p === 'medium' ? 2 : 1;
}

/* ── Persistence ─────────────────────────────────────────── */

/** Load tasks from localStorage into the tasks array */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch (e) {
    tasks = [];
  }
}

/** Persist the current tasks array to localStorage */
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/* ── Filtering & Sorting ─────────────────────────────────── */

/** Return the filtered + sorted list of tasks to display */
function getVisibleTasks() {
  let list = [...tasks];

  // Filter by view
  switch (currentFilter) {
    case 'active':    list = list.filter(t => !t.completed); break;
    case 'completed': list = list.filter(t => t.completed); break;
    case 'high':      list = list.filter(t => t.priority === 'high'); break;
    case 'cat-work':     list = list.filter(t => t.category === 'work'); break;
    case 'cat-personal': list = list.filter(t => t.category === 'personal'); break;
    case 'cat-urgent':   list = list.filter(t => t.category === 'urgent'); break;
    case 'cat-other':    list = list.filter(t => t.category === 'other'); break;
    default: break; // 'all'
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(t =>
      t.text.toLowerCase().includes(q) ||
      (t.note && t.note.toLowerCase().includes(q))
    );
  }

  // Sort
  switch (currentSort) {
    case 'oldest':   list.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'priority': list.sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority)); break;
    case 'az':       list.sort((a, b) => a.text.localeCompare(b.text)); break;
    case 'due':
      list.sort((a, b) => {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      });
      break;
    default: // newest
      list.sort((a, b) => b.createdAt - a.createdAt);
  }

  return list;
}

/* ── CRUD Operations ─────────────────────────────────────── */

/** Create a new task and add it to the list */
function addTask() {
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.focus();
    taskInput.style.borderColor = 'var(--danger)';
    setTimeout(() => { taskInput.style.borderColor = ''; }, 1200);
    return;
  }

  const task = {
    id:        genId(),
    text:      text,
    note:      noteInput.value.trim(),
    priority:  prioritySelect.value,
    category:  categorySelect.value,
    due:       dueInput.value || null,
    completed: false,
    createdAt: Date.now(),
  };

  tasks.unshift(task); // newest first in raw array
  saveTasks();

  // Reset inputs
  taskInput.value   = '';
  noteInput.value   = '';
  dueInput.value    = '';
  prioritySelect.value = 'medium';
  categorySelect.value = 'other';
  taskInput.focus();

  render();
}

/** Toggle the completed state of a task */
function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveTasks();
    render();
  }
}

/** Permanently delete a task */
function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  selected.delete(id);
  saveTasks();
  render();
}

/** Open the edit modal pre-filled with the task's data */
function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId        = id;
  editText.value       = task.text;
  editNote.value       = task.note || '';
  editPriority.value   = task.priority;
  editCategory.value   = task.category;
  editDue.value        = task.due || '';
  modalOverlay.classList.add('open');
  editText.focus();
}

/** Save changes from the edit modal */
function saveEdit() {
  const text = editText.value.trim();
  if (!text) { editText.focus(); return; }

  const task = tasks.find(t => t.id === editingTaskId);
  if (task) {
    task.text     = text;
    task.note     = editNote.value.trim();
    task.priority = editPriority.value;
    task.category = editCategory.value;
    task.due      = editDue.value || null;
    saveTasks();
  }
  closeModal();
  render();
}

/** Close the edit modal */
function closeModal() {
  modalOverlay.classList.remove('open');
  editingTaskId = null;
}

/* ── Bulk Actions ────────────────────────────────────────── */

function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  updateBulkBar();
  render();
}

function updateBulkBar() {
  if (selected.size > 0) {
    bulkBar.classList.add('visible');
    bulkLabel.textContent = selected.size + ' selected';
  } else {
    bulkBar.classList.remove('visible');
  }
}

function bulkMarkDone() {
  tasks.forEach(t => { if (selected.has(t.id)) t.completed = true; });
  selected.clear();
  saveTasks();
  updateBulkBar();
  render();
}

function bulkDeleteSelected() {
  tasks = tasks.filter(t => !selected.has(t.id));
  selected.clear();
  saveTasks();
  updateBulkBar();
  render();
}

function clearSelection() {
  selected.clear();
  updateBulkBar();
  render();
}

/* ── Stats & UI Updates ──────────────────────────────────── */

function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const left    = total - done;
  const overdue = tasks.filter(t => !t.completed && isOverdue(t.due)).length;
  const pct     = total ? Math.round((done / total) * 100) : 0;

  statTotal.textContent   = total;
  statDone.textContent    = done;
  statLeft.textContent    = left;
  statOverdue.textContent = overdue;

  progressFill.style.width = pct + '%';
  progressPct.textContent  = pct + '%';

  // Sidebar counts
  countAll.textContent       = tasks.length;
  countActive.textContent    = tasks.filter(t => !t.completed).length;
  countCompleted.textContent = done;
  countHigh.textContent      = tasks.filter(t => t.priority === 'high').length;
}

/** Update page title & subtitle based on active filter */
const FILTER_META = {
  'all':          ['All Tasks',      'Manage everything in one place'],
  'active':       ['Active Tasks',   'Tasks still in progress'],
  'completed':    ['Completed',      'Tasks you\'ve finished'],
  'high':         ['High Priority',  'Tasks that need attention now'],
  'cat-work':     ['Work',           'Your work-related tasks'],
  'cat-personal': ['Personal',       'Your personal tasks'],
  'cat-urgent':   ['Urgent',         'Tasks that can\'t wait'],
  'cat-other':    ['Other',          'Miscellaneous tasks'],
};

function updateFilterUI(filter) {
  const [title, sub] = FILTER_META[filter] || ['Tasks', ''];
  pageTitle.textContent    = title;
  pageSubtitle.textContent = sub;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
}

/* ── DOM Rendering ───────────────────────────────────────── */

/** Build a single <li> element for a task */
function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className = [
    'task-item',
    task.completed ? 'completed-item' : '',
    'p-' + task.priority,
    selected.has(task.id) ? 'selected' : '',
  ].filter(Boolean).join(' ');
  li.dataset.id = task.id;

  // --- Checkbox ---
  const cb = document.createElement('div');
  cb.className = 'task-checkbox' + (task.completed ? ' checked' : '');
  cb.setAttribute('role', 'checkbox');
  cb.setAttribute('aria-checked', String(task.completed));
  cb.setAttribute('tabindex', '0');
  cb.dataset.action = 'toggle';

  // --- Body ---
  const body = document.createElement('div');
  body.className = 'task-body';

  const textEl = document.createElement('span');
  textEl.className = 'task-text' + (task.completed ? ' done' : '');
  textEl.textContent = task.text;
  body.appendChild(textEl);

  if (task.note) {
    const noteEl = document.createElement('p');
    noteEl.className = 'task-note';
    noteEl.textContent = task.note;
    body.appendChild(noteEl);
  }

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const priB = document.createElement('span');
  priB.className = 'priority-badge ' + task.priority;
  priB.textContent = task.priority;
  meta.appendChild(priB);

  const catB = document.createElement('span');
  catB.className = 'cat-badge ' + task.category;
  catB.textContent = task.category;
  meta.appendChild(catB);

  if (task.due) {
    const dueB = document.createElement('span');
    dueB.className = 'due-badge' + (isOverdue(task.due) && !task.completed ? ' overdue' : '');
    dueB.textContent = formatDue(task.due);
    meta.appendChild(dueB);
  }

  body.appendChild(meta);

  // --- Actions ---
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const selBtn = document.createElement('button');
  selBtn.className = 'action-btn sel-btn';
  selBtn.textContent = selected.has(task.id) ? '✓' : '□';
  selBtn.title = 'Select';
  selBtn.dataset.action = 'select';

  const editBtn = document.createElement('button');
  editBtn.className = 'action-btn edit-btn';
  editBtn.textContent = 'Edit';
  editBtn.dataset.action = 'edit';

  const delBtn = document.createElement('button');
  delBtn.className = 'action-btn del-btn';
  delBtn.textContent = 'Del';
  delBtn.dataset.action = 'delete';

  actions.appendChild(selBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  li.appendChild(cb);
  li.appendChild(body);
  li.appendChild(actions);

  return li;
}

/** Build a divider <li> with a label */
function buildDivider(label) {
  const li = document.createElement('li');
  li.className = 'list-divider';
  li.textContent = label;
  return li;
}

/** Main render function — clears and rebuilds the task list */
function render() {
  const visible = getVisibleTasks();

  taskList.innerHTML = '';

  if (visible.length === 0) {
    emptyState.classList.add('visible');
    updateStats();
    return;
  }
  emptyState.classList.remove('visible');

  // Separate active and completed for divider
  const active    = visible.filter(t => !t.completed);
  const completed = visible.filter(t => t.completed);

  // Render active tasks
  active.forEach(t => taskList.appendChild(buildTaskItem(t)));

  // Render completed section with divider (skip if filter is 'active' or 'high')
  if (completed.length > 0 && currentFilter !== 'active' && currentFilter !== 'high') {
    if (active.length > 0) {
      taskList.appendChild(buildDivider('Completed'));
    }
    completed.forEach(t => taskList.appendChild(buildTaskItem(t)));
  }

  // If filter is 'completed', render all visible (already only completed)
  if (currentFilter === 'completed') {
    taskList.innerHTML = '';
    visible.forEach(t => taskList.appendChild(buildTaskItem(t)));
  }

  updateStats();
}

/* ── Delegated Event Listener ────────────────────────────── */
/*
  Instead of attaching listeners to every button,
  we attach ONE listener to the task list and check
  the action data-attribute to decide what to do.
*/
taskList.addEventListener('click', function(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const li = e.target.closest('.task-item');
  if (!li) return;
  const id = li.dataset.id;

  switch (actionEl.dataset.action) {
    case 'toggle': toggleTask(id); break;
    case 'select': toggleSelect(id); break;
    case 'edit':   openEditModal(id); break;
    case 'delete': deleteTask(id); break;
  }
});

// Support keyboard activation of checkboxes
taskList.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const cb = e.target.closest('.task-checkbox');
  if (!cb) return;
  e.preventDefault();
  const li = cb.closest('.task-item');
  if (li) toggleTask(li.dataset.id);
});

/* ── Sidebar Nav Delegation ──────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    updateFilterUI(currentFilter);
    render();
  });
});

/* ── Top Controls ────────────────────────────────────────── */
addBtn.addEventListener('click', addTask);

taskInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask();
});

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  render();
});

sortSelect.addEventListener('change', e => {
  currentSort = e.target.value;
  render();
});

/* ── Bulk Bar Controls ───────────────────────────────────── */
bulkComplete.addEventListener('click', bulkMarkDone);
bulkDelete.addEventListener('click', bulkDeleteSelected);
bulkClear.addEventListener('click', clearSelection);

/* ── Clear Completed ─────────────────────────────────────── */
clearCompleted.addEventListener('click', () => {
  tasks = tasks.filter(t => !t.completed);
  selected.clear();
  saveTasks();
  updateBulkBar();
  render();
});

/* ── Modal Controls ──────────────────────────────────────── */
modalSave.addEventListener('click', saveEdit);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
editText.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveEdit();
});

/* ── Boot ────────────────────────────────────────────────── */
(function init() {
  loadTasks();
  updateFilterUI(currentFilter);
  render();
})();
