# LearnMap

LearnMap helps a learner turn a destination into an ordered, explainable route of concepts, practice, and projects. This repository started as an empty scaffold. The current implementation is a dependency-free browser prototype of the core learning journey.

## Run locally

Use Node.js 18 or newer. The server uses only Node's built-in modules, so no package installation is needed. From this directory, run:

```sh
npm start
```

Then open <http://127.0.0.1:4173>. To use a different port, set `PORT` before starting the server, for example `PORT=5000 npm start`. The app stores the current journey in this browser's `localStorage`; refreshing the page retains it. Clearing site data resets the demo.

## Demo walkthrough

1. Choose **Create your learning route**.
2. Enter **Become a senior software engineer**, leave **Beginner**, **5 hours**, and **Free resources** selected, and choose **Build my route**.
3. Explore the connected route. Select a node to read its objective, prerequisites, rationale, effort estimate, suggested resource, and practice activity. The map scrolls when its route is wider than the available view; zoom controls scale node labels.
4. For the first step, build the suggested small JavaScript program and choose **Mark practice complete**. The step changes to completed and its dependent step becomes the next step. Merely opening a resource does not complete the node.
5. Choose **Adjust route → I need more practice**. LearnMap inserts a review step before the current step, preserves completed work, and records a route revision.
6. Choose **Overview** and refresh the page to see the saved goal, activity, and route progress.

Other route adjustments include recognizing prior knowledge and changing weekly study time. **Resource isn’t available** replaces the selected node's resource with a fallback suggestion and records the reason.

## Architecture and current behavior

- `index.html` defines the app shell and loads the page assets as an ES module.
- `server.js` serves the local app with Node's built-in HTTP and file-system modules; `package.json` provides the `npm start` command. The server is a static file server, not an application backend.
- `styles.css` contains the responsive layout, route path, endpoint markers, node panel, and modal styles.
- `app.js` is organized into named sections for helpers, dashboard rendering, map rendering, goal creation, progress/adaptation, and event wiring.
- `route-data.js` contains a curated ten-step beginner-to-senior software engineering route, with each step's objective, prerequisites, resource suggestion, practice, and focused-study estimate.
- `storage.js` is the small browser-persistence adapter. It loads/saves the app state and migrates the original demo's `prereqs` field to the clearer `prerequisites` name.
- The prerequisite list is explicit on every node. Completing a step only unlocks a dependent step after its prerequisites are complete. Completed progress is retained if a practice adjustment is added.
- The map alternates nodes across two route lanes, with labeled **Start** and **Destination** markers at the ends. On a narrow viewport, scroll the map horizontally to inspect the full route.
- The software engineering route moves from programming and developer workflow through applications, APIs, testing, production reliability, system design, technical ownership, and a senior-level capstone. Its study-hour total is not a promise or timeline for reaching seniority; that requires sustained production experience, ownership, and feedback over time.
- Goals, node states, activity events, and route revisions are saved together in versioned browser storage. The route is local to one browser profile and has no account or server sync.
- The route generator is deterministic and uses a curated template. There is no AI provider, backend, database, authentication, resource search, or live resource verification in this prototype. Resource links and durations are suggestions/estimates and are labeled accordingly in the UI.
- Settings are limited to the preferences collected during goal creation. Changing weekly time currently updates the saved preference and creates an explanatory revision; it does not recalculate individual session durations.

## Repository assessment and implementation plan

### Starting state

The initial repository contained only a placeholder README and `.gitignore`; there was no package manifest, source code, server, data model, test runner, authentication, API, or deployment configuration. The existing technology stack therefore offered no framework or persistence convention to extend. The implementation keeps the first slice dependency-free and runnable with a static file server.

### Milestones delivered in this slice

1. **Runnable shell and empty state:** app navigation, dashboard, goal creation, optional preferences, and first-run state.
2. **Structured curated route:** stable node IDs, types, objectives, prerequisite IDs, practice criteria, effort estimates, and resource provenance fields.
3. **Interactive route:** selectable nodes, current/completed/locked states, detail panel, prerequisite unlocking, responsive horizontal route navigation, and zoom controls.
4. **Progress and adaptation:** local persistence, activity history, route revision banners, prior-knowledge adjustment, extra-practice insertion, time preference update, and unavailable-resource fallback.
5. **Setup and handoff:** this README records how to run and demonstrate the prototype, its architecture, and material limitations.

### Remaining work for a production product

Add a backend and authenticated learner ownership; durable database schema/migrations and transaction-safe route revisions; schema and cycle validation at a trusted server boundary; assessment questions with scored evidence; target-date and session-aware scheduling; vetted goal-specific alternatives for unavailable resources; resource verification and availability checks; proper graph pan/zoom and keyboard interaction; preferences/settings management; automated unit, integration, and end-to-end tests; and deployment, logging, privacy, and rate-limit configuration. These need a deliberate server/framework and storage decision because none exists in this repository.

## Verification performed

- `node --input-type=module --check < app.js`, and the same check for `route-data.js` and `storage.js` — passed.
- `git diff --check` — passed.
- Browser walkthrough — created the beginner-to-senior software engineering route, inspected its start and destination markers, completed the first activity, confirmed its dependent step unlocked, and verified progress after refresh.
- Adaptation checks — inserted extra practice, recognized prior knowledge, changed weekly study time, and reported a resource unavailable; each action updated the route explanation and persisted after refresh.
- Responsive visual inspection — reviewed the route at the available browser size and adjusted the node arrangement and scrollable map width after identifying label crowding.
- Saved-state migration — reloaded the route created by the previous prototype and verified that its prerequisites, progress, and route adjustment still render with the updated field name.

No automated test suite or production build exists in the repository yet. This prototype should not be represented as a production-ready learning service.
