/** Browser persistence adapter for the demo's single-learner state. */
const STORAGE_KEY = 'learnmap.state.v1';

export function createInitialState() {
  return {
    goal: null,
    nodes: [],
    selectedId: null,
    activity: [],
    revisions: [],
    view: 'home',
  };
}

/** Load saved state and fall back safely if storage is empty or malformed. */
export function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (savedState && typeof savedState === 'object') {
      return migrateSavedState(savedState);
    }
  } catch {
    // A malformed local value should not prevent the app from opening.
  }

  return createInitialState();
}

/** Upgrade the first demo's `prereqs` field to the clearer domain name. */
function migrateSavedState(savedState) {
  const state = { ...createInitialState(), ...savedState };

  state.nodes = Array.isArray(state.nodes)
    ? state.nodes.map((node) => {
      const { prereqs, ...currentNodeFields } = node;
      return {
        ...currentNodeFields,
        prerequisites: currentNodeFields.prerequisites || prereqs || [],
      };
    })
    : [];

  return state;
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
