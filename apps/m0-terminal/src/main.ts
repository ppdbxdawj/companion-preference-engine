import type { M0ExperienceSession } from './session.js'
import { parseTerminalCommand } from './command.js'
import { renderExperienceSnapshot } from './render.js'

export type TerminalOutput = Readonly<{
  write: (text: string) => void
}>

/**
 * Injectable streams keep the human walkthrough and scripted smoke test on the
 * same orchestration path. The implementation creates readline only at launch.
 */
export async function runTerminal(
  input: AsyncIterable<string>,
  output: TerminalOutput,
  session: M0ExperienceSession,
): Promise<0 | 1> {
  for await (const line of input) {
    const parsed = parseTerminalCommand(line)
    if (parsed.kind === 'parse-error') {
      output.write(`错误：${parsed.message}\n`)
      continue
    }
    try {
      switch (parsed.command.type) {
        case 'help':
          output.write('命令：show next confirm <id> reject <id> revoke <id> domain <work|companion> reset exit\n')
          break
        case 'show':
          output.write(renderExperienceSnapshot(await session.show()))
          break
        case 'next':
          output.write(renderExperienceSnapshot(await session.next()))
          break
        case 'confirm':
          output.write(renderExperienceSnapshot(await session.confirm(parsed.command.candidateId)))
          break
        case 'reject':
          output.write(renderExperienceSnapshot(await session.reject(parsed.command.candidateId)))
          break
        case 'revoke':
          output.write(renderExperienceSnapshot(await session.revoke(parsed.command.preferenceId)))
          break
        case 'domain':
          output.write(renderExperienceSnapshot(await session.setDomain(parsed.command.domain)))
          break
        case 'reset':
          output.write(renderExperienceSnapshot(await session.reset()))
          break
        case 'exit':
          return 0
      }
    } catch (error) {
      if (error instanceof Error && (error.name === 'InvalidTransitionError' || error.name === 'RevisionConflictError')) {
        output.write(`无法执行：${error.message}\n`)
        continue
      }
      output.write('无法执行该操作。\n')
      return 1
    }
  }
  return 0
}
