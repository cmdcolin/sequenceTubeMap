/* eslint no-console: 'off' */
/* eslint strict:0 */
/* eslint no-param-reassign: 'off' */

'use strict'

import './config-server.mjs'
import { config } from './config-global.mjs'
import { find_vg } from './vg.mjs'
import {
  TubeMapError,
  BadRequestError,
  InternalServerError,
  VgExecutionError,
} from './errors.mjs'

import assert from 'assert'
import { spawn } from 'child_process'
import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import rl from 'readline'
import compression from 'compression'
import { server as WebSocketServer } from 'websocket'
import { fileURLToPath } from 'url'
import {
  parseRegion,
  convertRegionToRangeRegion,
  stringifyRangeRegion,
  stringifyRegion,
  isValidURL,
  readsExist,
} from './common.ts'
import { once } from 'events'
import { pipeline } from 'stream'
import { finished } from 'stream/promises'
import dns from 'dns'
import http from 'http'
import https from 'https'
import net from 'net'
import sanitize from 'sanitize-filename'
import { createHash, randomUUID } from 'node:crypto'
import { RWLock } from 'readers-writer-lock'

/// Return the python script chunkix.py
/// Checks config.chunkixPath.
/// An entry of "" in config.chunkixPath means to check current working
///      directory '.' (better to avoid this and specify a path though).
function find_chunkix() {
  if (find_chunkix.found_chunkix !== null) {
    // Cache the answer and don't re-check all the time.
    // Nobody should be deleting it.
    return find_chunkix.found_chunkix
  }
  for (let prefix of config.chunkixPath) {
    if (prefix === '') {
      // Add trailing slash
      prefix = './'
    }
    if (prefix.length > 0 && prefix[prefix.length - 1] !== '/') {
      // Add trailing slash
      prefix = prefix + '/'
    }
    const chunkix_filename = prefix + 'chunkix.py'
    console.log('Check for chunkix.py at:', chunkix_filename)
    if (fs.existsSync(chunkix_filename)) {
      find_chunkix.found_chunkix = chunkix_filename
      console.log('Found chunkix at:', find_chunkix.found_chunkix)
      return find_chunkix.found_chunkix
    }
  }
  // If we get here we don't see chunkix at all.
  throw new InternalServerError(
    'The chunkix.py script was not found. Check that chunkixPath is correct in the config',
  )
}
find_chunkix.found_chunkix = null

const MOUNTED_DATA_PATH = config.dataPath
const INTERNAL_DATA_PATH = config.internalDataPath
// THis is where we will store uploaded files
const UPLOAD_DATA_PATH = 'uploads/'
// This is where we will store per-request generated files
const SCRATCH_DATA_PATH = 'tmp/'
// This is where data downloaded from URLs is cached.
// This directory will be recursively removed!
const DOWNLOAD_DATA_PATH = config.tempDirPath
const SERVER_BIND_ADDRESS = config.serverBindAddress || undefined

// This holds a collection of all the absolute path root directories that the
// server is allowed to access on behalf of users.
const ALLOWED_DATA_DIRECTORIES = [
  MOUNTED_DATA_PATH,
  INTERNAL_DATA_PATH,
  UPLOAD_DATA_PATH,
  SCRATCH_DATA_PATH,
  DOWNLOAD_DATA_PATH,
].map(p => path.resolve(p))

const GRAPH_EXTENSIONS = ['.xg', '.vg', '.pg', '.hg', '.gbz', '.pos.bed.gz']

const HAPLOTYPE_EXTENSIONS = ['.gbwt', '.gbz', '.haps.gaf.gz']
const HAPLOTYPE_EXTENSIONS_VG = ['.gbwt', '.gbz']

const fileTypes = {
  GRAPH: 'graph',
  HAPLOTYPE: 'haplotype',
  NODE: 'node',
  READ: 'read',
  BED: 'bed',
  TRANSLATION: 'translation',
}

const lockMap = new Map()

// Requests that read or add files in the upload and download directories
// share a READ_LOCK on them; the expired-file sweep takes the WRITE_LOCK to
// delete from them.
const lockTypes = {
  READ_LOCK: 'read_lock',
  WRITE_LOCK: 'write_lock',
}

// The ETag of each URL's copy on disk, so an unchanged file isn't downloaded
// again.
const ETagMap = new Map()

// Make sure that the scratch directory exists at startup, so multiple requests
// can't fight over its creation.
fs.mkdirSync(SCRATCH_DATA_PATH, { recursive: true })

// Extensions a user is allowed to upload, derived from the same config the
// frontend's file picker filters on.
const ALLOWED_UPLOAD_EXTENSIONS = [
  ...new Set(
    Object.values(config.fileTypeToExtensions).flatMap(list =>
      list.split(',').map(extension => extension.trim().toLowerCase()),
    ),
  ),
].sort((a, b) => b.length - a.length)

function allowedUploadExtension(filename) {
  const lower = filename.toLowerCase()
  return ALLOWED_UPLOAD_EXTENSIONS.find(extension => lower.endsWith(extension))
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DATA_PATH)
  },
  filename: function (req, file, cb) {
    const ext = allowedUploadExtension(file.originalname)
    if (ext === undefined) {
      cb(
        new BadRequestError(
          `Uploading "${file.originalname}" is not allowed: unsupported file extension`,
        ),
      )
    } else {
      // A random name can't collide with another upload and can't be guessed
      // by another user.
      cb(null, randomUUID() + ext)
    }
  },
})
const limits = {
  files: 1, // allow only 1 file per request
  fileSize: 1024 * 1024 * 5, // 5 MB (max file size)
}
const upload = multer({ storage, limits })

// deletes expired files given a directory, recursively calls itself for nested directories
// expired files are files not accessed for a certain amount of time
// TODO: find a more reliable way to detect file accessed time than stat.atime?
// atime requires correct environment configurations
function deleteExpiredFiles(directoryPath) {
  console.log('deleting expired files in ', directoryPath)
  const currentTime = new Date().getTime()

  if (!fs.existsSync(directoryPath)) {
    return
  }

  const files = fs.readdirSync(directoryPath)

  files.forEach(file => {
    const filePath = path.join(directoryPath, file)

    if (fs.statSync(filePath).isFile()) {
      // check to see if file needs to be deleted
      const lastAccessedTime = fs.statSync(filePath).atime
      // config.fileExpirationTime is in seconds; the delta here is in ms.
      if (currentTime - lastAccessedTime >= config.fileExpirationTime * 1000) {
        if (file !== '.gitignore' && file !== 'directory.lock') {
          fs.unlinkSync(filePath)
          console.log('Deleting file: ', filePath)
        }
      }
    } else if (fs.statSync(filePath).isDirectory()) {
      // call deleteExpiredFiles on the nested directory
      deleteExpiredFiles(filePath)

      // if the nested directory is empty after deleting expired files, remove it
      if (fs.readdirSync(filePath).length === 0) {
        fs.rmdirSync(filePath)
        console.log('Deleting directory: ', filePath)
      }
    }
  })
}

// takes in an async function, locks the directory for the duration of the function
async function lockDirectory(directoryPath, lockType, func) {
  console.log('Acquiring', lockType, 'for', directoryPath)
  // look into lockMap to see if there is a lock assigned to the directory
  let lock = lockMap.get(directoryPath)
  // if there are no locks, create a new lock and store it in the lock dictionary
  if (!lock) {
    lock = new RWLock()

    lockMap.set(directoryPath, lock)
  }

  if (lockType == lockTypes.READ_LOCK) {
    // lock is released when func returns
    return lock.read(func)
  } else if (lockType == lockTypes.WRITE_LOCK) {
    return lock.write(func)
  } else {
    console.log('Not a valid lock type:', lockType)
    return 1
  }
}

// expects an array of directory paths, attempting to acquire all directory locks
// all uses of this function requires the array of directoryPaths to be in the same order
// e.g locking [DOWNLOAD_DATA_PATH, UPLOAD_DATA_PATH] should always lock DOWNLOAD_DATA_PATH first to prevent deadlock
async function lockDirectories(directoryPaths, lockType, func) {
  // input is unexpected
  if (!directoryPaths || directoryPaths.length === 0) {
    return
  }

  // last lock to acquire, ready to proceed
  if (directoryPaths.length === 1) {
    return lockDirectory(directoryPaths[0], lockType, func)
  }

  // attempt to acquire a lock for the next directory, and call lockDirectories on the remaining directories
  const [currDirectory, ...remainingPaths] = directoryPaths
  return lockDirectory(currDirectory, lockType, async function () {
    return lockDirectories(remainingPaths, lockType, func)
  })
}

// deletes any files in the download directory past the set fileExpirationTime set in config
const expiredFileCleanupTask = setInterval(
  async () => {
    console.log('scheduled expired file check')
    // attempt to acquire a write lock for each on the directory before attempting to delete files
    for (const dir of [DOWNLOAD_DATA_PATH, UPLOAD_DATA_PATH]) {
      try {
        await lockDirectory(dir, lockTypes.WRITE_LOCK, async function () {
          deleteExpiredFiles(dir)
        })
      } catch (e) {
        console.error('Error checking for expired files in ' + dir + ':', e)
      }
    }
  },
  60 * 60 * 1000,
)

const app = express()

// Configure global server settings
app.use(express.json()) // to support JSON-encoded bodies
app.use(express.urlencoded({ extended: true })) // to support URL-encoded bodies
app.use(compression())

// Serve the frontend
app.use(express.static('./build'))

// Make another Express object to keep all the API calls on a sensible path
// that can be proxied around if needed.
const api = express()
app.use('/api/v0', api)

// Open up CORS.
// TODO: can we avoid this?
// required for local usage with the Docker container (access docker container from outside)
api.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept',
  )
  next()
})

// Store files uploaded from trackFilePicker via multer
api.post(
  '/trackFileSubmission',
  upload.single('trackFile'),
  async (req, res, next) => {
    console.log('/trackFileSubmission')
    console.log(req.file)
    // We don't get a lock because we're putting new files in and so we don't
    // need to block using them or cleaning old files.

    if (req.file === undefined) {
      throw new BadRequestError('No trackFile was uploaded with the request')
    }
    if (!Object.hasOwn(config.fileTypeToExtensions, req.body.fileType)) {
      // multer has already written the file, so don't leave it behind.
      await fs.promises.rm(req.file.path, { force: true })
      throw new BadRequestError(`Unknown file type: ${req.body.fileType}`)
    }

    if (req.body.fileType === fileTypes['READ']) {
      // Only .gam can be sorted and indexed here. Anything else has already
      // been written to disk by multer, so clear it before rejecting.
      const rejection = readUploadRejection(req.file.path)
      if (rejection !== null) {
        await fs.promises.rm(req.file.path, { force: true })
        throw new BadRequestError(rejection)
      }
      indexGamSorted(req, res, next)
    } else {
      res.json({ path: path.relative('.', req.file.path) })
    }
  },
)

