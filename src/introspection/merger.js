/**
 * Merge Engine
 * Reconciles regex extraction output with runtime introspection data.
 * Rule: runtime wins on facts, regex wins on structure.
 */

export function mergeModels(regexModels, runtimeModels) {
  const merged = structuredClone(regexModels)

  for (const [className, runtimeModel] of Object.entries(runtimeModels)) {
    if (merged[className]) {
      const regexModel = merged[className]

      // Runtime wins on facts: associations, columns, enums
      regexModel.associations = runtimeModel.associations
      regexModel.columns = runtimeModel.columns
      regexModel.enums = runtimeModel.enums

      // Merge callbacks: annotate each with source ('regex', 'runtime', 'both')
      const regexCallbacks = regexModel.callbacks || []
      const runtimeCallbacks = runtimeModel.callbacks || []

      const mergedCallbacks = []

      for (const rtCb of runtimeCallbacks) {
        const rtFilter = rtCb.filter || rtCb.method
        const rtKind = rtCb.kind || rtCb.type
        const matchingRegex = regexCallbacks.find((rxCb) => {
          const rxMethod = rxCb.method || rxCb.filter
          const rxKind = rxCb.type || rxCb.kind
          return rxMethod === rtFilter && rxKind === rtKind
        })
        mergedCallbacks.push({
          ...rtCb,
          source: matchingRegex ? 'both' : 'runtime',
        })
      }

      for (const rxCb of regexCallbacks) {
        const rxMethod = rxCb.method || rxCb.filter
        const rxKind = rxCb.type || rxCb.kind
        const matchingRuntime = runtimeCallbacks.find((rtCb) => {
          const rtFilter = rtCb.filter || rtCb.method
          const rtKind = rtCb.kind || rtCb.type
          return rxMethod === rtFilter && rxKind === rtKind
        })
        if (!matchingRuntime) {
          mergedCallbacks.push({ ...rxCb, source: 'regex' })
        }
      }

      regexModel.callbacks = mergedCallbacks
    } else {
      // Runtime-only model — not found in regex extraction
      merged[className] = { ...runtimeModel, source: 'runtime_only' }
    }
  }

  return merged
}

export function mergeControllers(regexControllers, runtimeControllers) {
  const merged = structuredClone(regexControllers)

  for (const [className, runtimeController] of Object.entries(
    runtimeControllers,
  )) {
    if (merged[className]) {
      const regexController = merged[className]

      // Runtime wins on facts: callbacks (includes inherited ones not visible in source)
      regexController.callbacks = runtimeController.callbacks

      // Runtime wins on actions list (complete set from reflection)
      regexController.actions = runtimeController.actions
    } else {
      // Runtime-only controller — not found in regex extraction
      merged[className] = { ...runtimeController, source: 'runtime_only' }
    }
  }

  return merged
}

export function mergeRoutes(regexRoutes, runtimeRoutes) {
  if (!runtimeRoutes) return regexRoutes

  const merged = structuredClone(regexRoutes)

  // Separate engine routes from regular routes
  const engineRoutes = runtimeRoutes.filter(
    (r) => r.engine !== null && r.engine !== undefined,
  )
  const regularRoutes = runtimeRoutes.filter((r) => !r.engine)

  // Add engine routes as a new top-level array
  merged.engine_routes = engineRoutes

  // Build a set of runtime route signatures for unresolved detection
  const runtimeSignatures = new Set(
    regularRoutes.map((r) => `${r.verb} ${r.controller}#${r.action}`),
  )

  // Flag regex resources that have no matching runtime routes (only when runtime has data)
  if (regularRoutes.length > 0) {
    for (const resource of merged.resources || []) {
      const controller = resource.controller
      const hasAnyMatch = (resource.actions || []).some((action) =>
        Array.from(runtimeSignatures).some((sig) =>
          sig.endsWith(` ${controller}#${action}`),
        ),
      )
      if (!hasAnyMatch) {
        resource.unresolved = true
      }
    }
  }

  return merged
}

export function mergeSchema(regexSchema, runtimeDatabase) {
  if (!runtimeDatabase) return regexSchema

  const merged = structuredClone(regexSchema)

  // Enrich tables with runtime column data
  const modelColumns = runtimeDatabase.model_columns || {}
  for (const table of merged.tables || []) {
    if (modelColumns[table.name]) {
      table.runtime_columns = modelColumns[table.name]
    }
  }

  // Add runtime foreign keys not already present
  const existingFks = new Set(
    (merged.foreign_keys || []).map((fk) => `${fk.from_table}:${fk.to_table}`),
  )
  for (const fk of runtimeDatabase.foreign_keys || []) {
    const key = `${fk.from_table}:${fk.to_table}`
    if (!existingFks.has(key)) {
      merged.foreign_keys.push({ ...fk, source: 'runtime' })
      existingFks.add(key)
    }
  }

  merged.runtime_adapter = runtimeDatabase.adapter
  merged.runtime_database_version = runtimeDatabase.database_version

  return merged
}

export function mergeExtractions(regexExtractions, introspectionResult) {
  if (!introspectionResult.available) {
    return structuredClone(regexExtractions)
  }

  const merged = structuredClone(regexExtractions)

  if (
    introspectionResult.models !== null &&
    introspectionResult.models !== undefined
  ) {
    merged.models = mergeModels(
      regexExtractions.models,
      introspectionResult.models,
    )
  }

  if (
    introspectionResult.controllers !== null &&
    introspectionResult.controllers !== undefined
  ) {
    merged.controllers = mergeControllers(
      regexExtractions.controllers,
      introspectionResult.controllers,
    )
  }

  if (
    introspectionResult.routes !== null &&
    introspectionResult.routes !== undefined
  ) {
    merged.routes = mergeRoutes(
      regexExtractions.routes,
      introspectionResult.routes,
    )
  }

  if (
    introspectionResult.database !== null &&
    introspectionResult.database !== undefined
  ) {
    merged.schema = mergeSchema(
      regexExtractions.schema,
      introspectionResult.database,
    )
  }

  merged._introspection = {
    available: true,
    models_merged: Object.keys(introspectionResult.models || {}).length,
    controllers_merged: Object.keys(introspectionResult.controllers || {})
      .length,
    routes_introspected: (introspectionResult.routes || []).length,
  }

  return merged
}
