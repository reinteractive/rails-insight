/**
 * @typedef {Object} FileProvider
 * @property {function(string): string|null} readFile - Read file contents. Returns null on error.
 * @property {function(string): string[]} readLines - Read file as array of lines. Returns [] on error.
 * @property {function(string): boolean} fileExists - Check if file exists.
 * @property {function(string): string[]} glob - Recursive glob matching. Pattern supports ** wildcards.
 * @property {function(string): string[]} listDir - List directory contents. Returns [] if not found.
 * @property {function(): string} getProjectRoot - Return the project root identifier.
 */
export default {}
