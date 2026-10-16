import { starterRoute } from './route-data.js?v=6';
import { loadState, saveState } from './storage.js';

/**
 * LearnMap browser application.
 *
 * The UI is intentionally split into small responsibilities:
 * - state helpers and rendering functions keep view updates predictable;
 * - route actions own progress and recalculation rules;
 * - delegated event handlers connect data-action controls to those actions.
 *
 * When a backend is introduced, route actions can move into a service without
 * changing the map and dashboard renderers.
 */

const state = loadState();
const dom = {
  homeView: document.querySelector('#view-home'),
  routeView: document.querySelector('#view-route'),
  dialogRoot: document.querySelector('#dialog-root'),
  toast: document.querySelector('#toast'),
  currentBreadcrumb: document.querySelector('#crumb-current'),
  todayLabel: document.querySelector('#today-label'),
  helpButton: document.querySelector('#help-button'),
};

let toastTimer;

// -----------------------------------------------------------------------------
// General helpers
// -----------------------------------------------------------------------------

function escapeHtml(value) {
  const replacements = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function recordActivity(title, detail, icon = '✓') {
  state.activity.push({ title, detail, icon, at: new Date().toISOString() });
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('show'), 2500);
}

function persistAndRender() {
  saveState(state);
  renderApp();
}

function completedNodeCount() {
  return state.nodes.filter((node) => node.status === 'completed').length;
}

function completionPercent() {
  if (state.nodes.length === 0) return 0;
  return Math.round((completedNodeCount() / state.nodes.length) * 100);
}

function nextNode() {
  return state.nodes.find((node) => node.status === 'current')
    || state.nodes.find((node) => node.status === 'available')
    || null;
}

/** Recompute which unfinished nodes are blocked, ready, or the next focus. */
function refreshNodeAvailability() {
  state.nodes.forEach((node) => {
    if (node.status === 'completed') return;

    const prerequisitesComplete = node.prerequisites.every((prerequisiteId) => (
      state.nodes.find((candidate) => candidate.id === prerequisiteId)?.status === 'completed'
    ));

    if (!prerequisitesComplete) {
      node.status = 'locked';
    } else if (node.status === 'locked') {
      node.status = 'available';
    }
  });

  const currentNodes = state.nodes.filter((node) => node.status === 'current');
  if (currentNodes.length > 1) {
    currentNodes.slice(1).forEach((node) => { node.status = 'available'; });
  }

  if (!state.nodes.some((node) => node.status === 'current')) {
    const firstAvailableNode = state.nodes.find((node) => node.status === 'available');
    if (firstAvailableNode) firstAvailableNode.status = 'current';
  }
}

function statusLabel(status) {
  const labels = {
    completed: 'Completed',
    current: 'Your next step',
    available: 'Ready when you are',
    locked: 'Locked',
  };

  return labels[status] || 'Not started';
}

function setView(view) {
  state.view = view;
  persistAndRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -----------------------------------------------------------------------------
// Shared app shell and dashboard
// -----------------------------------------------------------------------------

function renderApp() {
  dom.todayLabel.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.view);
  });

  dom.homeView.classList.toggle('hidden', state.view !== 'home');
  dom.routeView.classList.toggle('hidden', state.view !== 'route');
  dom.currentBreadcrumb.textContent = state.view === 'route'
    ? 'My learning route'
    : 'Overview';

  renderDashboard();
  renderLearningRoute();
}