// Why an uploaded read file can't be used, or null when it can. A mounted
// .gaf.gz that is already tabix-indexed works fine as a track; it is only the
// upload route that has no way to sort and index one.
export function readUploadRejection(readsPath) {
  if (readsPath.endsWith('.gaf') || readsPath.endsWith('.gaf.gz')) {
    return (
      `Server-side sorting and indexing is not implemented for GAF: ${readsPath}. ` +
      'Sort and tabix-index it yourself and mount it in the data directory instead.'
    )
  }
  if (!readsPath.endsWith('.gam')) {
    return `Read file is not a GAM: ${readsPath}`
  }
  return null
}

function indexGamSorted(req, res, next) {
  // Uploads are stored as <uuid>.gam.
  const readsPath = req.file.path
  const sortedPath = readsPath.replace(/\.gam$/, '.sorted.gam')
  const indexPath = sortedPath + '.gai'

  const vgGamsortParams = ['gamsort', '-i', indexPath, readsPath]
  const vgGamsortChild = spawn(find_vg(), vgGamsortParams)

  req.error = Buffer.alloc(0)

  const sortedReadsFile = fs.createWriteStream(sortedPath, {
    encoding: 'binary',
  })

  let sentResponse = false

  vgGamsortChild.on('error', function (err) {
    console.log(
      'Error executing ' +
        find_vg() +
        ' ' +
        vgGamsortParams.join(' ') +
        ': ' +
        err,
    )
    if (!sentResponse) {
      sentResponse = true
      next(new VgExecutionError('vg gamsort failed'))
    }
  })

  vgGamsortChild.stderr.on('data', data => {
    console.log(`err data: ${data}`)
    req.error += data
  })

  vgGamsortChild.stdout.on('data', function (data) {
    sortedReadsFile.write(data)
  })

  vgGamsortChild.on('close', code => {
    console.log(`vg gamsort exited with code ${code}`)
    sortedReadsFile.end()

    if (!sentResponse) {
      sentResponse = true
      if (code === 0) {
        finished(sortedReadsFile)
          .then(() => {
            res.json({ path: path.relative('.', sortedPath) })
          })
          .catch(err => {
            next(err)
          })
      } else {
        next(new VgExecutionError('vg gamsort failed'))
      }
    }
  })
}

// Checks if a file has one of the extensions provided
function endsWithExtensions(file, extensions) {
  for (const extension of extensions) {
    if (file.endsWith(extension)) {
      return true
    }
  }
  return false
}

// Throw unless a graph track names a graph file we let vg open.
function assertGraphFile(graphFile) {
  if (
    typeof graphFile !== 'string' ||
    !endsWithExtensions(graphFile, GRAPH_EXTENSIONS)
  ) {
    throw new BadRequestError(
      'Graph file does not end in valid extension: ' + graphFile,
    )
  }
  if (!isAllowedPath(graphFile)) {
    throw new BadRequestError('Graph file path not allowed: ' + graphFile)
  }
}

// INPUT: (track {files: }, string)
// OUTPUT: string
// returns the file name of the specified type in that track
// returns falsy value if file type is not found
function getFileFromType(track, type) {
  if (track.trackType === type) {
    return track.trackFile
  }
  return 'none'
}

// Given a collection of tracks (each of which may have a files array with
// items with a type and a name), generate the filenames for the first file of
// the given type for each track with such a file.
//
// This is a fancy ES6 generator.
function* eachFileOfType(tracks, type) {
  for (const key in tracks) {
    const file = getFileFromType(tracks[key], type)
    if (file && file !== 'none') {
      yield file
    }
  }
}

// Get the first files of the given type from all the given tracks.
function getFilesOfType(tracks, type) {
  const results = []
  for (const file of eachFileOfType(tracks, type)) {
    results.push(file)
  }
  return results
}

// Get the first file from the first track with a file of the given type, or
// undefined if no such track exists.
function getFirstFileOfType(tracks, type) {
  for (const file of eachFileOfType(tracks, type)) {
    return file
  }
  return undefined
}

// Returns an array of the first gam file of every track with a gam file
function getGams(tracks) {
  return getFilesOfType(tracks, fileTypes.READ)
}

// Parse a vg --gfa-trans translation file into a node-ID-to-display-name map.
// T lines: T\tsegmentName\tsegmentId  (original GFA name → pre-chop ID)
// K lines: K\toldId\tforwardOffset\treverseOffset\tnewId  (chopped node mapping)
async function parseGFATranslation(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf-8')
  const originalIdToName = {}
  const kLines = []
  const choppedIds = new Set()

  for (const line of content.split('\n')) {
    const fields = line.trimEnd().split('\t')
    if (fields[0] === 'T' && fields.length >= 3) {
      originalIdToName[fields[2]] = fields[1]
    } else if (fields[0] === 'K' && fields.length >= 5) {
      choppedIds.add(fields[1])
      kLines.push({
        oldId: fields[1],
        forwardOffset: parseInt(fields[2]),
        newId: fields[4],
      })
    }
  }

  const nameMap = {}
  for (const [segId, segName] of Object.entries(originalIdToName)) {
    if (!choppedIds.has(segId)) {
      nameMap[segId] = segName
    }
  }
  for (const { oldId, forwardOffset, newId } of kLines) {
    const segName = originalIdToName[oldId] ?? oldId
    nameMap[newId] = `${segName}:${forwardOffset}`
  }
  return nameMap
}

// Wrap a route handler to hold a READ_LOCK on the download and upload
// directories until its response is over, not just until the handler
// returns: getChunkedData returns once vg is running, and vg still has files
// to read.
function withDataDirectoriesLocked(handler) {
  return (req, res, next) =>
    lockDirectories(
      [DOWNLOAD_DATA_PATH, UPLOAD_DATA_PATH],
      lockTypes.READ_LOCK,
      async () => {
        const responseOver = new Promise(resolve => {
          res.once('close', resolve)
        })
        await handler(req, res, next)
        await responseOver
      },
    )
}

api.post('/getChunkedData', withDataDirectoriesLocked(getChunkedData))

/*
graph = {
  node: [
    {
      sequence: "AGCT"
      id: "1"
    },
    {
      sequence: "AGCTAG"
      id: "2"
    }
  ],
  edge: [],
  path: []
}
removing sequence would result in
graph = {
  node: [
    {
      id: "1"
    },
    {
      id: "2"
    }
  ],
  edge: [],
  path: []
}
*/

// JSON.parse, but bad output from a subprocess becomes an error we can report
// to the user instead of an exception thrown into Node's event machinery.
function parseSubprocessJSON(text, source) {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new VgExecutionError(
      `Could not parse JSON output of ${source}: ${e.message}`,
    )
  }
}

// Feed one child's output to the next. A stage that dies early shows in its
// own exit status, so a pipe broken by it only needs logging.
function pipeChildren(from, to) {
  pipeline(from.stdout, to.stdin, err => {
    if (err) {
      console.log('Pipe between subprocesses broke: ' + err.message)
    }
  })
}

// A runPipeline stage running vg. The client treats any stderr in req.error
// as a failure, so stages whose warnings are harmless leave it out.
function vgStage(args, { reportStderr = true } = {}) {
  return { name: `vg ${args[0]}`, command: find_vg(), args, reportStderr }
}

function childExit(child) {
  return new Promise(resolve => {
    child.once('error', error => {
      resolve({ error })
    })
    child.once('close', code => {
      resolve({ code })
    })
  })
}

