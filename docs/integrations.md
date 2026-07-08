# Using ReFlow with your UI stack

ReFlow is design-system agnostic by construction:

- Custom nodes/edges are **plain React components** — anything renders.
- All library styles live under prefixed classes (`rf-*`) and **CSS
  variables** (`--rf-*`); no global resets, no element selectors.
- Interactive elements inside nodes (`button`, `input`, `a`, `select`,
  `[contenteditable]`, `.rf-nodrag`) never start a canvas drag, so
  dropdowns, popovers and forms behave normally.
- Portalled UI (Radix/Base UI popovers, dialogs, tooltips) works: portals
  render outside `.rf-container` and receive events untouched.

## Tailwind CSS

Nodes are just markup — use utilities directly:

```tsx
function CardNode({ data, selected }: NodeProps) {
  return (
    <div className={`rounded-xl border bg-card text-card-foreground shadow-sm p-4 w-56
                     ${selected ? 'ring-2 ring-primary' : ''}`}>
      <Handle kind="target" side="left" />
      <p className="text-sm font-medium">{data.label}</p>
      <Handle kind="source" side="right" />
    </div>
  );
}
```

Tailwind's preflight does not affect ReFlow (all styles are class-scoped).
`touch-action`/`user-select` are handled by the library on the canvas only.

## shadcn/ui

Map ReFlow's tokens to your shadcn theme once, and the canvas (selection
rings, handles, minimap, controls) follows your design system in both
modes:

```css
.rf-container {
  --rf-accent: hsl(var(--primary));
  --rf-accent-soft: hsl(var(--primary) / 0.15);
  --rf-bg: hsl(var(--background));
  --rf-node-bg: hsl(var(--card));
  --rf-node-border: hsl(var(--border));
  --rf-node-text: hsl(var(--card-foreground));
  --rf-node-text-dim: hsl(var(--muted-foreground));
  --rf-edge: hsl(var(--muted-foreground) / 0.5);
  --rf-panel-bg: hsl(var(--popover) / 0.85);
  --rf-panel-border: hsl(var(--border));
}
```

Use shadcn components inside nodes as-is — `DropdownMenu`, `Select`,
`Dialog`, `Tooltip` all portal correctly:

```tsx
function TaskNode({ id, data }: NodeProps) {
  const flow = useReflow();
  return (
    <Card className="w-64">
      <Handle kind="target" side="left" />
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{data.label}</CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rf-nodrag h-6 w-6">⋯</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => flow.removeNodes([id])}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <Handle kind="source" side="right" />
    </Card>
  );
}
```

Match dark mode by driving `colorMode` from your theme provider:

```tsx
const { theme } = useTheme(); // next-themes
<ReFlow colorMode={theme === 'dark' ? 'dark' : 'light'} … />
```

ReFlow also honors a page-level `data-theme="dark"` attribute on `:root`
automatically.

## Base UI / Radix / MUI / Mantine

Same story — components in nodes, portals for overlays. Two tips:

1. Put `rf-nodrag` on drag-sensitive controls that aren't native inputs
   (e.g. sliders built from divs) so the canvas never steals their pointer.
2. Panels (`<Panel>`, `<Controls>`, `<MiniMap>`) accept `className` — style
   them like any surface in your system.

## Forms & state libraries

- **react-hook-form / TanStack Form** inside nodes: works; inputs are
  drag-exempt.
- **zustand / redux / jotai** as the app store: use controlled mode
  (`nodes`/`edges` props + `onNodesChange`) or keep graph state in ReFlow
  and mirror only what you need from `onNodesChange` / `useNodes()`.

## Next.js / SSR

`<ReFlow>` renders without throwing on the server — all browser APIs are
guarded, and measurement and culling activate on mount (guarded in code, not
yet covered by an automated SSR render test). In the App Router mark the flow
component `'use client'`. `@reflow/core` runs natively in server code —
validation, layouts and graph algorithms work in route handlers and server
actions.
