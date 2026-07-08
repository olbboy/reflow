# AI Agent integration

ReFlow ships a first-class agent layer: a JSON operation format an LLM can
emit, a validated executor that applies it to a live canvas, and helpers
that describe the graph back to the model. Everything runs through the same
engine the UI uses — so agent edits are undoable, validated and animated
like human edits.

Try it live: the **AI copilot** tab in the demo streams operations onto the
canvas.

## The operation format

```ts
import { applyOperations, type FlowOperation } from '@reflow/react'; // or @reflow/core

const ops: FlowOperation[] = [
  { op: 'add_node', id: 'fetch', label: 'Fetch data', type: 'action' },
  { op: 'add_node', id: 'clean', label: 'Clean', data: { lang: 'sql' } },
  { op: 'connect', source: 'fetch', target: 'clean' },
  { op: 'layout', type: 'layered', direction: 'LR' },
];

const result = applyOperations(flow.store, ops);
// { applied: 4, errors: [], createdNodes: ['fetch','clean'], createdEdges: [...] }
```

Properties that make it agent-safe:

- **Never throws.** Malformed or impossible ops (duplicate ids, missing
  nodes, invalid connections, cycles when `preventCycles` is on) are
  collected in `result.errors` — feed them back to the model, the rest of
  the batch still applies.
- **One batch = one undo entry.** The user can revert an entire agent turn
  with `⌘Z`.
- **Auto-layout.** Nodes added without `position` get laid out
  automatically (`autoLayout: 'layered' | 'tree' | … | false`).
- **Validated connections.** `connect` runs the full pipeline: typed ports,
  max-connections, duplicates, cycle prevention, your custom validator.

Full op list: `add_node` · `update_node` · `remove_node` · `connect` ·
`update_edge` · `remove_edge` · `set_status` · `select` · `layout` ·
`fit_view` · `focus_node` · `clear`.

## Wiring up an LLM tool

`operationSchema` is a ready JSON Schema; `OPERATIONS_PROMPT` is a system
prompt fragment teaching the format:

```ts
import { operationSchema, OPERATIONS_PROMPT, describeGraph } from '@reflow/core';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-sonnet-5',
  max_tokens: 2048,
  system: `You are a workflow designer. ${OPERATIONS_PROMPT}`,
  tools: [
    {
      name: 'edit_canvas',
      description: 'Apply operations to the workflow canvas',
      input_schema: {
        type: 'object',
        required: ['operations'],
        properties: { operations: { type: 'array', items: operationSchema } },
      },
    },
  ],
  messages: [
    {
      role: 'user',
      content: `Current canvas: ${JSON.stringify(describeGraph(store))}\n\nAdd a retry step after every API call node.`,
    },
  ],
});

for (const block of response.content) {
  if (block.type === 'tool_use' && block.name === 'edit_canvas') {
    const { errors } = applyOperations(store, block.input.operations, { fitView: true });
    // report errors back in the tool_result for self-correction
  }
}
```

The same shape works with OpenAI function calling (`parameters` instead of
`input_schema`).

## Giving the model context

Two token-efficient views of the canvas:

```ts
describeGraph(store);
// { nodes: [{ id, type, label }...], edges: [{ source, target, label }...], selection }

// Positions and full node data are omitted by default to save tokens; opt in
// when the agent needs to reason about layout or node internals:
describeGraph(store, { includePositions: true, includeData: true });

toMermaid(store);
// flowchart LR
//   fetch["Fetch data"] ...
//   fetch --> clean
```

Mermaid is ideal for chat contexts — models reason about it natively and it
costs a fraction of raw JSON.

## Execution visualization (agent runs)

`set_status` drives live run rendering: it merges `data.status` /
`data.statusMessage` into the node and animates incoming edges while
`status === 'running'`:

```ts
applyOperations(store, [
  { op: 'set_status', id: 'embed', status: 'running', message: 'batch 4/12' },
]);
// … later
applyOperations(store, [{ op: 'set_status', id: 'embed', status: 'ok' }]);
```

Your node component just reads `data.status` — see `AIScene.tsx` in the
demo for a complete status-styled node.

## Streaming patterns

Operations are plain JSON — stream them over anything:

```ts
// SSE / WebSocket consumer
socket.onmessage = (msg) => {
  applyOperations(store, JSON.parse(msg.data), { transact: false });
};
```

Tip: use `transact: false` for high-frequency status streams (no history
noise), and one `transact` batch per agent "turn" for structural edits.

## Server-side / headless

`@reflow/core` has zero dependencies and no DOM requirement. Validate an
agent's proposed graph on the server before it ever reaches a client:

```ts
import { FlowStore, applyOperations, hasCycle, topologicalSort } from '@reflow/core';

const sim = new FlowStore({ preventCycles: true });
const { errors } = applyOperations(sim, proposedOps);
if (errors.length) return reject(errors);
const executionOrder = topologicalSort(sim); // schedule the real run
```

Same engine, same validation, both sides of the wire.

## Live agent, provider-agnostic (GLM / Gemini / Anthropic)

The operation format is not tied to any one model. `examples/ai-agent` is a
runnable, zero-SDK bridge (plain `fetch`) that asks whichever provider you
have a key for and applies the result:

```bash
# whichever key is set decides the provider
GLM_API_KEY=...       node examples/ai-agent/generate.mjs "add a retry step after fetch"
GEMINI_API_KEY=...    node examples/ai-agent/generate.mjs
ANTHROPIC_API_KEY=... node examples/ai-agent/generate.mjs
```

Under the hood (`examples/ai-agent/src/providers.mjs`):

- **GLM** (z.ai, OpenAI-compatible) — `POST /chat/completions` with
  `response_format: { type: 'json_object' }`, model `glm-4.6`.
- **Gemini** — `:generateContent` with
  `generationConfig.responseMimeType: 'application/json'`, model
  `gemini-2.5-flash`.
- **Anthropic** — `/v1/messages`, model `claude-sonnet-5`.

Each returns a JSON `{ "operations": [...] }`, which is parsed, validated by
`operationSchema`, and applied via `applyOperations` as one transactional
turn — so a single `undo()` reverts the whole agent edit. Override the model
or endpoint per provider with env vars (`GLM_MODEL`, `GEMINI_MODEL`,
`ANTHROPIC_MODEL`, `*_BASE_URL`), or force a provider with
`REFLOW_AI_PROVIDER`.

The parse → validate → apply → undo pipeline is covered by
`examples/ai-agent/test/agent-ops.test.ts` (canned responses for all three
providers, no network); the keyed round-trip is exercised by `generate.mjs`.