// Run `stages` as a shell pipeline, each one's stdout feeding the next one's
// stdin, and resolve with the last one's stdout. When a stage fails, kill the
// rest and reject naming the first to fail.
async function runPipeline(req, stages) {
  const children = stages.map((stage, i) => {
    console.log(`${stage.command} ${stage.args.join(' ')}`)
    return spawn(stage.command, stage.args, {
      stdio: [i === 0 ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      signal: req.clientGone,
    })
  })
  children.forEach((child, i) => {
    if (i > 0) {
      pipeChildren(children[i - 1], child)
    }
    child.stderr.on('data', data => {
      console.log(`${stages[i].name} err data: ${data}`)
      if (stages[i].reportStderr) {
        req.error += data
      }
    })
  })
  const output = []
  children.at(-1).stdout.on('data', data => {
    output.push(data)
  })

  let failed = undefined
  await Promise.all(
    children.map(async (child, i) => {
      const { error, code } = await childExit(child)
      if (error !== undefined || code !== 0) {
        console.log(`${stages[i].name} failed: ${error ?? `exit code ${code}`}`)
        failed ??= stages[i]
        for (const other of children) {
          other.kill()
        }
      }
    }),
  )
  if (failed !== undefined) {
    throw new VgExecutionError(`${failed.name} failed`)
  }
  return Buffer.concat(output).toString()
}

// read a graph object and remove "sequence" fields in place
function removeNodeSequencesInPlace(graph) {
  console.log('graph:', graph)
  if (!graph.node) {
    return
  }
  graph.node.forEach(function (node) {
    node.sequenceLength = node.sequence.length
    delete node.sequence
  })
}

// Handle a chunked data (tube map view) request. Returns a promise. On error,
// either the promise rejects *or* next() is called with an error, or both.
// TODO: This is a terrible mixed design for error handling; we need to either
// rewrite the flow of talking to vg in terms of async/await or abandon
// async/await altogether in order to get out of it.
async function getChunkedData(req, res, next) {
  const reqId = randomUUID()
  req.reqId = reqId
  console.time(`request-duration-${reqId}`)
  console.log('http POST getChunkedData received')
  console.log(`region = ${req.body.region}`)
  console.log(`tracks = ${JSON.stringify(req.body.tracks)}`)

  // Aborting this kills the request's subprocesses.
  const clientGone = new AbortController()
  res.once('close', () => {
    if (!res.writableFinished) {
      clientGone.abort()
    }
  })
  req.clientGone = clientGone.signal

  // This will have a conitg, start, end, or a contig, start, distance
  let parsedRegion
  try {
    parsedRegion = parseRegion(req.body.region)
  } catch (e) {
    // Whatever went wrong in the parsing, it makes the request bad.
    throw new BadRequestError(
      'Wrong query: ' +
        e.message +
        ' See the Help (?) button above for the expected region format.',
    )
  }

  // A BED region with a pre-fetched chunk can list its own tracks in
  // tracks.json, which replace the requested ones. The request may have gone
  // out before the client fetched that list.
  let chunkPath = ''
  const chunk =
    req.body.bedFile && req.body.bedFile !== 'none'
      ? await getChunkName(req.body.bedFile, parsedRegion)
      : ''
  if (chunk !== '') {
    chunkPath = await getChunkPath(req.body.bedFile, chunk)
    const fetchedTracks = readChunkTracks(chunkPath)

    if (fetchedTracks) {
      // A track for a file the request also named keeps the request's colors.
      const fileToColor = new Map()
      for (const track of Object.values(req.body.tracks)) {
        fileToColor.set(track['trackFile'], track['trackColorSettings'])
      }
      for (const track of fetchedTracks) {
        if (fileToColor.has(track['trackFile'])) {
          track['trackColorSettings'] = fileToColor.get(track['trackFile'])
        }
      }

      console.log('Using new fetched tracks', JSON.stringify(fetchedTracks))
      req.body.tracks = fetchedTracks
    }
  }

  // Assign each request a UUID. v1 UUIDs can be very similar for similar
  // timestamps on the same node, but are still guaranteed to be unique within
  // a given nodejs process.
  req.uuid = randomUUID()

  // Make a temp directory for vg output files for this request
  req.chunkDir = path.join(SCRATCH_DATA_PATH, `tmp-${req.uuid}`)
  fs.mkdirSync(req.chunkDir)
  // This request owns the directory, so clean it up when the request finishes.
  req.rmChunk = true

  // We always have an graph file
  const graphFile = getFirstFileOfType(req.body.tracks, fileTypes.GRAPH)
  // We sometimes have a GBWT with haplotypes that override any in the graph file
  const gbwtFile = getFirstFileOfType(req.body.tracks, fileTypes.HAPLOTYPE)
  // We sometimes have a node tabix index
  const nodeFile = getFirstFileOfType(req.body.tracks, fileTypes.NODE)
  // We sometimes have a GFA translation file for recovering original segment names
  const translationFile = getFirstFileOfType(
    req.body.tracks,
    fileTypes.TRANSLATION,
  )
  // We sometimes have a BED file with regions to look at
  const bedFile = req.body.bedFile

  const gamFiles = getGams(req.body.tracks)

  console.log('graphFile ', graphFile)
  console.log('gbwtFile ', gbwtFile)
  console.log('nodeFile ', nodeFile)
  console.log('bedFile ', bedFile)
  console.log('gamFiles ', gamFiles)

  req.withGam = true
  if (!gamFiles || !gamFiles.length) {
    req.withGam = false
    console.log('no gam index provided.')
  }

  req.withGbwt = true
  if (!gbwtFile || gbwtFile === 'none') {
    req.withGbwt = false
    console.log('no gbwt file provided.')
  }

  req.withNode = true
  if (!nodeFile || nodeFile === 'none') {
    req.withNode = false
    console.log('no node file provided.')
  }

  req.nameMap = {}
  if (translationFile && translationFile !== 'none') {
    if (!isAllowedPath(translationFile)) {
      throw new BadRequestError(
        'Translation file path not allowed: ' + translationFile,
      )
    }
    req.nameMap = await parseGFATranslation(translationFile)
  }

  // client is going to send simplify = true if they want to simplify view
  req.simplify = false
  if (req.body.simplify) {
    if (readsExist(req.body.tracks)) {
      throw new BadRequestError('Simplify cannot be used on read tracks.')
    }
    req.simplify = true
  }

  // client is going to send removeSequences = true if they don't want sequences of nodes to be displayed
  req.removeSequences = false
  if (req.body.removeSequences) {
    req.removeSequences = true
  }

  // We only want to have one downstream callback chain out of here, and we
  // want to make sure it can only start after there's no possibility that we
  // concurrently reject.
  let sentResponse = false

  // We always need a range-version of the region, to fill in req.region, to
  // generate the region part of the response with the range.
  const rangeRegion = convertRegionToRangeRegion(parsedRegion)

  if (chunkPath === '') {
    assertGraphFile(graphFile)

    if (graphFile.endsWith('.pos.bed.gz')) {
      // use tabix-based pangenome (experimental)

      if (!req.withGbwt) {
        throw new BadRequestError(
          'Need to specify tabix-indexed haplotype file, ending with .haps.gaf.gz, paired with ' +
            graphFile,
        )
      }
      if (!isAllowedPath(gbwtFile)) {
        throw new BadRequestError(
          'Tabix-indexed haplotype file path not allowed: ' + gbwtFile,
        )
      }
      if (!req.withNode) {
        throw new BadRequestError(
          'Need to specify tabix-indexed node file, ending with .nodes.tsv.gz, paired with ' +
            graphFile,
        )
      }
      if (!isAllowedPath(nodeFile)) {
        throw new BadRequestError(
          'Tabix-indexed node file path not allowed: ' + nodeFile,
        )
      }

      const chunkixParams = [
        find_chunkix(),
        '-n',
        nodeFile,
        '-p',
        graphFile,
        '-g',
        gbwtFile,
        '-j',
        '-s',
        '-o',
        `${req.chunkDir}/chunk`,
      ]

      // push all indexed gaf files
      for (const gafFile of gamFiles) {
        if (!gafFile.endsWith('.gaf.gz')) {
          if (gafFile.endsWith('.gam')) {
            // slightly different message if GAM provided instead of GAF
            throw new BadRequestError(
              'Tabix-index mode only works with indexed GAF files',
            )
          } else {
            throw new BadRequestError(
              "GAF file doesn't end .gaf.gz: " + gafFile,
            )
          }
        }
        if (!isAllowedPath(gafFile)) {
          throw new BadRequestError('GAF file path not allowed: ' + gafFile)
        }
        console.log('pushing gaf file', gafFile)
        chunkixParams.push('-a', gafFile)
      }
      chunkixParams.push('-r', stringifyRangeRegion(rangeRegion))

      console.log(`python3 ${chunkixParams.join(' ')}`)
      console.time(`chunkix-${reqId}`)

      const chunkixCall = spawn('python3', chunkixParams, {
        signal: req.clientGone,
      })
      req.error = Buffer.alloc(0)

      chunkixCall.on('error', function (err) {
        console.log(
          'Error executing ' + 'python3 ',
          chunkixParams.join(' ') + ': ' + err,
        )
        if (!sentResponse) {
          sentResponse = true
          return next(new VgExecutionError('chunkix failed'))
        }
        return
      })

      chunkixCall.stderr.on('data', data => {
        console.log(`chunkix err data: ${data}`)
        req.error += data
      })

      chunkixCall.stdout.on('data', function (data) {
        console.log(`chunkix out data: ${data}`)
      })

      chunkixCall.on('close', code => {
        console.log(`chunkix exited with code ${code}`)
        if (code !== 0) {
          console.log('Error from python3 ' + chunkixParams.join(' '))
          // Execution failed, so don't go on to read output that isn't there.
          if (!sentResponse) {
            sentResponse = true
            next(new VgExecutionError('chunkix failed'))
          }
          return
        }

        // read json graph output
        const catCall = spawn('cat', [`${req.chunkDir}/chunk.graph.json`], {
          signal: req.clientGone,
        })
        let graphAsString = ''

        catCall.on('error', function (err) {
          console.log('Error executing "cat": ' + err)
          if (!sentResponse) {
            sentResponse = true
            return next(new VgExecutionError('cat graph.json failed'))
          }
          return
        })

        catCall.stderr.on('data', data => {
          console.log(`cat graph.json err data: ${data}`)
        })

        catCall.stdout.on('data', function (data) {
          graphAsString += data.toString()
        })

        catCall.on('close', code => {
          console.log(`cat graph.json exited with code ${code}`)
          console.timeEnd(`chunkix-${reqId}`)
          if (code !== 0) {
            // Execution failed
            if (!sentResponse) {
              sentResponse = true
              return next(new VgExecutionError('cat graph.json failed'))
            }
            return
          }
          if (graphAsString === '') {
            if (!sentResponse) {
              sentResponse = true
              return next(
                new VgExecutionError('cat graph.json produced empty graph'),
              )
            }
            return
          }
          if (!sentResponse) {
            sentResponse = true
            try {
              req.graph = parseSubprocessJSON(graphAsString, 'chunk.graph.json')
              if (req.removeSequences) {
                removeNodeSequencesInPlace(req.graph)
              }
              req.region = [rangeRegion.start, rangeRegion.end]
              // vg chunk always puts the path we reference on first automatically
              void processAnnotationFile(req, res, next)
            } catch (error) {
              next(error)
            }
          }
        })
      })
    } else {
      // use vg-based pangenome

      // call 'vg chunk' to generate graph
      const vgChunkParams = ['chunk']
      // TODO: Use same variable for check and command line?

      // Maybe check using file types in the future

      // See if we need to ignore haplotypes in gbz graph file

      if (req.withGbwt) {
        //either push gbz with graph and haplotype or push separate graph and gbwt file
        if (
          graphFile.endsWith('.gbz') &&
          gbwtFile.endsWith('.gbz') &&
          graphFile === gbwtFile
        ) {
          // use gbz haplotype
          vgChunkParams.push('-x', graphFile)
        } else if (!graphFile.endsWith('.gbz') && gbwtFile.endsWith('.gbz')) {
          throw new BadRequestError('Cannot use gbz as haplotype alone.')
        } else {
          // ignoring haplotype from graph file and using haplotype from gbwt file
          vgChunkParams.push('--no-embedded-haplotypes', '-x', graphFile)

          // double-check that the file is a .gbwt and allowed
          if (!endsWithExtensions(gbwtFile, HAPLOTYPE_EXTENSIONS_VG)) {
            throw new BadRequestError(
              "GBWT file doesn't end in .gbwt or .gbz: " + gbwtFile,
            )
          }
          if (!isAllowedPath(gbwtFile)) {
            throw new BadRequestError('GBWT file path not allowed: ' + gbwtFile)
          }
          // Use a GBWT haplotype database
          vgChunkParams.push('--gbwt-name', gbwtFile)
        }
      } else {
        // push graph file
        if (graphFile.endsWith('.gbz')) {
          vgChunkParams.push('-x', graphFile, '--no-embedded-haplotypes')
        } else {
          vgChunkParams.push('-x', graphFile)
        }
      }

      // push all gam files
      let anyGam = false
      let anyGaf = false
      for (const gamFile of gamFiles) {
        if (
          !gamFile.endsWith('.gam') &&
          !gamFile.endsWith('.gaf') &&
          !gamFile.endsWith('.gaf.gz')
        ) {
          throw new BadRequestError(
            "GAM/GAF file doesn't end in .gam, .gaf, or .gaf.gz: " + gamFile,
          )
        }
        if (!isAllowedPath(gamFile)) {
          throw new BadRequestError('GAM/GAF file path not allowed: ' + gamFile)
        }
        if (gamFile.endsWith('.gam')) {
          // Use a GAM
          console.log('pushing gam file', gamFile)
          anyGam = true
        }
        if (gamFile.endsWith('.gaf')) {
          // Use a small GAF without an index
          console.log('pushing gaf file', gamFile)
          anyGaf = true
        }
        if (gamFile.endsWith('.gaf.gz')) {
          // Use a GAF with index
          console.log('pushing hopefully indexed gaf file', gamFile)
          anyGaf = true
        }
        vgChunkParams.push('-a', gamFile)
      }
      if (anyGam && anyGaf) {
        throw new BadRequestError(
          'Reads must be either GAM files or GAF files, not mix both.',
        )
      }
      if (anyGaf) {
        vgChunkParams.push('-F', '-g')
      }
      if (anyGam) {
        vgChunkParams.push('-g')
      }

      // to search by node ID use "node" for the sequence name, e.g. 'node:1-10'
      if (parsedRegion.contig === 'node') {
        if (parsedRegion.distance !== undefined) {
          // Start and distance of node IDs, so send that idiomatically.
          vgChunkParams.push(
            '-r',
            parsedRegion.start,
            '-c',
            parsedRegion.distance,
          )
        } else {
          // Start and end of node IDs
          vgChunkParams.push(
            '-r',
            ''.concat(parsedRegion.start, ':', parsedRegion.end),
            '-c',
            20,
          )
        }
      } else {
        // Ask for the whole region by start - end range.
        vgChunkParams.push('-c', '20', '-p', stringifyRangeRegion(rangeRegion))
      }
      vgChunkParams.push(
        '-T',
        '-b',
        `${req.chunkDir}/chunk`,
        '-E',
        `${req.chunkDir}/regions.tsv`,
      )

      console.log(`vg ${vgChunkParams.join(' ')}`)

      console.time(`vg chunk-${reqId}`)
      const vgChunkCall = spawn(find_vg(), vgChunkParams, {
        signal: req.clientGone,
      })
      // vg simplify for gam files
      let vgSimplifyCall = null
      if (req.simplify) {
        vgSimplifyCall = spawn(find_vg(), ['simplify', '-'], {
          signal: req.clientGone,
        })
        console.log('Spawning vg simplify call')
      }

      const vgViewCall = spawn(find_vg(), ['view', '-j', '-'], {
        signal: req.clientGone,
      })
      let graphAsString = ''
      req.error = Buffer.alloc(0)

      vgChunkCall.on('error', function (err) {
        console.log(
          'Error executing ' +
            find_vg() +
            ' ' +
            vgChunkParams.join(' ') +
            ': ' +
            err,
        )
        if (!sentResponse) {
          sentResponse = true
          return next(new VgExecutionError('vg chunk failed'))
        }
        return
      })

      vgChunkCall.stderr.on('data', data => {
        console.log(`vg chunk err data: ${data}`)
        req.error += data
      })

      pipeChildren(vgChunkCall, req.simplify ? vgSimplifyCall : vgViewCall)

      vgChunkCall.on('close', code => {
        console.log(`vg chunk exited with code ${code}`)
        if (code !== 0) {
          console.log('Error from ' + find_vg() + ' ' + vgChunkParams.join(' '))
          // Execution failed, so tear down the rest of the pipeline rather
          // than letting it grind on a truncated graph.
          if (req.simplify) {
            vgSimplifyCall.kill()
          }
          vgViewCall.kill()
          if (!sentResponse) {
            sentResponse = true
            next(new VgExecutionError('vg chunk failed'))
          }
        }
      })

      // vg simplify
      if (req.simplify) {
        vgSimplifyCall.on('error', function (err) {
          console.log(
            'Error executing ' + find_vg() + ' simplify ' + '- ' + ': ' + err,
          )
          if (!sentResponse) {
            sentResponse = true
            return next(new VgExecutionError('vg simplify failed'))
          }
          return
        })

        vgSimplifyCall.stderr.on('data', data => {
          console.log(`vg simplify err data: ${data}`)
          req.error += data
        })

        pipeChildren(vgSimplifyCall, vgViewCall)

        vgSimplifyCall.on('close', code => {
          console.log(`vg simplify exited with code ${code}`)
          if (code !== 0) {
            console.log('Error from ' + find_vg() + ' ' + 'simplify - ')
            // Execution failed
            if (!sentResponse) {
              sentResponse = true
              return next(new VgExecutionError('vg simplify failed'))
            }
          }
        })
      }

      // vg view
      vgViewCall.on('error', function (err) {
        console.log('Error executing "vg view": ' + err)
        if (!sentResponse) {
          sentResponse = true
          return next(new VgExecutionError('vg view failed'))
        }
        return
      })

      vgViewCall.stderr.on('data', data => {
        console.log(`vg view err data: ${data}`)
      })

      vgViewCall.stdout.on('data', function (data) {
        graphAsString += data.toString()
      })

      vgViewCall.on('close', code => {
        console.log(`vg view exited with code ${code}`)
        console.timeEnd(`vg chunk-${reqId}`)
        if (code !== 0) {
          // Execution failed
          if (!sentResponse) {
            sentResponse = true
            return next(new VgExecutionError('vg view failed'))
          }
          return
        }
        if (graphAsString === '') {
          if (!sentResponse) {
            sentResponse = true
            return next(new VgExecutionError('vg view produced empty graph'))
          }
          return
        }
        if (!sentResponse) {
          sentResponse = true
          try {
            finishGraphAndProcess(
              req,
              res,
              next,
              graphAsString,
              rangeRegion,
              parsedRegion,
            )
          } catch (error) {
            next(error)
          }
        }
      })
    }
  } else {
    // chunk has already been pre-fetched and is saved in chunkPath
    req.chunkDir = chunkPath
    // We're using a shared directory for this request, so leave it in place
    // when the request finishes.
    req.rmChunk = false
    const filename = `${req.chunkDir}/chunk.vg`
    // vg simplify for bed files
    let vgSimplifyCall = null
    const vgViewArguments = ['view', '-j']
    if (req.simplify) {
      vgSimplifyCall = spawn(find_vg(), ['simplify', filename], {
        signal: req.clientGone,
      })
      vgViewArguments.push('-')
      console.log('Spawning vg simplify call')
    } else {
      vgViewArguments.push(filename)
    }

    const vgViewCall = spawn(find_vg(), vgViewArguments, {
      signal: req.clientGone,
    })

    let graphAsString = ''
    req.error = Buffer.alloc(0)

    // vg simplify
    if (req.simplify) {
      vgSimplifyCall.on('error', function (err) {
        console.log(
          'Error executing ' +
            find_vg() +
            ' ' +
            'simplify ' +
            filename +
            ': ' +
            err,
        )
        if (!sentResponse) {
          sentResponse = true
          return next(new VgExecutionError('vg simplify failed'))
        }
        return
      })

      vgSimplifyCall.stderr.on('data', data => {
        console.log(`vg simplify err data: ${data}`)
        req.error += data
      })

      pipeChildren(vgSimplifyCall, vgViewCall)

      vgSimplifyCall.on('close', code => {
        console.log(`vg simplify exited with code ${code}`)
        if (code !== 0) {
          console.log('Error from ' + find_vg() + ' simplify ' + filename)
          // Execution failed
          if (!sentResponse) {
            sentResponse = true
            return next(new VgExecutionError('vg simplify failed'))
          }
        }
      })
    }

    vgViewCall.on('error', function (err) {
      console.log('Error executing "vg view": ' + err)
      if (!sentResponse) {
        sentResponse = true
        return next(new VgExecutionError('vg view failed'))
      }
      return
    })

    vgViewCall.stderr.on('data', data => {
      console.log(`vg view err data: ${data}`)
    })

    vgViewCall.stdout.on('data', function (data) {
      graphAsString += data.toString()
    })

    vgViewCall.on('close', code => {
      console.log(`vg view exited with code ${code}`)
      if (code !== 0) {
        // Execution failed
        if (!sentResponse) {
          sentResponse = true
          return next(new VgExecutionError('vg view failed'))
        }
        return
      }
      if (graphAsString === '') {
        if (!sentResponse) {
          sentResponse = true
          return next(
            new VgExecutionError('vg view produced empty graph failed'),
          )
        }
        return
      }
      if (!sentResponse) {
        sentResponse = true
        try {
          finishGraphAndProcess(
            req,
            res,
            next,
            graphAsString,
            rangeRegion,
            parsedRegion,
          )
        } catch (error) {
          next(error)
        }
      }
    })
  }
}

// Turn the JSON graph text `vg view` gave us into req.graph, work out the
// region we are showing, and hand off to the annotation-file step. Throws on
// unparseable output.
function finishGraphAndProcess(
  req,
  res,
  next,
  graphAsString,
  rangeRegion,
  parsedRegion,
) {
  req.graph = parseSubprocessJSON(graphAsString, 'vg view')
  if (req.removeSequences) {
    removeNodeSequencesInPlace(req.graph)
  }
  if (rangeRegion.contig === 'node') {
    req.region = [null, null]
  } else {
    // If the query came in on a path with a subrange defined already,
    // translate it into base path coordinates.
    const subrangeStart = getSubrangeStart(rangeRegion.contig)
    req.region = [
      rangeRegion.start + subrangeStart,
      rangeRegion.end + subrangeStart,
    ]
  }

  // We might not have the path we are referencing on appearing first. A graph
  // with no paths at all comes back from vg view without a path field.
  req.graph.path = organizePathsTargetFirst(parsedRegion, req.graph.path)

  void processAnnotationFile(req, res, next)
}

const SUBRANGE_REGEX = /\[([0-9]+)(-([0-9]+))?\]$/

/// Given a path name, get the start position of its subrange as a number, or 0.
function getSubrangeStart(pathName) {
  const match = pathName.match(SUBRANGE_REGEX)
  if (!match) {
    return 0
  }
  return Number(match[1])
}

/// Given an array of paths, organize them so that the paths(s) corresponding
/// to the requested region are first, and return a re-ordered array of paths.
function organizePathsTargetFirst(region, pathList = []) {
  if (region.contig !== 'node') {
    // We pull the subrange off the path names when comparing them
    const targetBasePath = region.contig.replace(SUBRANGE_REGEX, '')

    // Make sure that path 0 is the path we actually asked about
    const refPaths = []
    const otherPaths = []
    for (const path of pathList) {
      const pathBasePath = path.name.replace(SUBRANGE_REGEX, '')
      if (pathBasePath === targetBasePath) {
        // This is the path we asked about, so it goes first
        refPaths.push(path)
      } else {
        // Then we put each other path
        otherPaths.push(path)
      }
    }
    return refPaths.concat(otherPaths)
  } else {
    // No target path
    return pathList
  }
}

// We can use this middleware to ensure that errors we synchronously throw or
// next(err) will be sent along to the user. It does *not* happen on API
// endpoint promise rejections until Express 5.
function returnErrorMiddleware(err, req, res, next) {
  // Clean up the temp directory for the request, if any
  cleanUpChunkIfOwned(req, res)

  // Because we take err, Express makes sure err is always set.
  if (res.headersSent) {
    // We can't send a nice message. Try the next middleware, if any.
    return next(err)
  }
  // We have an error we want to send back to the user.
  const result = { error: '' }
  if (!(err instanceof TubeMapError)) {
    // Unexpected error: we do not have a custom message for this error
    result.error += 'Something about this request has caused a server error: '
  }
  if (err.message) {
    // We have an error message to pass along.
    result.error += err.message
  }
  if (req.error) {
    // We have an error data buffer from a vg call
    if (result.error) {
      // Separate from existing message
      result.error += ':\n'
    }
    result.error += req.error.toString('utf-8')
  }
  console.log('returning error: ' + result.error)
  console.error(err)
  if (err.status) {
    // Error comes with a status
    res.status(err.status)
  } else {
    // We don't know what's wrong, so it's our fault.
    res.status(500)
  }
  res.json(result)
}

// Hook up the error handling middleware.
app.use(returnErrorMiddleware)

// Given a BED file local path or URL, and a relative URL from the BED file for
// a chunk data directory, get the local path at which the chunk data directory
// will be stored. That local path may not exist, and, if the BED is a URL, is
// guaranteed to be inside DOWNLOAD_DATA_PATH.
//
// The returned path is guaranteed to be an allowed path, under one of our
// allowed directories.
//
// The returned path is guaranteed not to have a trailing slash.
//
// This is the One True Place for getting a BED file chunk path.
function bedChunkLocalPath(bed, chunk) {
  if (isValidURL(bed)) {
    // Hash the BED URL and the chunk path together to a unique value
    // guaranteed not to contain slashes or '.'.
    const hashedBED = hashString(bed + chunk)
    // Use that as a directory under the download path. We know this is under
    // the download path and does not end in slash.
    return path.resolve(DOWNLOAD_DATA_PATH, hashedBED)
  } else {
    // This is a local BED file. Evaluate the path in the BED file relative to it.
    let destination = path.resolve(path.dirname(bed), chunk)

    if (destination.endsWith('/')) {
      // Drop any trailing slashes
      destination = destination.substring(0, destination.length - 1)
    }

    // That can go up by e.g. starting with / or involving .., so make sure we
    // are still pointing somewhere allowed.
    if (!isAllowedPath(destination)) {
      throw new BadRequestError('Path to chunk not allowed: ' + destination)
    }

    return destination
  }
}

// Gets the chunk name from a region specified in a bedfile
// Returns an empty string if the region is not found within the bed file
async function getChunkName(bed, parsedRegion) {
  let chunk = ''
  const regionInfo = await getBedRegions(bed)

  for (let i = 0; i < regionInfo['desc'].length; i++) {
    const entryRegion = {
      contig: regionInfo['chr'][i],
      start: regionInfo['start'][i],
      end: regionInfo['end'][i],
    }
    if (stringifyRegion(entryRegion) === stringifyRegion(parsedRegion)) {
      // A BED entry is defined for this region exactly
      if (regionInfo['chunk'][i] !== '') {
        // And a chunk file is stored for it, so use that.
        chunk = regionInfo['chunk'][i]
        break
      }
    }
  }

  return chunk
}

// Get the allowed local path of a BED file's chunk, downloading the chunk
// first if the BED is a URL.
async function getChunkPath(bed, chunk) {
  const chunkPath = bedChunkLocalPath(bed, chunk)

  if (isValidURL(bed)) {
    // download the rest of the chunk
    await retrieveChunk(bed, chunk, true)
  }

  console.log('returning chunk path: ', chunkPath)

  // check that the 'chunk.vg' file exists in the chunk folder
  const chunk_file = path.resolve(chunkPath, 'chunk.vg')
  // We already checked allowed-ness in making the chunk path.
  if (fs.existsSync(chunk_file)) {
    console.log(`found pre-fetched chunk at ${chunk_file}`)
  } else {
    // The chunk doesn't exist, but was supposed to.
    throw new BadRequestError(
      `Couldn't find pre-fetched chunk at ${chunk_file}`,
    )
  }

  return chunkPath
}

async function readLines(file) {
  const text = await fs.promises.readFile(file, 'utf-8')
  return text.split(/\r?\n/).filter(line => line !== '')
}

async function processAnnotationFile(req, res, next) {
  try {
    console.time(`processing annotation file-${req.reqId}`)
    for (const file of await fs.promises.readdir(req.chunkDir)) {
      if (file.endsWith('annotate.txt')) {
        req.annotationFile = req.chunkDir + '/' + file
      }
    }
    if (req.annotationFile === undefined) {
      throw new VgExecutionError('annotation file not created')
    }
    console.log(`annotationFile: ${req.annotationFile}`)

    // A graph with no paths comes back from vg view / chunkix without a path
    // field at all, and everything downstream wants to iterate it.
    req.graph.path ??= []

    const lines = await readLines(req.annotationFile)
    lines.forEach((line, i) => {
      const [name, freq] = line.split('\t')
      const graphPath = req.graph.path[i]
      if (graphPath === undefined) {
        console.log('Annotation file has more lines than the graph has paths')
      } else if (graphPath.name === name) {
        graphPath.freq = freq
      } else {
        console.log('Mismatch')
      }
    })
    console.timeEnd(`processing annotation file-${req.reqId}`)
  } catch (error) {
    next(error)
    return
  }
  if (req.withGam === true) {
    void processGamFiles(req, res, next)
  } else {
    void processRegionFile(req, res, next)
  }
}

// The reads in one chunk file (a GAM, a GAF, or chunkix's annot.json), as
// JSON objects.
async function readGamFile(req, gamFile) {
  if (!isAllowedPath(gamFile)) {
    throw new BadRequestError('Path to GAM/GAF file not allowed: ' + gamFile)
  }

  let gamJSON
  if (gamFile.endsWith('.json')) {
    gamJSON = await fs.promises.readFile(gamFile, 'utf-8')
  } else if (gamFile.endsWith('.gaf')) {
    const graphFile = getFirstFileOfType(req.body.tracks, fileTypes.GRAPH)
    assertGraphFile(graphFile)
    gamJSON = await runPipeline(req, [
      vgStage(['convert', '-F', gamFile, graphFile]),
      vgStage(['view', '-j', '-a', '-'], { reportStderr: false }),
    ])
  } else {
    gamJSON = await runPipeline(req, [
      vgStage(['view', '-j', '-a', gamFile], { reportStderr: false }),
    ])
  }
  return gamJSON
    .split('\n')
    .filter(line => line !== '')
    .map(line => parseSubprocessJSON(line, gamFile))
}

async function processGamFiles(req, res, next) {
  try {
    console.time(`processing gam files-${req.reqId}`)
    const graphFile = getFirstFileOfType(req.body.tracks, fileTypes.GRAPH)
    // Find gam/gaf files
    const gamFiles = []
    if (graphFile.endsWith('.pos.bed.gz')) {
      // use tabix-based pangenome (experimental)
      // look for json files
      fs.readdirSync(req.chunkDir).forEach(file => {
        console.log(file)
        if (file.endsWith('annot.json')) {
          gamFiles.push(req.chunkDir + '/' + file)
        }
      })
    } else {
      // look for typical GAM or GAF files
      fs.readdirSync(req.chunkDir).forEach(file => {
        console.log(file)
        if (file.endsWith('.gam') || file.endsWith('.gaf')) {
          gamFiles.push(req.chunkDir + '/' + file)
        }
      })
    }

    // Parse a GAM chunk name and get the GAM number from it
    // Names are like, with either .gam or .gaf suffixes:
    // */chunk_*.gam for 0
    // */chunk-1_*.gam for 1, 2, 3, etc.
    const gamNameToNumber = gamName => {
      if (gamName.endsWith('.json')) {
        const pattern = /.*\/chunk.([0-9]+).annot.json/
        const matches = gamName.match(pattern)
        if (!matches) {
          throw new InternalServerError('Bad GAF/JSON name ' + gamName)
        }
        return parseInt(matches[1])
      } else {
        const pattern = /.*\/chunk(-([0-9]+))?_.*\.ga[mf]/
        const matches = gamName.match(pattern)
        if (!matches) {
          throw new InternalServerError('Bad GAM/GAF name ' + gamName)
        }
        if (matches[2] !== undefined) {
          // We have a number
          return parseInt(matches[2])
        }
      }
      // If there's no number we are chunk 0
      return 0
    }

    // Sort all the GAM files we found in order of their chunk number,
    // ascending. This will also be the order of the GAM files passed to chunk,
    // and so the order we got the tracks in, and thus the order we want the
    // results in.
    gamFiles.sort((a, b) => {
      return gamNameToNumber(a) - gamNameToNumber(b)
    })

    req.gamResults = await Promise.all(
      gamFiles.map(gamFile => readGamFile(req, gamFile)),
    )
    console.timeEnd(`processing gam files-${req.reqId}`)
  } catch (error) {
    next(error)
    return
  }
  void processRegionFile(req, res, next)
}

// Read the "region" file, a BED inside the chunk that records the path and
// start offset that defined the chunk, and mark the targeted path with it.
async function processRegionFile(req, res, next) {
  try {
    console.time(`processing region file-${req.reqId}`)
    let regionFile = `${req.chunkDir}/regions.tsv`
    if (!fs.existsSync(regionFile)) {
      for (const file of await fs.promises.readdir(req.chunkDir)) {
        if (file.endsWith('regions.tsv')) {
          regionFile = req.chunkDir + '/' + file
        }
      }
    }
    if (!isAllowedPath(regionFile)) {
      throw new BadRequestError(
        'Path to region file not allowed: ' + regionFile,
      )
    }

    for (const line of await readLines(regionFile)) {
      console.log('Region: ' + line)
      const [name, start, end] = line.split(/\s+/)
      const subpathName = `${name}[${start}-${end}]`

      for (const p of req.graph.path) {
        if (p.name === subpathName) {
          // Drop the subrange and record where it starts, so the frontend
          // draws the ruler on the base path.
          console.log(
            `Rename ${subpathName} to ${name} and mark start as ${start}`,
          )
          p.name = name
          p.indexOfFirstBase = start
        } else if (p.name === name) {
          // A pre-extracted region that predates subpath support (like the
          // Lancet paper data) only records its start here.
          p.indexOfFirstBase = start
        }
      }
    }
    console.timeEnd(`processing region file-${req.reqId}`)
  } catch (error) {
    next(error)
    return
  }
  void processNodeColorsFile(req, res, next)
}

async function processNodeColorsFile(req, res, next) {
  try {
    console.time(`processing node colors file-${req.reqId}`)
    const nodeColorsFile = `${req.chunkDir}/nodeColors.tsv`
    if (!isAllowedPath(nodeColorsFile)) {
      throw new BadRequestError(
        'Path to node colors file not allowed: ' + nodeColorsFile,
      )
    }
    req.coloredNodes = fs.existsSync(nodeColorsFile)
      ? await readLines(nodeColorsFile)
      : []
    console.timeEnd(`processing node colors file-${req.reqId}`)
  } catch (error) {
    next(error)
    return
  }
  cleanUpAndSendResult(req, res, next)
}

// Cleanup function shared between success and error code paths.
// May throw.
// TODO: Use as a middleware?
function cleanUpChunkIfOwned(req, _res) {
  if (req.rmChunk && req.chunkDir !== undefined) {
    // Don't clean up individual files in the directory manually; it's too
    // fiddly, and we could have gotten here because we generated those paths
    // and they were outside our acceptable directory tree.

    // Clean up the temp directory for the request recursively. Nothing waits
    // on this, so a failure has to be logged rather than thrown into an
    // unhandled rejection.
    fs.promises
      .rm(req.chunkDir, { recursive: true, force: true })
      .catch(err => {
        console.error('Could not remove chunk directory ' + req.chunkDir, err)
      })
  }
}

function cleanUpAndSendResult(req, res, next) {
  try {
    cleanUpChunkIfOwned(req, res)

    const result = {}
    // TODO: Any standard error output will make an error response.
    result.error = req.error.toString('utf-8')
    result.graph = req.graph
    result.gam = req.withGam === true ? req.gamResults : []
    result.region = req.region
    result.coloredNodes = req.coloredNodes
    result.nameMap = req.nameMap
    res.json(result)
    console.timeEnd(`request-duration-${req.reqId}`)
  } catch (error) {
    return next(error)
  }
}

// Return true if the given path points to one of the ALLOWED_DATA_DIRECTORIES,
// or to something inside one of them, and false otherwise.
// Additionally, disallows upwards directory traversal and doubled delimiters.
function isAllowedPath(inputPath) {
  // Note that thing.param..xg is a perfectly good filename and contains ..; we
  // need to check for it as a path component.
  if (
    inputPath.includes('//') ||
    inputPath.includes('\\\\') ||
    inputPath.includes('/\\') ||
    inputPath.includes('\\/')
  ) {
    // Prohibit double delimiters (probably mostly from internal errors)
    return false
  }
  // Split on delimiters
  const parts = inputPath.split(/[/\\]/)
  for (const part of parts) {
    if (part === '..') {
      // One of the path components is a .., so disallow it.
      return false
    }
  }

  // Now that we know the path doesn't go up, we can safely resolve it to an
  // absolute path.
  const resolvedPath = path.resolve(inputPath)

  for (const allowed of ALLOWED_DATA_DIRECTORIES) {
    // Go through all the allowed directories

    const relative = path.relative(allowed, resolvedPath)
    if (
      relative !== '..' &&
      !relative.startsWith('..' + path.sep) &&
      !path.isAbsolute(relative)
    ) {
      // This path is inside this allowed directory
      return true
    }
  }
  // Otherwise the path wasn't in any of the allowed directories
  return false
}

// Make sure that, at server startup, all the important directories are
// allowed. We don't want the config file to list one of these as having .. or
// something in it and break on every user request.
assert(
  isAllowedPath(MOUNTED_DATA_PATH),
  'Configured dataPath is not acceptable; does it contain .. or //?',
)
assert(
  isAllowedPath(INTERNAL_DATA_PATH),
  'Configured internalDataPath is not acceptable; does it contain .. or //?',
)
assert(
  isAllowedPath(UPLOAD_DATA_PATH),
  'Upload data path is not acceptable; does it contain .. or //?',
)
assert(
  isAllowedPath(SCRATCH_DATA_PATH),
  'Scratch path is not acceptable; does it contain .. or //?',
)

/**
 * Convert an absolute path to a path relative to the current directory, if it
 * would be an allowed path (i.e. not include ..). If not, pass threough the
 * original path.
 *
 * This is the path we should send to the client, to keep the server's base
 * directory out of the path unless it is needed.
 */
function toClientPath(absPath) {
  const relPath = path.relative('.', absPath)
  if (isAllowedPath(relPath)) {
    return relPath
  } else {
    return absPath
  }
}

/**
 * Run the given callback with the path to each file under the given directory,
 * recursively.
 *
 * Hides directories that look like pre-extracted chunk directories.
 */
function forEachFileUnder(directory, callback) {
  // Make a list of all the files in the directory
  const children = new Set()
  fs.readdirSync(directory).forEach(basename => {
    children.add(basename)
  })

  if (
    directory !== MOUNTED_DATA_PATH &&
    ((children.has('regions.tsv') && children.has('chunk.vg')) ||
      children.has('chunk_contents.txt'))
  ) {
    // This smells like a pre-extracted chunk directory, so skip it.
    return
  }

  for (const basename of children) {
    // Go through all the files in the directory
    const absPath = path.resolve(directory, basename)
    const stat = fs.statSync(absPath, { throwIfNoEntry: false })
    if (stat) {
      // It actually exists
      if (stat.isDirectory()) {
        // Recurse
        forEachFileUnder(absPath, callback)
      } else if (stat.isFile()) {
        // Show the file
        callback(absPath)
      } else {
        console.log('Found file of unknown type:', absPath)
      }
    } else {
      console.log('File vanished:', absPath)
    }
  }
}

// Walk the immediate subdirectories of `rootDir` and collect any
// `manifest.json` they contain. Relative trackFile/bedFile paths in a manifest
// are resolved to client-relative paths under the manifest's folder.
function readFolderManifests(rootDir) {
  const manifests = {}
  let entries
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true })
  } catch {
    return manifests
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const folderAbs = path.resolve(rootDir, entry.name)
    const manifestPath = path.join(folderAbs, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch (e) {
      console.warn(`Skipping bad manifest.json at ${manifestPath}:`, e.message)
      continue
    }
    const folderRel = toClientPath(folderAbs)
    if (Array.isArray(manifest.tracks)) {
      manifest.tracks = manifest.tracks.map(t => {
        if (typeof t?.trackFile === 'string' && !t.trackFile.includes('/')) {
          return { ...t, trackFile: `${folderRel}/${t.trackFile}` }
        }
        return t
      })
    }
    if (
      typeof manifest.bedFile === 'string' &&
      !manifest.bedFile.includes('/')
    ) {
      manifest.bedFile = `${folderRel}/${manifest.bedFile}`
    }
    manifests[folderRel] = manifest
  }
  return manifests
}