function renderDashboard() {
  if (!state.goal) {
    renderDashboardEmptyState();
    return;
  }

  const goal = state.goal;
  const upcomingNode = nextNode();
  const remainingHours = state.nodes
    .filter((node) => node.status !== 'completed')
    .reduce((total, node) => total + node.hours, 0);

  const routePreview = state.nodes.slice(0, 5).map((node, index) => {
    const marker = node.status === 'completed'
      ? '✓'
      : node.status === 'current'
        ? '•'
        : String(index + 1).padStart(2, '0');

    return `
      <button class="preview-stop ${node.status} ${node.status === 'completed' ? 'done-line' : ''}"
        data-action="select-node" data-id="${escapeHtml(node.id)}">
        <span class="stop-node">${marker}</span>
        <strong>${escapeHtml(node.title)}</strong>
        <small>${node.hours}h · ${escapeHtml(node.type)}</small>
      </button>`;
  }).join('');

  const recentActivity = renderRecentActivity();
  const latestRevision = state.revisions.at(-1);

  dom.homeView.innerHTML = `
    <div class="welcome-row">
      <div>
        <div class="eyebrow">YOUR LEARNING SPACE</div>
        <h1>Good ${greeting()}, Sam.</h1>
        <p>A little progress today moves you closer to what’s next.</p>
      </div>
      <button class="button button-primary" data-action="open-route">
        Continue learning <span>→</span>
      </button>
    </div>

    <div class="journey-card">
      <div class="journey-top">
        <div class="destination-panel">
          <div class="card-overline">YOUR DESTINATION</div>
          <h2 class="goal-title">${escapeHtml(goal.title)}</h2>
          <p class="goal-summary">${escapeHtml(goal.description || defaultGoalSummary())}</p>
          <div class="goal-meta">
            <span><i class="meta-dot"></i>${escapeHtml(goal.level)} starting point</span>
            <span><i class="meta-icon">◷</i>${escapeHtml(goal.weekly)} hours / week</span>
            <span><i class="meta-icon">◇</i>${goal.budget === 'free' ? 'Free resources' : 'Flexible resources'}</span>
          </div>
        </div>

        <div class="stats-panel">
          <div class="stat-heading">ROUTE PROGRESS</div>
          <div class="progress-big">${completionPercent()}<small>% complete</small></div>
          <div class="progress-track"><div class="progress-fill" style="width:${completionPercent()}%"></div></div>
          <div class="progress-caption">
            ${completedNodeCount()} of ${state.nodes.length} steps completed · about ${remainingHours} hours to go
          </div>
          <div class="next-step">
            <div class="next-step-copy">
              <small>UP NEXT</small>
              <strong>${upcomingNode ? escapeHtml(upcomingNode.title) : 'Destination reached!'}</strong>
            </div>
            <button class="next-arrow"
              data-action="${upcomingNode ? 'select-node' : 'open-route'}"
              ${upcomingNode ? `data-id="${escapeHtml(upcomingNode.id)}"` : ''}
              aria-label="Open next step">→</button>
          </div>
        </div>
      </div>

      <div class="route-preview">
        <div class="preview-header">
          <h2>Your route at a glance</h2>
          <button class="text-link" data-action="open-route">Explore full route →</button>
        </div>
        <div class="route-line">${routePreview}</div>
      </div>
    </div>

    <div class="bottom-grid">
      <div class="panel">
        <div class="panel-heading">
          <h2>Recent activity</h2>
          <span>${state.activity.length ? `${state.activity.length} updates` : 'Just getting started'}</span>
        </div>
        ${recentActivity}
      </div>

      <div class="panel">
        <div class="panel-heading">
          <h2>Route notes</h2>
          <span>WHY THIS ROUTE</span>
        </div>
        <div class="milestone-card">
          <span class="milestone-mark">✳</span>
          <div class="milestone-copy">
            <strong>Built for your starting point</strong>
            <p>We’ve arranged concepts, practice, and a portfolio project in prerequisite order. Resource links are curated suggestions; timings are estimates.</p>
          </div>
        </div>
        <div class="milestone-foot">
          <span>Starting level: ${escapeHtml(goal.level)}</span>
          <span>${escapeHtml(goal.type)}</span>
        </div>
        ${latestRevision ? `
          <div class="milestone-foot">
            <span>Last route adjustment</span>
            <span>${formatDate(latestRevision.at)}</span>
          </div>` : ''}
      </div>
    </div>`;
}

