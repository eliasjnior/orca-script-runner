// `orca plugin check` renders the panel once per scenario, with the real worker on a mock host.
import { defineCheck } from 'orca/testing'

export default defineCheck({
  'no workspace': {
    results: { 'workspace.readContext': null },
    events: [{ event: 'workspace.changed', payload: { context: null } }]
  },
  'unknown workspace': {
    results: {
      'workspace.readContext': { branch: 'main', displayName: 'api', terminals: [] },
      'workspace.list': { workspaces: [], truncated: false }
    },
    events: [
      {
        event: 'workspace.changed',
        payload: { context: { branch: 'main', displayName: 'api', terminals: [] } }
      }
    ]
  }
})
