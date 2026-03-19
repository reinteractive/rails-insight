import { z } from 'zod'
import { noIndex, respond } from './helpers.js'

/**
 * Register the get_subgraph tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_subgraph',
    'Skill-scoped relationship subgraph with ranked files. Skills: authentication, database, frontend, api, jobs, email.',
    {
      skill: z
        .string()
        .describe(
          'Skill domain (e.g. "authentication", "database", "frontend", "api")',
        ),
    },
    async ({ skill }) => {
      if (!state.index) return noIndex()

      const skillDomains = {
        authentication: [
          'auth',
          'devise',
          'session',
          'current',
          'password',
          'registration',
          'confirmation',
        ],
        database: ['model', 'schema', 'migration', 'concern'],
        frontend: ['component', 'stimulus', 'view', 'turbo', 'hotwire'],
        api: ['api', 'serializer', 'blueprint', 'graphql'],
        jobs: ['job', 'worker', 'sidekiq', 'queue'],
        email: ['mailer', 'mail', 'mailbox'],
      }

      const domains = skillDomains[skill]
      if (!domains) {
        return respond({
          error: `Unknown skill '${skill}'`,
          available: Object.keys(skillDomains),
        })
      }

      const allRels = state.index.relationships || []
      const rankings = state.index.rankings || {}
      const relevantEntities = new Set()
      for (const rel of allRels) {
        const fromMatch = domains.some((d) =>
          rel.from.toLowerCase().includes(d),
        )
        const toMatch = domains.some((d) => rel.to.toLowerCase().includes(d))
        if (fromMatch || toMatch) {
          relevantEntities.add(rel.from)
          relevantEntities.add(rel.to)
        }
      }
      for (const key of Object.keys(rankings)) {
        if (domains.some((d) => key.toLowerCase().includes(d)))
          relevantEntities.add(key)
      }

      const subgraphRels = allRels.filter(
        (r) => relevantEntities.has(r.from) || relevantEntities.has(r.to),
      )
      const rankedFiles = [...relevantEntities]
        .map((e) => ({ entity: e, rank: rankings[e] || 0 }))
        .sort((a, b) => b.rank - a.rank)

      return respond({
        skill,
        entities: rankedFiles,
        relationships: subgraphRels,
        total_entities: rankedFiles.length,
        total_relationships: subgraphRels.length,
      })
    },
  )
}
