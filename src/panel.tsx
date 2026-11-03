// Lists the focused workspace's orca.yaml scripts with a button that runs each one.
import {
  atom,
  Box,
  Button,
  Callout,
  EmptyState,
  Heading,
  IconButton,
  on,
  type PanelContext,
  plugin,
  RelativeTime,
  Row,
  read,
  Skeleton,
  Spinner,
  Stack,
  set,
  Text
} from 'orca'
import type { Script, ScriptsView } from './protocol'

/**
 * The worker's last answer for the focused workspace, kept per workspace: Orca ends the panel when
 * another sidebar tab opens, and restores this before the first render, so the list shows at once
 * while the worker (which may have to start) refreshes it. Null until a first answer.
 */
const scriptsView = atom<ScriptsView | null>('scripts-view', null, {
  persist: 'workspace',
  version: 1
})
/** The script waiting on `scripts.run`, so its button can show it. */
const starting = atom<string | null>(null)
/** The last script started from this panel, for the confirmation line. */
const lastRun = atom<{ name: string; title: string; at: number; visible: boolean } | null>(null)
/** Why the last list or run request failed. */
const failure = atom<string | null>(null)
/** The script whose Run waits for a confirmation, if any. */
const confirming = atom<string | null>(null)

/**
 * Orca's own lifecycle scripts, which can reinstall or remove things: Run asks first, with why.
 * Every other script runs on the first press.
 */
export const CONFIRMED_SCRIPTS: Readonly<Record<string, string>> = {
  setup:
    'Orca runs this when it creates a worktree. Running it again can reinstall dependencies or overwrite files.',
  archive:
    'Orca runs this before it removes a worktree. It can delete files, data or services this worktree uses.'
}
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

async function refresh(): Promise<void> {
  try {
    set(scriptsView, await plugin.request('scripts.list'))
    set(failure, null)
  } catch (error) {
    set(failure, message(error))
  }
}

async function runScript(workspaceId: string, name: string): Promise<void> {
  set(confirming, null)
  set(starting, name)
  set(failure, null)
  try {
    // The tab opens through Orca's CLI, which can take a few seconds.
    const { title, visible } = await plugin.request(
      'scripts.run',
      { workspaceId, name },
      { timeoutMs: 60_000 }
    )
    set(lastRun, { name, title, at: Date.now(), visible })
  } catch (error) {
    set(failure, message(error))
  } finally {
    set(starting, null)
  }
}

export function setup(ctx: PanelContext): void {
  // Fires once with the current workspace as it subscribes, then on every focus change: each
  // answer re-reads orca.yaml, so edits show up when you come back to the workspace.
  ctx.subscriptions.push(
    on('workspace.changed', () => {
      set(lastRun, null)
      set(confirming, null)
      void refresh()
    })
  )
}

/** Run asks to confirm a lifecycle script once, and runs anything else right away. */
function pressRun(workspaceId: string, name: string): void {
  if (Object.hasOwn(CONFIRMED_SCRIPTS, name)) {
    set(confirming, name)
    return
  }
  void runScript(workspaceId, name)
}

/**
 * One script: its name and Run. `busy` names the script that is starting, and `confirming` the
 * one waiting for a confirmation, if any.
 */
export function ScriptCard({
  script,
  workspaceId,
  busy,
  confirming: pending
}: {
  script: Script
  workspaceId: string
  busy: string | null
  confirming: string | null
}) {
  const asking = pending === script.name
  return (
    <Box border radius="md" padding="sm" direction="column" gap="sm">
      <Row justify="between" align="center" gap="xs">
        <Text weight="semibold" truncate>
          {script.name}
        </Text>
        {/* Orca's buttons have no loading state and nothing can sit on top of them, so the
            spinner goes beside the (unchanged, disabled) button while the terminal opens. */}
        <Row align="center" gap="xs">
          {busy === script.name ? (
            <Spinner label={`Starting "${script.name}"`} labelHidden />
          ) : null}
          <Button
            size="sm"
            icon="play"
            tooltip={`Run "${script.name}" in a new terminal`}
            disabled={busy !== null || asking}
            onPress={() => pressRun(workspaceId, script.name)}
          >
            Run
          </Button>
        </Row>
      </Row>
      {/* Orca's panels have no dialogs, so the confirmation opens inside the card. */}
      {asking ? (
        <Callout tone="warning" icon="warning" title={`Run "${script.name}"?`}>
          <Stack gap="sm">
            <Text>{CONFIRMED_SCRIPTS[script.name]}</Text>
            <Row gap="xs">
              <Button
                size="sm"
                tone="danger"
                icon="play"
                disabled={busy !== null}
                onPress={() => runScript(workspaceId, script.name)}
              >
                {`Run ${script.name}`}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => set(confirming, null)}>
                Cancel
              </Button>
            </Row>
          </Stack>
        </Callout>
      ) : null}
    </Box>
  )
}

function Body({ view }: { view: ScriptsView }) {
  const { workspace } = view
  if (!workspace) {
    return view.error ? (
      <Callout tone="warning" title="Workspace not found">
        <Text>{view.error}</Text>
      </Callout>
    ) : (
      <EmptyState
        icon="folder"
        title="No workspace focused"
        description="Open a worktree to see its scripts."
      />
    )
  }
  const ran = read(lastRun)
  return (
    <Stack gap="sm">
      <Text muted size="xs" truncate>
        {workspace.branch ? `${workspace.name} · ${workspace.branch}` : workspace.name}
      </Text>
      {view.error ? (
        <Callout tone="danger" title="Could not read orca.yaml">
          <Text>{view.error}</Text>
        </Callout>
      ) : view.scripts.length === 0 ? (
        <EmptyState
          icon="file-text"
          title={view.configPath ? 'No scripts in orca.yaml' : 'No orca.yaml'}
          description="Add entries under `scripts:` in orca.yaml at the repository root."
        />
      ) : (
        view.scripts.map((script) => (
          <ScriptCard
            key={script.name}
            script={script}
            workspaceId={workspace.id}
            busy={read(starting)}
            confirming={read(confirming)}
          />
        ))
      )}
      {ran?.visible ? (
        <Text tone="success" size="xs">
          {`Opened “${ran.title}” in a new terminal tab `}
          <RelativeTime at={ran.at} />
        </Text>
      ) : ran ? (
        <Callout tone="warning" title={`“${ran.title}” is running without a tab`}>
          <Text>
            Orca's command line tool was not found, so the script started in the background and its
            output cannot be shown.
          </Text>
        </Callout>
      ) : null}
      {view.fromPrimaryCheckout ? (
        <Text muted size="xs">
          From the primary checkout's orca.yaml; this worktree has none.
        </Text>
      ) : null}
    </Stack>
  )
}

export default function Panel() {
  const view = read(scriptsView)
  const error = read(failure)
  return (
    <Stack gap="md">
      <Row justify="between" align="center">
        <Heading>Scripts</Heading>
        <IconButton
          icon="refresh"
          label="Reload orca.yaml"
          size="sm"
          variant="ghost"
          onPress={refresh}
        />
      </Row>
      {error ? (
        <Callout tone="danger" title="Something went wrong">
          <Text>{error}</Text>
        </Callout>
      ) : null}
      {view ? <Body view={view} /> : <Skeleton lines={3} label="Loading scripts" />}
    </Stack>
  )
}
