/**
 * Regex patterns for FactoryBot extraction.
 */
export const FACTORY_PATTERNS = {
  // Factory definition: factory :name or factory :name, class: "ClassName"
  factoryDef:
    /^\s*factory\s+:(\w+)(?:,\s*class:\s*['"]?:?(\w+(?:::\w+)*)['"]?)?\s*do/m,

  // Trait definition
  trait: /^\s*trait\s+:(\w+)\s*do/m,

  // Sequence definition
  sequence: /^\s*sequence\s*\(:(\w+)\)/m,
  sequenceBlock: /^\s*sequence\s+:(\w+)\s/m,

  // Association reference inside factory
  association: /^\s*association\s+:(\w+)(?:,\s*(.+))?/m,

  // Transient block
  transient: /^\s*transient\s+do/m,

  // After callbacks
  afterCreate: /^\s*after\s*\(:create\)/m,
  afterBuild: /^\s*after\s*\(:build\)/m,

  // Attribute with block: name { value }
  attributeBlock: /^\s*(\w+)\s*\{([^}]*)\}/m,

  // Attribute with static value (less common)
  attributeStatic: /^\s*(\w+)\s+['"]([^'"]+)['"]/m,
}