api.get('/getFilenames', (req, res) => {
  console.log('received request for filenames')
  const result = {
    files: [], // store a list of file object, excluding bed files, {  name: string; type: filetype;}
    bedFiles: [],
    folderManifests: {},
  }

  if (isAllowedPath(MOUNTED_DATA_PATH)) {
    // list files in folder
    forEachFileUnder(MOUNTED_DATA_PATH, file => {
      const clientPath = toClientPath(file)
      if (endsWithExtensions(file, GRAPH_EXTENSIONS)) {
        result.files.push({ trackFile: clientPath, trackType: 'graph' })
      }
      if (endsWithExtensions(file, HAPLOTYPE_EXTENSIONS)) {
        result.files.push({ trackFile: clientPath, trackType: 'haplotype' })
      }
      if (file.endsWith('.sorted.gam')) {
        result.files.push({ trackFile: clientPath, trackType: 'read' })
      }
      // We don't allow un-sorted-and-indexed plain GAF files here
      if (file.endsWith('.gaf.gz')) {
        result.files.push({ trackFile: clientPath, trackType: 'read' })
      }
      if (file.endsWith('.nodes.tsv.gz')) {
        result.files.push({ trackFile: clientPath, trackType: 'node' })
      }
      if (file.endsWith('.bed')) {
        result.bedFiles.push(clientPath)
      }
    })
    result.folderManifests = readFolderManifests(MOUNTED_DATA_PATH)
  } else {
    // Somehow MOUNTED_DATA_PATH isn't one of our ALLOWED_DATA_DIRECTORIES (anymore?).
    // Perhaps the server administrator has put a .. in it.
    throw new InternalServerError(
      'MOUNTED_DATA_PATH not allowed. Server is misconfigured.',
    )
  }

  console.log(result)
  res.json(result)
})