function renderDashboardEmptyState() {
  dom.homeView.innerHTML = `
    <div class="welcome-row">
      <div>
        <div class="eyebrow">YOUR LEARNING SPACE</div>
        <h1>Make your next move.</h1>
        <p>Pick a destination. We’ll help you find a clear route forward.</p>
      </div>
    </div>
    <div class="journey-card">
      <div class="empty-state">
        <div class="empty-icon">⌁</div>
        <h2>Start with a destination</h2>
        <p>Whether you’re building a new skill or preparing for an exam, a clear goal is the first step toward a useful learning route.</p>
        <button class="button button-primary" data-action="create-goal">
          Create your learning route <span>→</span>
        </button>
      </div>
    </div>`;
}

function renderRecentActivity() {
  if (state.activity.length === 0) {
    return `
      <div class="activity-row">
        <span class="activity-icon">↗</span>
        <span class="activity-copy">
          <strong>Your route is ready</strong>
          <small>Choose a step to get started.</small>
        </span>
      </div>`;
  }

  return state.activity.slice(-3).reverse().map((activity) => `
    <div class="activity-row">
      <span class="activity-icon">${escapeHtml(activity.icon || '✓')}</span>
      <span class="activity-copy">
        <strong>${escapeHtml(activity.title)}</strong>
        <small>${escapeHtml(activity.detail)}</small>
      </span>
      <span class="activity-time">${formatDate(activity.at)}</span>
    </div>`).join('');
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function defaultGoalSummary() {
  return 'A clear, practical route designed around what you know and the time you have.';
}

// -----------------------------------------------------------------------------
// Learning route map and selected-node details
// -----------------------------------------------------------------------------

function routeNodePositions() {
  const horizontalStart = 12;
  const horizontalSpace = 76;
  const stepCount = state.nodes.length;

  return state.nodes.map((node, index) => ({
    x: horizontalStart + (index + 1) * (horizontalSpace / (stepCount + 1)),
    y: index % 2 === 0 ? 32 : 68,
  }));
}

function routeLineMarkup(positions) {
  const nodePoints = positions.map(({ x, y }) => `${x},${y}`).join(' ');
  return `
    <svg class="map-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline class="path-bg" points="8,50 ${nodePoints} 92,50" />
      <polyline class="path-fg" points="8,50 ${nodePoints} 92,50" />
    </svg>`;
}

function renderRouteNodes(positions, selectedId) {
  return state.nodes.map((node, index) => {
    const position = positions[index];
    const marker = node.status === 'completed'
      ? '✓'
      : node.status === 'current'
        ? '•'
        : String(index + 1).padStart(2, '0');
    const selectedClass = node.id === selectedId ? 'selected' : '';

    return `
      <button class="map-node ${node.status} ${selectedClass}"
        style="left:${position.x}%;top:${position.y}%"
        data-action="select-node"
        data-id="${escapeHtml(node.id)}"
        aria-label="${escapeHtml(node.title)}, ${statusLabel(node.status)}">
        <span class="map-dot">${marker}</span>
        <strong>${escapeHtml(node.title)}</strong>
        <small>${node.hours}h · ${escapeHtml(statusLabel(node.status))}</small>
      </button>`;
  }).join('');
}

function renderLearningRoute() {
  if (!state.goal) {
    renderRouteEmptyState();
    return;
  }

  const selectedNode = state.nodes.find((node) => node.id === state.selectedId)
    || nextNode()
    || state.nodes[0];
  const positions = routeNodePositions();
  const latestRevision = state.revisions.at(-1);
  const routeHours = state.nodes.reduce((total, node) => total + node.hours, 0);

  dom.routeView.innerHTML = `
    <div class="route-page-head">
      <div>
        <div class="eyebrow">YOUR LEARNING ROUTE</div>
        <h1>${escapeHtml(state.goal.title)}</h1>
        <p>${state.nodes.length} connected steps · about ${routeHours} hours of focused study and practice</p>
        <p class="route-experience-note">Study hours are estimates. Senior-level readiness comes from sustained production work, ownership, and feedback over time.</p>
      </div>
      <div class="route-controls">
        <button class="button button-outline" data-action="recalculate">↻ Adjust route</button>
        <button class="button button-primary" data-action="continue">Continue learning →</button>
      </div>
    </div>

    ${latestRevision ? renderRevisionBanner(latestRevision) : ''}

    <div class="map-layout">
      <div class="map-card">
        <div class="map-toolbar">
          <div class="map-legend">
            <span class="legend-item"><i class="legend-dot active"></i>Up next</span>
            <span class="legend-item"><i class="legend-dot"></i>Done</span>
            <span class="legend-item"><i class="legend-dot locked"></i>Later</span>
            <span class="legend-item map-scroll-hint">Drag or scroll to explore →</span>
          </div>
          <div class="map-zoom">
            <button class="zoom-btn" data-action="zoom-out" aria-label="Zoom out">−</button>
            <button class="zoom-btn" data-action="zoom-in" aria-label="Zoom in">+</button>
          </div>
        </div>

        <div class="map-canvas" id="map-canvas"
          style="min-width:${Math.max(820, state.nodes.length * 160)}px"
          aria-label="Learning route map">
          ${renderStartMarker()}
          ${renderDestinationMarker()}
          ${routeLineMarkup(positions)}
          ${renderRouteNodes(positions, selectedNode?.id)}
        </div>
      </div>

      ${selectedNode
        ? renderNodeDetails(selectedNode)
        : '<aside class="node-panel"><p>Select a route step to see its details.</p></aside>'}
    </div>`;

  document.querySelector('#map-canvas').dataset.scale = '1';
}

function renderRouteEmptyState() {
  dom.routeView.innerHTML = `
    <div class="welcome-row">
      <div>
        <div class="eyebrow">YOUR ROUTE</div>
        <h1>Build a route that fits you.</h1>
      </div>
    </div>
    <div class="journey-card">
      <div class="empty-state">
        <div class="empty-icon">⌁</div>
        <h2>No destination yet</h2>
        <p>Create a goal to generate your first connected learning route.</p>
        <button class="button button-primary" data-action="create-goal">
          Create a destination <span>→</span>
        </button>
      </div>
    </div>`;
}

function renderStartMarker() {
  return `
    <div class="map-endpoint map-start" aria-label="Starting point: where you are now">
      <span class="endpoint-kicker">START</span>
      <span class="endpoint-symbol start-symbol" aria-hidden="true">⌂</span>
      <strong>Your starting point</strong>
      <small>Begin here</small>
    </div>`;
}

function renderDestinationMarker() {
  return `
    <div class="map-endpoint map-destination" aria-label="Destination: your learning goal">
      <span class="endpoint-kicker">DESTINATION</span>
      <span class="endpoint-symbol destination-symbol" aria-hidden="true">⚑</span>
      <strong>You’re aiming for</strong>
      <small>${escapeHtml(state.goal.title)}</small>
    </div>`;
}

function renderRevisionBanner(revision) {
  return `
    <div class="revision-banner">
      <strong>Route updated · ${formatDate(revision.at)}</strong>
      ${escapeHtml(revision.summary)}
      <button class="text-link" data-action="dismiss-revision">Dismiss</button>
    </div>`;
}

function renderNodeDetails(node) {
  const prerequisiteNames = node.prerequisites
    .map((id) => state.nodes.find((candidate) => candidate.id === id)?.title)
    .filter(Boolean);
  const isComplete = node.status === 'completed';
  const canStart = node.status === 'available' || node.status === 'current';

  return `
    <aside class="node-panel">
      <div class="node-kind">
        <span>${escapeHtml(node.type)}</span>
        <span class="node-kind-tag">${escapeHtml(statusLabel(node.status))}</span>
      </div>
      <h2>${escapeHtml(node.title)}</h2>
      <p>${escapeHtml(node.description)}</p>

      ${renderDetailBlock('Learning objective', node.objective)}
      ${renderDetailBlock('Why it matters', node.why)}
      ${prerequisiteNames.length
        ? renderDetailBlock('Prerequisites', prerequisiteNames.join(' · '))
        : ''}
      ${renderDetailBlock(
        'Estimated effort',
        `About ${node.hours} ${node.hours === 1 ? 'hour' : 'hours'} · estimate`,
      )}
      ${renderResource(node.resource)}
      ${renderDetailBlock(
        'Practice & completion',
        `${node.practice}${isComplete
          ? ' Your completion is recorded.'
          : ' Complete the practice, then record this step as done.'}`,
      )}

      <div class="node-actions">
        ${renderNodeProgressButton(node, isComplete, canStart)}
        ${!isComplete ? `
          <button class="button button-outline" data-action="report-resource" data-id="${escapeHtml(node.id)}">
            Resource isn’t available
          </button>` : ''}
      </div>
      ${!canStart && !isComplete
        ? '<p class="muted-note">Prerequisite steps keep your route in a useful order.</p>'
        : ''}
    </aside>`;
}

function renderDetailBlock(title, content) {
  return `
    <div class="detail-block">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(content)}</p>
    </div>`;
}

function renderResource(resource) {
  const verificationNote = resource.url
    ? ' · Suggested resource, not independently verified.'
    : '';
  const resourceLink = resource.url
    ? `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer" data-action="resource">
         Open resource ↗
       </a>`
    : '';

  return `
    <div class="detail-block">
      <h3>Suggested resource</h3>
      <div class="resource-card">
        <strong>${escapeHtml(resource.title)}</strong>
        <small>${escapeHtml(resource.publisher)} · ${escapeHtml(resource.type)} · ${escapeHtml(resource.language)}</small>
        <small>Duration: ${escapeHtml(resource.duration)}${verificationNote}</small>
        ${resourceLink}
      </div>
    </div>`;
}

function renderNodeProgressButton(node, isComplete, canStart) {
  if (isComplete) {
    return `
      <button class="button button-quiet" data-action="undo-node" data-id="${escapeHtml(node.id)}">
        ↶ Reopen this step
      </button>`;
  }

  return `
    <button class="button ${canStart ? 'button-primary' : 'button-outline'}"
      data-action="complete-node" data-id="${escapeHtml(node.id)}" ${canStart ? '' : 'disabled'}>
      ${canStart ? 'Mark practice complete' : 'Complete prerequisite steps first'}
    </button>`;
}

// -----------------------------------------------------------------------------
// Goal creation and modal helpers
// -----------------------------------------------------------------------------

function openModal(contents) {
  dom.dialogRoot.innerHTML = `
    <div class="modal-backdrop" data-action="backdrop">
      <div class="modal" role="dialog" aria-modal="true">${contents}</div>
    </div>`;
}

function closeModal() {
  dom.dialogRoot.innerHTML = '';
}

function showGoalForm() {
  openModal(`
    <div class="modal-head">
      <div>
        <h2>Set your destination</h2>
        <p>A few details help us make the route useful and achievable.</p>
      </div>
      <button class="close-button" data-action="close-modal" aria-label="Close">×</button>
    </div>

    <form id="goal-form">
      <div class="form-field">
        <label for="goal-title">What would you like to learn or achieve? *</label>
        <input id="goal-title" name="title" maxlength="100" required
          placeholder="e.g. Become a senior software engineer">
      </div>
      <div class="form-field">
        <label for="goal-desc">What would success look like? <span>(optional)</span></label>
        <textarea id="goal-desc" name="description" maxlength="240"
          placeholder="e.g. Build from programming fundamentals toward production ownership and technical leadership"></textarea>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label for="goal-type">Goal type</label>
          <select id="goal-type" name="type">
            <option>Skill acquisition</option>
            <option>Career preparation</option>
            <option>Exam preparation</option>
            <option>Personal project</option>
          </select>
        </div>
        <div class="form-field">
          <label for="goal-level">Starting point</label>
          <select id="goal-level" name="level">
            <option>Beginner</option>
            <option>Some experience</option>
            <option>Intermediate</option>
          </select>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label for="goal-weekly">Study time per week</label>
          <select id="goal-weekly" name="weekly">
            <option value="2">2</option>
            <option value="5" selected>5</option>
            <option value="8">8</option>
            <option value="10">10</option>
          </select>
        </div>
        <div class="form-field">
          <label for="goal-budget">Resource preference</label>
          <select id="goal-budget" name="budget">
            <option value="free">Free resources</option>
            <option value="flexible">Free or paid</option>
          </select>
        </div>
      </div>
      <label class="checkbox-line">
        <input type="checkbox" name="mobile" checked>
        Prefer mobile-friendly activities
      </label>
      <div class="form-error" id="form-error"></div>
      <div class="modal-footer">
        <button type="button" class="button button-outline" data-action="close-modal">Cancel</button>
        <button class="button button-primary" type="submit">Build my route <span>→</span></button>
      </div>
    </form>`);

  document.querySelector('#goal-title').focus();
}

function saveGoal(formValues) {
  const title = formValues.title.trim();
  if (title.length < 4) {
    document.querySelector('#form-error').textContent = 'Please enter a little more detail about your destination.';
    return;
  }

  const previousGoal = state.goal;
  state.goal = {
    title,
    description: formValues.description.trim(),
    type: formValues.type,
    level: formValues.level,
    weekly: String(formValues.weekly),
    budget: formValues.budget,
    mobile: formValues.mobile,
    createdAt: previousGoal?.createdAt || new Date().toISOString(),
  };

  if (!previousGoal) {
    state.nodes = structuredClone(starterRoute);
    state.nodes.forEach((node) => { node.status = 'locked'; });
    state.nodes[0].status = 'current';
  } else if (title !== previousGoal.title) {
    state.revisions.push({
      at: new Date().toISOString(),
      summary: `Destination changed to “${title}”. Review the route steps to confirm they still fit.`,
    });
  }

  refreshNodeAvailability();

  state.selectedId = nextNode()?.id || state.nodes[0]?.id || null;
  state.view = 'route';
  recordActivity('Destination set', `Route ready for ${title}`, '⌁');
  persistAndRender();
  closeModal();
  showToast('Your learning route is ready.');
}

function readGoalForm(form) {
  const formData = new FormData(form);
  return {
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    type: formData.get('type'),
    level: formData.get('level'),
    weekly: formData.get('weekly'),
    budget: formData.get('budget'),
    mobile: formData.get('mobile') === 'on',
  };
}

// -----------------------------------------------------------------------------
// Progress and route adaptation
// -----------------------------------------------------------------------------

function openNode(node) {
  state.selectedId = node.id;

  recordActivity(`Started ${node.title}`, 'Opened the step details', '↗');
  persistAndRender();
  showToast('Step opened. Your progress is saved.');
}

function completeNode(nodeId) {
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !['current', 'available'].includes(node.status)) return;

  const incompletePrerequisites = node.prerequisites.filter((prerequisiteId) => {
    const prerequisite = state.nodes.find((candidate) => candidate.id === prerequisiteId);
    return prerequisite?.status !== 'completed';
  });

  if (incompletePrerequisites.length > 0) {
    showToast('Complete the prerequisite first.');
    return;
  }

  node.status = 'completed';
  refreshNodeAvailability();
  const recommendedNode = nextNode();
  const newlyAvailableNode = state.nodes.find((candidate) => (
    candidate.status === 'current' || candidate.status === 'available'
  ));

  recordActivity(`Completed ${node.title}`, 'Practice completion recorded');
  state.selectedId = recommendedNode?.id || node.id;
  persistAndRender();

  showToast(newlyAvailableNode
    ? `${node.title} complete. ${newlyAvailableNode.title} is ready next.`
    : 'Destination reached — route complete!');
}

