import { z } from 'zod'
import { noIndex, respond } from './helpers.js'

/**
 * Collect seed entity names for a given skill from the index extractions.
 * @param {string} skill
 * @param {object} index
 * @returns {Set<string>}
 */
export function getSkillSeeds(skill, index) {
  const extractions = index.extractions || {}
  const seeds = new Set()

  switch (skill) {
    case 'authentication': {
      // Models with Devise, has_secure_password, or Session/Current naming
      for (const [name, model] of Object.entries(extractions.models || {})) {
        if (
          model.has_secure_password ||
          (model.devise_modules && model.devise_modules.length > 0) ||
          /^(User|Session|Current|Account|Identity)$/.test(name)
        ) {
          seeds.add(name)
        }
      }
      // Controllers related to auth
      for (const [name] of Object.entries(extractions.controllers || {})) {
        if (
          /session|registration|password|confirmation|login|signup|auth/i.test(
            name,
          )
        ) {
          seeds.add(name)
        }
      }
      break
    }
    case 'database': {
      // All non-concern, non-abstract AR models
      for (const [name, model] of Object.entries(extractions.models || {})) {
        if (model.type !== 'concern' && !model.abstract) seeds.add(name)
      }
      break
    }
    case 'frontend': {
      for (const sc of extractions.stimulus_controllers || []) {
        seeds.add(sc.identifier || sc.class)
      }
      for (const [name] of Object.entries(extractions.components || {})) {
        seeds.add(name)
      }
      for (const [name] of Object.entries(extractions.controllers || {})) {
        if (/pages|home|static|landing/i.test(name)) seeds.add(name)
      }
      break
    }
    case 'api': {
      for (const [name, ctrl] of Object.entries(
        extractions.controllers || {},
      )) {
        if (/api|v\d+|json/i.test(name) || ctrl.api_only) seeds.add(name)
      }
      break
    }
    case 'jobs': {
      for (const [name] of Object.entries(extractions.workers || {})) {
        seeds.add(name)
      }
      for (const job of extractions.jobs?.jobs || []) {
        seeds.add(job.class || job.name)
      }
      break
    }
    case 'email': {
      // Mailer classes (from extractions.mailers or extractions.email.mailers)
      for (const [name] of Object.entries(extractions.mailers || {})) {
        seeds.add(name)
      }
      for (const mailer of extractions.email?.mailers || []) {
        if (mailer.class) seeds.add(mailer.class)
      }
      // Mailbox classes
      if (extractions.email?.mailbox?.mailboxes) {
        for (const mb of extractions.email.mailbox.mailboxes) {
          seeds.add(mb)
        }
      }
      // Models and controllers with email/mail in the name
      for (const [name] of Object.entries(extractions.models || {})) {
        if (/email|mail/i.test(name)) seeds.add(name)
      }
      for (const [name] of Object.entries(extractions.controllers || {})) {
        if (/email|mail/i.test(name)) seeds.add(name)
      }
      break
    }
    default:
      break
  }

  return seeds
}

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

      const KNOWN_SKILLS = [
        'authentication',
        'database',
        'frontend',
        'api',
        'jobs',
        'email',
      ]

      if (!KNOWN_SKILLS.includes(skill)) {
        return respond({
          error: `Unknown skill '${skill}'`,
          available: KNOWN_SKILLS,
        })
      }

      const seeds = getSkillSeeds(skill, state.index)
      const allRels = state.index.relationships || []
      const rankings = state.index.rankings || {}

      // BFS one hop from seeds using relationships
      const relevantEntities = new Set(seeds)

      // For authentication subgraph, exclude irrelevant entities reached only via inherits edges
      const authIrrelevantEdges =
        skill === 'authentication' ? new Set(['inherits']) : new Set()

      for (const rel of allRels) {
        if (authIrrelevantEdges.has(rel.type)) continue
        if (seeds.has(rel.from)) relevantEntities.add(rel.to)
        if (seeds.has(rel.to)) relevantEntities.add(rel.from)
      }

      const subgraphRels = allRels.filter(
        (r) => relevantEntities.has(r.from) || relevantEntities.has(r.to),
      )
      const rankedFiles = [...relevantEntities]
        .map((e) => ({ entity: e, rank: rankings[e] || 0 }))
        .sort((a, b) => b.rank - a.rank)

      // Authentication: post-filter to remove entities that aren't auth-relevant.
      // BFS from auth seeds leaks into high-connectivity models (e.g., Activity
      // via belongs_to :author), polluting the subgraph.
      if (skill === 'authentication') {
        const authEntityPatterns = /auth|session|user|admin|devise|password|registration|confirmation|login|signup|member|ability|role|current|warden|omniauth/i

        const authFiltered = rankedFiles.filter(e =>
          seeds.has(e.entity) || authEntityPatterns.test(e.entity)
        )
        const authEntitySet = new Set(authFiltered.map(e => e.entity))
        const authRels = subgraphRels.filter(
          r => authEntitySet.has(r.from) && authEntitySet.has(r.to)
        )

        return respond({
          skill,
          entities: authFiltered,
          relationships: authRels,
          total_entities: authFiltered.length,
          total_relationships: authRels.length,
        })
      }

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