// Spawn a vg process and collect stdout lines. Resolves when the process exits
// successfully, rejects (VgExecutionError) on non-zero exit.
function runProcessLines(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stderr = ''
    child.stderr.on('data', d => {
      const s = d.toString()
      stderr += s
      console.log(`${cmd} ${args[0]} stderr: ${s}`)
    })
    const reader = rl.createInterface({ input: child.stdout })
    reader.on('line', onLine)
    let code = null
    let readerDone = false
    const finish = () => {
      if (code === null || !readerDone) return
      if (code !== 0) {
        const detail = stderr.trim() ? `: ${stderr.trim()}` : ''
        reject(new VgExecutionError(`${cmd} ${args.join(' ')} failed${detail}`))
      } else {
        resolve()
      }
    }
    child.on('error', reject)
    child.on('close', c => {
      code = c
      finish()
    })
    reader.on('close', () => {
      readerDone = true
      finish()
    })
  })
}

function runVgLines(args, onLine) {
  return runProcessLines(find_vg(), args, onLine)
}

api.post('/getPathInfo', async (req, res, next) => {
  console.log('received request for pathInfo')
  const graphFile = req.body.graphFile

  if (!isAllowedPath(graphFile)) {
    throw new BadRequestError(
      'Path to Graph file not allowed: ' + req.body.graphFile,
    )
  }
  if (!endsWithExtensions(graphFile, GRAPH_EXTENSIONS)) {
    throw new BadRequestError(
      'Path to Graph file does not end in valid extension: ' +
        req.body.graphFile,
    )
  }

  try {
    if (graphFile.endsWith('.pos.bed.gz')) {
      // pgtabix mode: names only, lengths/cyclicity not available
      const names = []
      await runProcessLines('tabix', ['-l', graphFile], line => {
        names.push(line)
      })
      const pathInfo = names
        .filter(a => a !== '' && !a.startsWith('_'))
        .sort()
        .map(name => ({ name, length: null, cyclic: false }))
      res.json({ pathInfo })
      return
    }

    const lengthLines = []
    const cyclicNames = new Set()
    await Promise.all([
      runVgLines(['paths', '-E', '-x', graphFile], line => {
        lengthLines.push(line)
      }),
      // vg paths -C outputs: name\tdirected-(a)cyclic\tundirected-(a)cyclic
      runVgLines(['paths', '-C', '-x', graphFile], line => {
        if (line && !line.startsWith('_')) {
          const [name, directed, undirected] = line.split('\t')
          if (
            directed === 'directed-cyclic' ||
            undirected === 'undirected-cyclic'
          ) {
            cyclicNames.add(name)
          }
        }
      }),
    ])
    const pathInfo = lengthLines
      .filter(line => line !== '' && !line.startsWith('_'))
      .map(line => {
        const [name, lengthStr] = line.split('\t')
        return {
          name,
          length: Number(lengthStr),
          cyclic: cyclicNames.has(name),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    res.json({ pathInfo })
  } catch (err) {
    next(err)
  }
})

// Given a string, return a filename-safe string that is a hash of that string.
// The hash is collision-resistant.
function hashString(str) {
  // We should have access to crypto.subtle, but that's asynchronous and that's
  // probably not worth it for a URL's worth of data. So use Node's crypto
  // library.
  // See <https://stackoverflow.com/a/75872519>
  return createHash('sha256').update(str).digest('hex')
}

// Address ranges a public server has no business fetching from: loopback,
// link-local, unique-local, carrier NAT, the RFC1918 ranges and multicast.
// BlockList matches IPv4-mapped IPv6 (::ffff:a.b.c.d) against the IPv4 rules
// by itself; the NAT64 and IPv4-compatible forms need rules of their own.
const PRIVATE_IPV4_SUBNETS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 3],
]
const PRIVATE_IPV6_SUBNETS = [
  ['::', 96],
  ['fe80::', 10],
  ['fc00::', 7],
  ['ff00::', 8],
]
const PRIVATE_ADDRESSES = new net.BlockList()
for (const [prefix, bits] of PRIVATE_IPV4_SUBNETS) {
  PRIVATE_ADDRESSES.addSubnet(prefix, bits, 'ipv4')
  PRIVATE_ADDRESSES.addSubnet(`64:ff9b::${prefix}`, 96 + bits, 'ipv6')
}
for (const [prefix, bits] of PRIVATE_IPV6_SUBNETS) {
  PRIVATE_ADDRESSES.addSubnet(prefix, bits, 'ipv6')
}

function addressType(address) {
  return net.isIPv6(address) ? 'ipv6' : 'ipv4'
}

// The operator's exceptions: addresses or CIDR ranges in
// config.allowedPrivateFetchAddresses.
function allowedPrivateAddresses() {
  const allowed = new net.BlockList()
  for (const entry of config.allowedPrivateFetchAddresses ?? []) {
    const [address, bits] = entry.split('/')
    if (bits === undefined) {
      allowed.addAddress(address, addressType(address))
    } else {
      allowed.addSubnet(address, Number(bits), addressType(address))
    }
  }
  return allowed
}

function isForbiddenAddress(address) {
  const type = addressType(address)
  return (
    PRIVATE_ADDRESSES.check(address, type) &&
    !allowedPrivateAddresses().check(address, type)
  )
}

// dns.lookup that fails on a forbidden address. Sockets call it as they
// connect, so the check applies to the address actually used, wherever a
// redirect or a changed DNS answer points.
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) {
      callback(err)
      return
    }
    const entries = options.all ? address : [{ address }]
    const forbidden = entries.find(entry => isForbiddenAddress(entry.address))
    if (forbidden) {
      callback(
        new BadRequestError(
          `Refusing to connect to ${hostname}: it resolves to the non-public address ${forbidden.address}`,
        ),
      )
    } else {
      callback(null, address, family)
    }
  })
}

