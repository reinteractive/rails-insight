import { describe, it, expect } from 'vitest'
import { parseDiffOutput, detectChangedFiles } from '../../src/git/diff-parser.js'

describe('parseDiffOutput', () => {
  it('parses M (modified) status', () => {
    const result = parseDiffOutput('M\tapp/models/user.rb')
    expect(result).toEqual([{ path: 'app/models/user.rb', status: 'modified' }])
  })

  it('parses A (added) status', () => {
    const result = parseDiffOutput('A\tapp/models/post.rb')
    expect(result).toEqual([{ path: 'app/models/post.rb', status: 'added' }])
  })

  it('parses D (deleted) status', () => {
    const result = parseDiffOutput('D\tapp/models/old.rb')
    expect(result).toEqual([{ path: 'app/models/old.rb', status: 'deleted' }])
  })

  it('parses R (renamed) status', () => {
    const result = parseDiffOutput('R100\told.rb\tnew.rb')
    expect(result).toEqual([
      { path: 'new.rb', status: 'renamed', oldPath: 'old.rb' },
    ])
  })

  it('handles empty output', () => {
    expect(parseDiffOutput('')).toEqual([])
  })

  it('handles multiple files', () => {
    const output = 'M\tapp/models/user.rb\nA\tapp/models/post.rb'
    const result = parseDiffOutput(output)
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('modified')
    expect(result[1].status).toBe('added')
  })

  it('ignores blank lines', () => {
    const output = 'M\tapp/models/user.rb\n\n\n'
    const result = parseDiffOutput(output)
    expect(result).toHaveLength(1)
  })
})

describe('detectChangedFiles', () => {
  it('returns error for non-git repo', async () => {
    const provider = {
      async execCommand() {
        return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 }
      },
    }
    const result = await detectChangedFiles(provider)
    expect(result.error).toContain('Not a git repository')
    expect(result.files).toEqual([])
  })

  it('calls correct git commands', async () => {
    const commands = []
    const provider = {
      async execCommand(cmd) {
        commands.push(cmd)
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    }
    await detectChangedFiles(provider, 'HEAD')
    expect(commands[0]).toContain('git diff --name-status HEAD')
  })

  it('includes untracked files when option set', async () => {
    const provider = {
      async execCommand(cmd) {
        if (cmd.includes('ls-files')) {
          return { stdout: 'app/models/new.rb\n', stderr: '', exitCode: 0 }
        }
        return { stdout: 'M\tapp/models/user.rb\n', stderr: '', exitCode: 0 }
      },
    }
    const result = await detectChangedFiles(provider, 'HEAD', { includeUntracked: true })
    expect(result.files).toHaveLength(2)
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('app/models/new.rb')
    expect(paths).toContain('app/models/user.rb')
  })

  it('excludes untracked files when option false', async () => {
    const provider = {
      async execCommand(cmd) {
        if (cmd.includes('ls-files')) {
          return { stdout: 'app/models/new.rb\n', stderr: '', exitCode: 0 }
        }
        return { stdout: 'M\tapp/models/user.rb\n', stderr: '', exitCode: 0 }
      },
    }
    const result = await detectChangedFiles(provider, 'HEAD', { includeUntracked: false })
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('app/models/user.rb')
  })

  it('returns error when provider has no execCommand', async () => {
    const provider = {}
    const result = await detectChangedFiles(provider)
    expect(result.error).toContain('does not support execCommand')
  })

  it('uses cached flag for staged changes', async () => {
    const commands = []
    const provider = {
      async execCommand(cmd) {
        commands.push(cmd)
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    }
    await detectChangedFiles(provider, 'HEAD', { staged: true })
    expect(commands[0]).toContain('--cached')
  })
})