function reopenNode(nodeId) {
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.status !== 'completed') return;

  node.status = 'current';
  refreshNodeAvailability();

  persistAndRender();
  showToast('Step reopened. Downstream steps are locked until it’s complete.');
}

function showRecalculationOptions() {
  openModal(`
    <div class="modal-head">
      <div>
        <h2>Adjust your route</h2>
        <p>Tell us what changed. We’ll make a focused update and keep your completed steps.</p>
      </div>
      <button class="close-button" data-action="close-modal" aria-label="Close">×</button>
    </div>
    <div class="form-field">
      <label>What would help right now?</label>
      ${recalculationOption('struggle', '✳', 'I need more practice', 'Add a review step before my current topic.')}
      ${recalculationOption('mastery', '✓', 'I already know this', 'Count the current step as prior experience.')}
      ${recalculationOption('time', '◷', 'My schedule changed', 'Update my weekly study time.')}
    </div>
    <div class="modal-footer">
      <button class="button button-outline" data-action="close-modal">Cancel</button>
    </div>`);
}

function recalculationOption(reason, icon, title, description) {
  return `
    <button class="activity-row recalculation-option" data-action="recalculate-for" data-reason="${reason}">
      <span class="activity-icon">${icon}</span>
      <span class="activity-copy">
        <strong>${title}</strong>
        <small>${description}</small>
      </span>
      →
    </button>`;
}

