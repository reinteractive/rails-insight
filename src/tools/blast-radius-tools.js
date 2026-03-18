/**
 * Blast Radius MCP Tools
 * Registers get_blast_radius and get_review_context tools.
 */

import { z } from 'zod'
import { computeBlastRadius, buildReviewContext } from '../core/blast-radius.js'
import { detectChangedFiles } from '../git/diff-parser.js'

/**
 * Register blast radius analysis tools on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state object with { index, provider, verbose }
 */
export function registerBlastRadiusTools(server, state) {
  const noIndex = () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: 'Index not built. Call index_project first.' }),
      },
    ],
  })
  const respond = (data) => ({
    content: [{ type: 'text', text: JSON.stringify(data) }],
  })

  server.tool(
    'get_blast_radius',
    'Analyse the impact of code changes. Accepts explicit file paths or auto-detects from git diff. Returns impacted entities classified by risk level (CRITICAL/HIGH/MEDIUM/LOW) with affected tests. Call this before making changes to understand what else might break, or after changes to identify what needs testing.',
    {
      files: z.array(z.string()).optional().describe('Explicit list of changed file paths'),
      base_ref: z.string().optional().describe('Git ref to diff against (default: HEAD)'),
      staged: z.boolean().optional().describe('Only staged changes (default: false)'),
      max_depth: z.number().optional().describe('BFS traversal depth limit (default: 3)'),
    },
    async (args) => {
      if (!state.index) return noIndex()

      const changedFiles = await resolveChangedFiles(args, state)
      if (changedFiles.error && changedFiles.files.length === 0 && !args.files?.length) {
        return respond({ error: changedFiles.error })
      }

      const result = computeBlastRadius(state.index, changedFiles.files, {
        maxDepth: args.max_depth || 3,
      })
      return respond(result)
    },
  )

  server.tool(
    'get_review_context',
    'Get a token-budgeted structural summary of entities impacted by code changes. Returns compact Rails-aware descriptions of each impacted model, controller, and component — enough context for an AI agent to review the change safely. Call get_blast_radius first, or provide files directly.',
    {
      files: z.array(z.string()).optional().describe('Explicit list of changed file paths'),
      base_ref: z.string().optional().describe('Git ref to diff against (default: HEAD)'),
      token_budget: z.number().optional().describe('Maximum tokens for the response (default: 8000)'),
      risk_filter: z.string().optional().describe('Minimum risk level to include (default: LOW)'),
    },
    async (args) => {
      if (!state.index) return noIndex()

      const changedFiles = await resolveChangedFiles(args, state)
      if (changedFiles.error && changedFiles.files.length === 0 && !args.files?.length) {
        return respond({ error: changedFiles.error })
      }

      const tokenBudget = args.token_budget || 8000
      const blastResult = computeBlastRadius(state.index, changedFiles.files)

      if (args.risk_filter) {
        const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
        const minIdx = levels.indexOf(args.risk_filter)
        if (minIdx >= 0) {
          blastResult.impacted = blastResult.impacted.filter(
            (e) => levels.indexOf(e.risk) <= minIdx,
          )
        }
      }

      const reviewContext = buildReviewContext(state.index, blastResult, tokenBudget)
      return respond(reviewContext)
    },
  )
}

async function resolveChangedFiles(args, state) {
  if (args.files && args.files.length > 0) {
    return {
      files: args.files.map((path) => ({ path, status: 'modified' })),
      error: null,
    }
  }

  if (state.provider && typeof state.provider.execCommand === 'function') {
    return detectChangedFiles(state.provider, args.base_ref || 'HEAD', {
      staged: args.staged || false,
    })
  }

  return { files: [], error: 'No files provided and git detection unavailable' }
}
