import { config } from './config-global.mjs'
import { InternalServerError } from './errors.mjs'

import fs from 'fs'
import path from 'path'

/// Return the command string to execute to run vg.
/// Checks config.vgPath.
/// An entry of "" in config.vgPath means to check PATH.
export function find_vg() {
  if (find_vg.found_vg !== null) {
    // Cache the answer and don't re-check all the time.
    // Nobody should be deleting vg.
    return find_vg.found_vg
  }
  for (let prefix of config.vgPath) {
    if (prefix === '') {
      // Empty string has special meaning of "use PATH".
      console.log('Check for vg on PATH')
      const onPath = findOnPath('vg')
      if (onPath === undefined) {
        continue
      }
      find_vg.found_vg = onPath
      console.log('Found vg at:', find_vg.found_vg)
      return find_vg.found_vg
    }
    if (prefix.length > 0 && prefix[prefix.length - 1] !== '/') {
      // Add trailing slash
      prefix = prefix + '/'
    }
    const vg_filename = prefix + 'vg'
    console.log('Check for vg at:', vg_filename)
    if (fs.existsSync(vg_filename)) {
      if (!fs.statSync(vg_filename).isFile()) {
        // This is a directory or something, not a binary we can run.
        continue
      }
      try {
        // Pretend we will execute it
        fs.accessSync(vg_filename, fs.constants.X_OK)
      } catch (e) {
        // Not executable
        continue
      }
      // If we get here it is executable.
      find_vg.found_vg = vg_filename
      console.log('Found vg at:', find_vg.found_vg)
      return find_vg.found_vg
    }
  }
  // If we get here we don't see vg at all.
  throw new InternalServerError(
    'The vg command was not found. Install vg to use the Sequence Tube Map: https://github.com/vgteam/vg?tab=readme-ov-file#installation',
  )
}
find_vg.found_vg = null

/// Return whether vg can be found, without throwing. For tests that need the
/// binary and should skip rather than fail when it is not installed.
export function vg_available() {
  try {
    find_vg()
    return true
  } catch (e) {
    return false
  }
}

function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name)
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      if (fs.statSync(candidate).isFile()) {
        return candidate
      }
    } catch {
      // not in this directory
    }
  }
  return undefined
}