function recalculateRoute(reason) {
  if (reason === 'time') adjustWeeklyStudyTime();
  if (reason === 'resource') replaceUnavailableResource();
  if (reason === 'struggle') insertReviewStep();
  if (reason === 'mastery') recognizePriorKnowledge();

  state.view = 'route';
  persistAndRender();
  showToast('Route updated. Your completed work is preserved.');
}

function adjustWeeklyStudyTime() {
  const currentHours = Number(state.goal.weekly) || 5;
  state.goal.weekly = String(Math.max(1, currentHours - 2));
  state.revisions.push({
    at: new Date().toISOString(),
    summary: `Study time changed to ${state.goal.weekly} hours per week. The route is unchanged; shorter sessions can fit your new schedule.`,
  });
  recordActivity('Study schedule updated', `${state.goal.weekly} hours per week`, '◷');
}

function replaceUnavailableResource() {
  const node = state.nodes.find((candidate) => candidate.id === state.selectedId) || nextNode();
  if (!node) return;

  node.resource = {
    title: 'Use the associated practice activity',
    publisher: 'LearnMap',
    url: '',
    type: 'Built-in practice alternative',
    duration: 'Included in this step',
    language: 'English',
  };
  state.revisions.push({
    at: new Date().toISOString(),
    summary: `The resource for “${node.title}” was reported unavailable. Use the practice activity on this step while you choose a replacement.`,
  });
  recordActivity('Resource marked unavailable', node.title, '↻');
}