const PUBLIC_AGENTS = {
  'http:': new http.Agent({ lookup: publicLookup }),
  'https:': new https.Agent({ lookup: publicLookup }),
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 5

// GET one URL without following redirects. Sockets skip the lookup for an IP
// literal, so check those here.
async function getPublic(url, headers, signal) {
  const parsed = new URL(url)
  const agent = PUBLIC_AGENTS[parsed.protocol]
  if (agent === undefined) {
    throw new BadRequestError('Only http and https URLs can be fetched: ' + url)
  }
  const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1')
  if (net.isIP(host) && isForbiddenAddress(host)) {
    throw new BadRequestError(
      `Refusing to fetch ${url}: ${host} is not a public address`,
    )
  }
  const client = parsed.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    client.get(parsed, { agent, headers, signal }, resolve).on('error', reject)
  })
}

// Given a URL and a filename, download the given URL to that filename. Assumes required directories exist.
const downloadFile = async (fileURL, destination) => {
  if (!isAllowedPath(destination)) {
    throw new BadRequestError(
      'Download destination path not allowed: ' + destination,
    )
  }

  const written = await fetchToFile(
    fileURL,
    config.maxFileSizeBytes,
    destination,
  )
  if (!written) {
    // file has already been downloaded and has not been updated since last fetch
    console.log('File has already been downloaded at ', destination)
  }
}

