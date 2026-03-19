/**
 * Regex patterns for API and GraphQL extraction.
 */
export const API_PATTERNS = {
  apiOnly: /config\.api_only\s*=\s*true/,
  serializerClass: /class\s+(\w+Serializer)\s*<\s*(\w+)/,
  blueprintClass: /class\s+(\w+Blueprint)\s*<\s*(\w+)/,
  serializerAttributes: /^\s*attributes?\s+(.+)/m,
  pagyUsage: /pagy\s*\((.+)\)/g,
  kaminariUsage: /\.page\s*\((.+)\)\.per\s*\((.+)\)/g,
  rackAttackThrottle: /Rack::Attack\.throttle\s*\((.+)\)/g,
  rackAttackBlocklist: /Rack::Attack\.blocklist\s*\((.+)\)/g,
  corsConfig:
    /Rails\.application\.config\.middleware\.insert_before.*Rack::Cors/,
  corsOrigins: /allow\s+do\s*\n\s*origins\s+(.+)/g,
  graphqlSchema: /class\s+(\w+Schema)\s*<\s*GraphQL::Schema/,
  graphqlType: /class\s+Types::(\w+)\s*<\s*Types::BaseObject/g,
  graphqlMutation: /class\s+Mutations::(\w+)\s*<\s*Mutations::BaseMutation/g,
  renderJson: /render\s+json:/g,
  respondTo: /respond_to\s+do/g,
  jbuilder: /json\.extract!|json\.\w+/g,
  apiNamespace: /namespace\s+:api/g,
  apiVersion: /namespace\s+:v\d+/g,
  skipCsrf: /skip_before_action\s+:verify_authenticity_token/g,
  grapeApi: /Grape::API/,
  graphqlField: /field\s+:\w+/g,
}