function insertReviewStep() {
  const topic = nextNode();
  if (!topic) return;

  const reviewNode = {
    id: `review-${Date.now()}`,
    title: `Review: ${topic.title}`,
    type: 'Practice',
    hours: 1,
    status: 'current',
    description: `A short guided review to strengthen the ideas behind ${topic.title}.`,
    objective: 'Revisit the core concepts and identify what needs more practice.',
    why: 'A review step follows your request for more support before continuing the route.',
    prerequisites: [...topic.prerequisites],
    resource: structuredClone(topic.resource),
    practice: 'Work through the resource slowly, then explain one key idea in your own words.',
  };

  topic.status = 'locked';
  const topicIndex = state.nodes.findIndex((node) => node.id === topic.id);
  state.nodes.splice(topicIndex, 0, reviewNode);

  // The review comes before the topic. Keep downstream dependencies attached
  // to the topic so they still require the topic itself to be completed.
  topic.prerequisites = [reviewNode.id];

  state.selectedId = reviewNode.id;
  state.revisions.push({
    at: new Date().toISOString(),
    summary: `Added a one-hour review before “${topic.title}” because you reported difficulty. Completed steps remain unchanged.`,
  });
  recordActivity('Practice added to your route', `Review before ${topic.title}`, '✳');
}