// Start a size- and host-checked GET, following redirects. Returns the
// response along with the timer that will abort it, which the caller must
// clear once it is done with the body. `existingLocation`, when it names a
// file already on disk, makes the request conditional so an unchanged file
// isn't re-downloaded.
async function beginValidatedFetch(url, maxBytes, existingLocation) {
  const headers = {}
  if (existingLocation !== undefined && fs.existsSync(existingLocation)) {
    headers['If-None-Match'] = ETagMap.get(url) ?? '-1'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, config.fetchTimeout * 1000)

  console.log('Fetching URL:', url)
  try {
    let location = url
    let response = await getPublic(location, headers, controller.signal)
    for (
      let redirects = 0;
      REDIRECT_STATUSES.has(response.statusCode) &&
      response.headers.location !== undefined;
      redirects++
    ) {
      response.resume()
      if (redirects === MAX_REDIRECTS) {
        throw new BadRequestError(
          `Fetch request for ${url} failed: more than ${MAX_REDIRECTS} redirects`,
        )
      }
      location = new URL(response.headers.location, location).toString()
      response = await getPublic(location, headers, controller.signal)
    }

    if (response.statusCode === 304) {
      console.log('file not modified since last fetch')
      response.resume()
      return { notModified: true, response, timer }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.resume()
      throw new BadRequestError(
        `Fetch request for ${url} failed: ` + response.statusCode,
      )
    }

    const contentLength = response.headers['content-length']
    if (contentLength !== undefined && Number(contentLength) > maxBytes) {
      response.destroy()
      throw new BadRequestError(
        `Fetch request for ${url} failed: Content-Length exceeds maximum file size of ${maxBytes} bytes`,
      )
    }

    return { notModified: false, response, timer }
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof TubeMapError) {
      throw e
    }
    throw new BadRequestError(`Fetch request for ${url} failed: ${e.message}`)
  }
}

// Read a response body, handing each chunk to `onChunk`, and abort once more
// than maxBytes have arrived.
async function readBodyUpTo(url, response, maxBytes, onChunk) {
  let bytesRead = 0
  for await (const chunk of response) {
    bytesRead += chunk.byteLength
    if (bytesRead > maxBytes) {
      throw new BadRequestError(
        `Fetch request for ${url} failed: received content exceeds maximum file size of ${maxBytes} bytes`,
      )
    }
    await onChunk(chunk)
  }
}

// Download a URL straight to a file, without ever holding the whole body in
// memory. Returns true if the file was written, or false if our copy on disk
// was already current.
async function fetchToFile(url, maxBytes, destination) {
  const { notModified, response, timer } = await beginValidatedFetch(
    url,
    maxBytes,
    destination,
  )
  try {
    if (notModified) {
      return false
    }
    console.log('Save to:', destination)
    // Concurrent requests may be downloading the same file, or running vg on
    // the copy already there, so only a complete file replaces it.
    const partial = `${destination}.${randomUUID()}.part`
    const fileStream = fs.createWriteStream(partial)
    try {
      await readBodyUpTo(url, response, maxBytes, async chunk => {
        if (!fileStream.write(chunk)) {
          await once(fileStream, 'drain')
        }
      })
      fileStream.end()
      await finished(fileStream)
      await fs.promises.rename(partial, destination)
    } catch (e) {
      fileStream.destroy()
      await fs.promises.rm(partial, { force: true })
      throw e
    }
    if (response.headers.etag !== undefined) {
      ETagMap.set(url, response.headers.etag)
    }
    return true
  } finally {
    clearTimeout(timer)
  }
}

// Download a small text document (a BED file, a chunk index) as a string.
async function fetchText(url, maxBytes) {
  const { response, timer } = await beginValidatedFetch(url, maxBytes)
  try {
    const chunks = []
    await readBodyUpTo(url, response, maxBytes, chunk => {
      chunks.push(chunk)
    })
    return Buffer.concat(chunks).toString('utf-8')
  } finally {
    clearTimeout(timer)
  }
}

// Download files for the specified relative chunk path, for the BED file at
// the given URL.
//
// includeContent only downloads the tracks.json file when set to false. If
// true, all files listed in chunk_contents.txt will be downloaded.
// includeContent is false when we select a region, we only need the track names
// includeContent is true when the go button is pressed and a getChunkedData request is called
const retrieveChunk = async (bedURL, chunk, includeContent) => {
  // path to the designated chunk in the temp directory
  const chunkDir = bedChunkLocalPath(bedURL, chunk)

  if (!fs.existsSync(chunkDir)) {
    fs.mkdirSync(chunkDir, { recursive: true })
  }

  // URL under which all the chunk files will exist. Make sure it ends in '/'
  // so we can look up the contents relative to it.
  let chunkURL = new URL(chunk, bedURL).toString()
  if (!chunkURL.endsWith('/')) {
    chunkURL = chunkURL + '/'
  }

  // Each chunk has an index in "chunk_contents.txt"
  const chunkContentURL = new URL('chunk_contents.txt', chunkURL).toString()

  const chunkContent = await fetchText(chunkContentURL, config.maxFileSizeBytes)
  const fileNames = chunkContent.split('\n')

  // download all the files in the chunk
  for (const fileName of fileNames) {
    if (fileName == '') {
      // Skip blank lines/trailing newline
      continue
    }
    if (fileName !== sanitize(fileName)) {
      // Make sure we don't do things like get out of the directory.
      throw new BadRequestError(
        `Chunk index at ${chunkContentURL} contains disallowed filename ${fileName}`,
      )
    }

    // We can interpret all the files in chunk_contents.txt relative to the file they are listed in.
    const chunkFileURL = new URL(fileName, chunkContentURL).toString()

    // download only the tracks.json file if the includeContent flag is false
    if (includeContent || fileName == 'tracks.json') {
      const chunkFilePath = path.resolve(chunkDir, fileName)
      await downloadFile(chunkFileURL, chunkFilePath)
    }
  }
}

