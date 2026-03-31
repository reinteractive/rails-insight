/**
 * Views Extractor (#7)
 * Lightweight aggregated scan of app/views for structural indicators.
 */

import { VIEW_PATTERNS } from '../core/patterns.js'

/**
 * Detect primary template engine from file extensions.
 * @param {Array<{path: string}>} entries
 * @returns {string}
 */
function detectEngine(entries) {
  const counts = { erb: 0, haml: 0, slim: 0 }
  for (const e of entries) {
    if (e.path.endsWith('.erb')) counts.erb++
    else if (e.path.endsWith('.haml')) counts.haml++
    else if (e.path.endsWith('.slim')) counts.slim++
  }
  const found = Object.entries(counts).filter(([, c]) => c > 0)
  if (found.length === 0) return 'erb'
  if (found.length === 1) return found[0][0]
  return found.map(([engine, count]) => `${engine}(${count})`).join(', ')
}

/**
 * Extract aggregated view layer information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries - all scanned entries
 * @returns {object}
 */
export function extractViews(provider, entries) {
  const result = {
    layouts: [],
    template_engine: 'erb',
    turbo_frames_count: 0,
    turbo_stream_templates: 0,
    component_renders: 0,
    partial_renders: 0,
    form_with_usage: 0,
    form_for_usage: 0,
    jbuilder_views: 0,
    content_for_keys: [],
  }

  const viewEntries = entries.filter(
    (e) =>
      e.path.startsWith('app/views/') ||
      e.category === 'view' ||
      e.category === 'layout' ||
      e.category === 'partial' ||
      e.category === 'jbuilder',
  )

  // Check for non-standard view directories (e.g. app/views_mobile, app/views_shared)
  const additionalViewDirs = []
  try {
    const appContents = provider.listDir('app') || []
    for (const name of appContents) {
      const dirName = name.replace(/\/$/, '')
      if (dirName.startsWith('views_') && dirName !== 'views') {
        additionalViewDirs.push(`app/${dirName}`)
      }
    }
  } catch (_) {
    // listDir not supported — skip
  }

  if (additionalViewDirs.length > 0) {
    for (const dir of additionalViewDirs) {
      const files = [
        ...(provider.glob ? provider.glob(`${dir}/**/*.erb`) || [] : []),
        ...(provider.glob ? provider.glob(`${dir}/**/*.haml`) || [] : []),
        ...(provider.glob ? provider.glob(`${dir}/**/*.slim`) || [] : []),
      ]
      for (const path of files) {
        const ext = path.split('.').pop()
        viewEntries.push({
          path,
          category: 'view',
          categoryName: 'views',
          type: ext,
        })
      }
    }
    result.additional_view_directories = additionalViewDirs
  }

  if (viewEntries.length === 0) return result

  result.template_engine = detectEngine(viewEntries)

  const contentForKeys = new Set()
  let jbuilderCount = 0

  for (const entry of viewEntries) {
    const { path } = entry

    // Layouts
    if (path.startsWith('app/views/layouts/')) {
      const name = path
        .replace('app/views/layouts/', '')
        .replace(/\.\w+(\.\w+)*$/, '')
      if (!result.layouts.includes(name)) {
        result.layouts.push(name)
      }
    }

    // Turbo stream templates
    if (path.includes('.turbo_stream.')) {
      result.turbo_stream_templates++
    }

    // Jbuilder
    if (path.endsWith('.jbuilder')) {
      jbuilderCount++
    }

    // Read content for pattern matching
    const content = provider.readFile(path)
    if (!content) continue

    // Turbo frames
    const frameRe = new RegExp(VIEW_PATTERNS.turboFrame.source, 'g')
    let m
    while ((m = frameRe.exec(content))) {
      result.turbo_frames_count++
    }

    // Component renders
    const compRe = new RegExp(VIEW_PATTERNS.componentRender.source, 'g')
    while ((m = compRe.exec(content))) {
      result.component_renders++
    }

    // Partial renders
    const partialRe = new RegExp(VIEW_PATTERNS.partialRender.source, 'g')
    while ((m = partialRe.exec(content))) {
      result.partial_renders++
    }

    // Form helpers
    const formWithRe = new RegExp(VIEW_PATTERNS.formWith.source, 'g')
    while ((m = formWithRe.exec(content))) {
      result.form_with_usage++
    }

    const formForRe = new RegExp(VIEW_PATTERNS.formFor.source, 'g')
    while ((m = formForRe.exec(content))) {
      result.form_for_usage++
    }

    // Content for keys
    const cfRe = new RegExp(VIEW_PATTERNS.contentFor.source, 'g')
    while ((m = cfRe.exec(content))) {
      contentForKeys.add(m[1])
    }
  }

  result.jbuilder_views = jbuilderCount
  result.content_for_keys = [...contentForKeys].sort()

  return result
}