function recognizePriorKnowledge() {
  const knownNode = nextNode();
  if (!knownNode) return;

  knownNode.status = 'completed';
  const nextAvailableNode = state.nodes.find((candidate) => (
    candidate.status === 'locked'
      && candidate.prerequisites.every((prerequisiteId) => (
        state.nodes.find((item) => item.id === prerequisiteId)?.status === 'completed'
      ))
  ));

  if (nextAvailableNode) nextAvailableNode.status = 'current';
  refreshNodeAvailability();
  state.selectedId = nextAvailableNode?.id || knownNode.id;
  state.revisions.push({
    at: new Date().toISOString(),
    summary: `Marked “${knownNode.title}” as already known based on your self-reported prior experience. You can reopen it at any time.`,
  });
  recordActivity('Prior knowledge recognized', knownNode.title);
}

// -----------------------------------------------------------------------------
// Map interactions and event wiring
// -----------------------------------------------------------------------------

function zoomMap(factor) {
  const canvas = document.querySelector('#map-canvas');
  if (!canvas) return;

  const currentScale = Number(canvas.dataset.scale || 1);
  const nextScale = Math.max(0.8, Math.min(1.35, currentScale * factor));
  canvas.dataset.scale = String(nextScale);
  canvas.style.backgroundSize = `${18 * nextScale}px ${18 * nextScale}px`;
  canvas.querySelectorAll('.map-node').forEach((node) => {
    node.style.transform = `translate(-50%, -50%) scale(${nextScale})`;
  });
}