// The tracks listed in a local chunk directory's tracks.json, or null if it
// has none.
function readChunkTracks(chunkPath) {
  const tracksFile = path.resolve(chunkPath, 'tracks.json')
  if (!fs.existsSync(tracksFile)) {
    return null
  }
  return JSON.parse(fs.readFileSync(tracksFile, 'utf-8'))
}

// The tracks a BED file's chunk lists, fetching only its tracks.json when the
// BED is a URL.
async function getChunkTracks(bedFile, chunk) {
  if (isValidURL(bedFile)) {
    await retrieveChunk(bedFile, chunk, false)
  }
  return readChunkTracks(bedChunkLocalPath(bedFile, chunk))
}

// Expects a request with a bed file and a chunk name
// Returns tracks retrieved from getChunkTracks
api.post(
  '/getChunkTracks',
  withDataDirectoriesLocked(async (req, res) => {
    console.log('received request for chunk tracks')
    if (!req.body.bedFile || !req.body.chunk) {
      throw new BadRequestError(
        `Invalid request format: bedFile ${req.body.bedFile}, chunk ${req.body.chunk}`,
      )
    }
    assertBedFileReadable(req.body.bedFile)
    const tracks = await getChunkTracks(req.body.bedFile, req.body.chunk)
    res.json({ tracks: tracks })
  }),
)

api.post(
  '/getBedRegions',
  withDataDirectoriesLocked(async (req, res) => {
    console.log('received request for bedRegions')
    if (req.body.bedFile) {
      res.json({
        bedRegions: await getBedRegions(req.body.bedFile),
        error: null,
      })
    } else {
      throw new BadRequestError('No BED file specified')
    }
  }),
)

// Throw unless the given BED file is a URL, or a local path we are willing to
// read on a user's behalf.
function assertBedFileReadable(bed) {
  if (!isValidURL(bed)) {
    if (!bed.endsWith('.bed')) {
      throw new BadRequestError('BED file path does not end in .bed: ' + bed)
    }
    if (!isAllowedPath(bed)) {
      throw new BadRequestError('BED file path not allowed: ' + bed)
    }
    if (!fs.existsSync(bed)) {
      throw new BadRequestError('BED file not found: ' + bed)
    }
  }
}

// Load up the given BED file by URL or path, and
// return a data structure describing all the pre-cached regions it defines.
// Validates file paths for user-accessibility. May throw.
async function getBedRegions(bed) {
  const bed_info = {
    chr: [],
    start: [],
    end: [],
    desc: [],
    chunk: [],
    tracks: [],
  }
  let bed_data
  console.log('bed file received ', bed)
  assertBedFileReadable(bed)
  if (isValidURL(bed)) {
    bed_data = await fetchText(bed, config.maxFileSizeBytes)
  } else {
    // Load and parse the BED file from dataPath
    bed_data = fs.readFileSync(bed).toString()
  }

  const lines = bed_data.split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    const records = line.split('\t')

    if (records.length < 3) {
      // This is an empty line or otherwise not BED
      if (line !== '') {
        // This is a bad line
        throw new BadRequestError(
          'BED line ' + (index + 1) + ' could not be parsed',
        )
      }
      continue
    }
    bed_info['chr'].push(records[0])
    bed_info['start'].push(records[1])
    bed_info['end'].push(records[2])
    let desc = records.join('_')
    if (records.length > 3) {
      desc = records[3]
    }
    bed_info['desc'].push(desc)
    let chunk = ''
    if (records.length > 4) {
      chunk = records[4]
    }
    bed_info['chunk'].push(chunk)
  }

  if (bed_info.chr.length === 0) {
    throw new BadRequestError('BED file is empty: ' + bed)
  }

  // Prefill each region's tracks from a tracks.json already on disk (a URL
  // BED's is downloaded when the region is first selected). A null keeps
  // whatever tracks the client already has.
  for (const chunk of bed_info['chunk']) {
    bed_info['tracks'].push(
      chunk === '' ? null : readChunkTracks(bedChunkLocalPath(bed, chunk)),
    )
  }

  console.log('returning bed_info, ', bed_info)
  return bed_info
}

// Return the string URL for the host and port at which the given Express app
// server is listening, with HTTP scheme.
function getServerURL(server) {
  const address = server.address()
  return (
    'http://' +
    (address.family === 'IPv6'
      ? '[' + address.address + ']'
      : address.address) +
    ':' +
    address.port
  )
}

// Start the server. Returns a promise that resolves when the server is ready.
// To stop the server, close() the result. Server base URL can be obtained with
// getUrl().
export function start() {
  return new Promise((resolve, reject) => {
    // This holds the top-level state of the server and lets us close things up.
    // TODO: use a real class.
    const state = {
      // Express server
      server: undefined,
      // Web socket server
      wss: undefined,
      // Filesystem watch
      watcher: undefined,
      // Outstanding websocket connections
      connections: undefined,
      // Shut down the server
      close: async () => {
        console.log('[shutdown] stopping expired file cleanup task')
        clearInterval(expiredFileCleanupTask)

        console.log('[shutdown] removing temp dir')
        fs.rmSync(DOWNLOAD_DATA_PATH, { recursive: true, force: true })

        console.log(
          `[shutdown] shutting down WSS (${state.connections.size} open WS connections)`,
        )
        state.wss.shutDown()
        console.log('[shutdown] closing file watcher')
        state.watcher.close()
        console.log(
          `[shutdown] dropping ${state.connections.size} WebSocket connection(s)`,
        )
        for (const connection of state.connections) {
          connection.drop(1001)
        }

        console.log(
          '[shutdown] closing HTTP server + force-closing all connections',
        )
        await new Promise(resolve => {
          state.server.close(err => {
            if (err) {
              console.log(
                '[shutdown] HTTP server closed with error: ' + err.message,
              )
            } else {
              console.log('[shutdown] HTTP server closed cleanly')
            }
            resolve()
          })
          // Force-close all remaining TCP connections (keepalive + WebSocket sockets)
          // so close() resolves promptly rather than waiting for clients to drain.
          state.server.closeAllConnections()
        })

        console.log('[shutdown] TubeMapServer stopped.')
      },
      // Get the URL the server is listening on
      getUrl: () => {
        return getServerURL(state.server)
      },
      // Get the URL the server is listening on for the API
      getApiUrl: () => {
        return state.getUrl() + '/api/v0'
      },
    }

    // If the state fields are all filled in, resolve the promise for the closeable server object.
    function resolveIfReady() {
      if (
        state.server !== undefined &&
        state.wss !== undefined &&
        state.watcher !== undefined
      ) {
        resolve(state)
      }
    }

    const serverPort = process.env.SERVER_PORT
      ? parseInt(process.env.SERVER_PORT, 10)
      : config.serverPort || 3000
    // NOTE: don't pass a callback positionally to app.listen — Express 5 wraps
    // it with `once` and attaches it to both 'listening' AND 'error', so a
    // bind failure (e.g. EADDRINUSE) would fire the same callback with no
    // address() yet and mask the real error.
    const server = app.listen(serverPort, SERVER_BIND_ADDRESS)
    server.on('listening', () => {
      console.log('TubeMapServer listening on ' + getServerURL(server))
      state.server = server
      resolveIfReady()
    })
    server.on('error', err => {
      console.error('TubeMapServer error:', err)
      reject(err)
    })
    // Create the WebSocketServer, for watching for updated files, using the HTTP server instance
    // Note that all websocket connections on any path end up here!
    const wss = new WebSocketServer({ httpServer: server })

    // Set that holds all the WebSocketConnection instances that
    // notify the client of file directory changes
    state.connections = new Set()

    wss.on('request', function (request) {
      // We received a websocket connection request and we need to accept it.
      console.log(
        `${new Date()} New WebSocket connection from origin: ${request.origin}.`,
      )
      const connection = request.accept(null, request.origin)
      // We save the connection so that we can notify them when there is a change in the file system
      state.connections.add(connection)
      connection.on('close', function (_reasonCode, _description) {
        // When the websocket connection closes, we delete it from our set of open connections
        state.connections.delete(connection)
        console.log(
          `A WebSocket connection has been closed: ${state.connections.size} remain open.`,
        )
      })
    })

    state.wss = wss

    const watcher = fs.watch(MOUNTED_DATA_PATH, function (_event, _filename) {
      // There was a change in the file directory
      console.log('Directory has been changed')
      for (const conn of state.connections) {
        // Notify all open connections about the change
        conn.send('change')
      }
    })

    state.watcher = watcher
    resolveIfReady()
  })
}

// Per-request scratch directories left behind by a server that stopped
// mid-request.
function removeStaleScratchDirectories() {
  for (const entry of fs.readdirSync(SCRATCH_DATA_PATH)) {
    if (entry.startsWith('tmp-')) {
      fs.rmSync(path.join(SCRATCH_DATA_PATH, entry), {
        recursive: true,
        force: true,
      })
    }
  }
}

// Tests start servers side by side in one checkout, so only a server run as
// the main module sweeps the shared scratch directory.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  removeStaleScratchDirectories()
  void start()
}

function shutDown(reason) {
  console.log(`\nshutting down from ${reason}`)
  clearInterval(expiredFileCleanupTask)
  fs.rmSync(DOWNLOAD_DATA_PATH, { recursive: true, force: true })
  process.exit()
}

process.on('SIGINT', () => {
  shutDown('SIGINT')
})
// Docker stops a container with SIGTERM.
process.on('SIGTERM', () => {
  shutDown('SIGTERM')
})
// `pnpm start` runs the backend with an IPC channel to vite, which closes
// however vite exits.
process.on('disconnect', () => {
  shutDown('dev server exit')
})
