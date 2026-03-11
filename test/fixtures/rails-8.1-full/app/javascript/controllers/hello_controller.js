import { Controller } from '@hotwired/stimulus'

// Connects to data-controller="hello"
export default class extends Controller {
  static targets = ['output', 'name']
  static values = {
    greeting: { type: String, default: 'Hello' },
  }

  connect() {
    console.log('HelloController connected')
    this.outputTarget.textContent = `${this.greetingValue}, World!`
  }

  greet() {
    const name = this.nameTarget.value || 'World'
    this.outputTarget.textContent = `${this.greetingValue}, ${name}!`
  }
}