function handleClick(event) {
  const control = event.target.closest('[data-action]');
  if (!control) return;

  const { action, id } = control.dataset;

  switch (action) {
    case 'create-goal':
      showGoalForm();
      break;
    case 'open-route':
      setView('route');
      break;
    case 'continue':
      continueLearning();
      break;
    case 'select-node':
      selectRouteNode(id);
      break;
    case 'complete-node':
      completeNode(id);
      break;
    case 'undo-node':
      reopenNode(id);
      break;
    case 'recalculate':
      showRecalculationOptions();
      break;
    case 'recalculate-for':
      closeModal();
      recalculateRoute(control.dataset.reason);
      break;
    case 'report-resource':
      closeModal();
      recalculateRoute('resource');
      break;
    case 'dismiss-revision':
      state.revisions = [];
      persistAndRender();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'backdrop':
      if (event.target === control) closeModal();
      break;
    case 'zoom-in':
      zoomMap(1.12);
      break;
    case 'zoom-out':
      zoomMap(0.9);
      break;
    case 'resource':
      recordActivity('Opened a resource', control.textContent.trim(), '↗');
      saveState(state);
      break;
    default:
      break;
  }
}

function continueLearning() {
  const node = nextNode();
  if (!node) {
    showToast('You’ve completed this route!');
    return;
  }

  state.selectedId = node.id;
  setView('route');
}

function selectRouteNode(nodeId) {
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return;

  if (node.status === 'available' || node.status === 'current') {
    openNode(node);
    return;
  }

  state.selectedId = nodeId;
  persistAndRender();
}

function handleSubmit(event) {
  if (event.target.id !== 'goal-form') return;
  event.preventDefault();
  saveGoal(readGoalForm(event.target));
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeModal();
  if (event.key !== 'Tab') return;

  const modal = document.querySelector('.modal');
  if (!modal) return;

  const focusableElements = [...modal.querySelectorAll('button,input,select,textarea,a[href]')]
    .filter((element) => !element.disabled);
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements.at(-1);

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function showAboutDialog() {
  openModal(`
    <div class="modal-head">
      <div>
        <h2>Learning that has a direction</h2>
        <p>LearnMap turns a goal into connected steps you can act on and adjust as you learn.</p>
      </div>
      <button class="close-button" data-action="close-modal" aria-label="Close">×</button>
    </div>
    ${renderDetailBlock(
      'How progress works',
      'Opening a link does not count as mastery. Mark a step complete after you do its practice activity. Steps unlock when their prerequisites are complete.',
    )}
    ${renderDetailBlock(
      'About this demo',
      'The route is generated from a curated local template and saved in this browser. Resource links are suggestions and have not been independently verified here.',
    )}
    <div class="modal-footer">
      <button class="button button-primary" data-action="close-modal">Got it</button>
    </div>`);
}

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('keydown', handleKeydown);
document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
dom.helpButton.addEventListener('click', showAboutDialog);

renderApp();
