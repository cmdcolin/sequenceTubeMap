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
import zlib from 'zlib'
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
import { pipeline, Transform } from 'stream'
import { pipeline as pipelineAsync } from 'stream/promises'
import dns from 'dns'
import http from 'http'
import https from 'https'
import net from 'net'
import sanitize from 'sanitize-filename'
import { createHash, randomUUID } from 'node:crypto'

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

// How many requests are using files in the download and upload directories.
// The expired-file sweep waits for there to be none; a lock would instead
// hold every new request up behind a sweep waiting on a slow one.
let dataDirectoryUsers = 0

// Wrap a route handler to count as using the data directories until it
// settles, which is after every subprocess it started has exited.
function withDataDirectoriesInUse(handler) {
  return async (req, res, next) => {
    dataDirectoryUsers += 1
    try {
      return await handler(req, res, next)
    } finally {
      dataDirectoryUsers -= 1
    }
  }
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000
let lastSweep = Date.now()

// About hourly, at a moment no request is using them, delete the files in
// the download and upload directories unread for fileExpirationTime.
// deleteExpiredFiles is synchronous, so no request starts partway through.
const expiredFileCleanupTask = setInterval(() => {
  if (dataDirectoryUsers > 0 || Date.now() - lastSweep < SWEEP_INTERVAL_MS) {
    return
  }
  lastSweep = Date.now()
  for (const dir of [DOWNLOAD_DATA_PATH, UPLOAD_DATA_PATH]) {
    try {
      deleteExpiredFiles(dir)
    } catch (e) {
      console.error('Error checking for expired files in ' + dir + ':', e)
    }
  }
}, 60 * 1000)

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
  async (req, res) => {
    console.log('/trackFileSubmission')
    console.log(req.file)
    // The expired-file sweep only deletes files unread for a day, and these
    // are new, so this doesn't count as using the data directories.

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
      await indexGamSorted(req, res)
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

async function indexGamSorted(req, res) {
  // Uploads are stored as <uuid>.gam.
  const readsPath = req.file.path
  const sortedPath = readsPath.replace(/\.gam$/, '.sorted.gam')

  const params = ['gamsort', '-i', sortedPath + '.gai', readsPath]
  console.log(`vg ${params.join(' ')}`)
  const child = spawn(find_vg(), params, {
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: requestSignal(res),
  })
  req.error = ''
  child.stderr.on('data', data => {
    console.log(`vg gamsort err data: ${data}`)
    req.error += data
  })

  const [{ error, code }] = await Promise.all([
    childExit(child),
    pipelineAsync(child.stdout, fs.createWriteStream(sortedPath)),
  ])
  if (error !== undefined || code !== 0) {
    console.log(`vg gamsort failed: ${error ?? `exit code ${code}`}`)
    throw new VgExecutionError('vg gamsort failed')
  }
  res.json({ path: path.relative('.', sortedPath) })
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

api.post('/getChunkedData', withDataDirectoriesInUse(getChunkedData))

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

// A signal that aborts once the client has gone away or the request has run
// for config.requestTimeout seconds, to stop the subprocesses and fetches the
// request started.
function requestSignal(res) {
  const clientGone = new AbortController()
  const abortIfUnanswered = () => {
    if (!res.writableFinished) {
      clientGone.abort()
    }
  }
  if (res.closed) {
    abortIfUnanswered()
  } else {
    res.once('close', abortIfUnanswered)
  }
  return AbortSignal.any([
    clientGone.signal,
    AbortSignal.timeout(config.requestTimeout * 1000),
  ])
}

// Run `stages` as a shell pipeline, each one's stdout feeding the next one's
// stdin, and resolve with the last one's stdout. When a stage fails, kill the
// rest and reject naming the first to fail.
async function runPipeline(req, stages) {
  const children = stages.map((stage, i) => {
    console.log(`${stage.command} ${stage.args.join(' ')}`)
    return spawn(stage.command, stage.args, {
      stdio: [i === 0 ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      signal: req.abortSignal,
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
    if (req.abortSignal.reason?.name === 'TimeoutError') {
      throw new VgExecutionError(
        `${failed.name} ran past the ${config.requestTimeout} second limit on a request`,
      )
    }
    throw new VgExecutionError(`${failed.name} failed`)
  }
  return Buffer.concat(output).toString()
}

// read a graph object and remove "sequence" fields in place
function removeNodeSequencesInPlace(graph) {
  if (!graph.node) {
    return
  }
  graph.node.forEach(function (node) {
    node.sequenceLength = node.sequence.length
    delete node.sequence
  })
}

// Handle a chunked data (tube map view) request: cut the region out of the
// graph (or view its pre-fetched chunk), gather its reads and annotations, and
// answer with the lot.
async function getChunkedData(req, res) {
  const reqId = randomUUID()
  req.reqId = reqId
  console.time(`request-duration-${reqId}`)
  console.log('http POST getChunkedData received')
  console.log(`region = ${req.body.region}`)
  console.log(`tracks = ${JSON.stringify(req.body.tracks)}`)

  req.abortSignal = requestSignal(res)

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
      ? await getChunkName(req.body.bedFile, parsedRegion, req.abortSignal)
      : ''
  if (chunk !== '') {
    chunkPath = await getChunkPath(req.body.bedFile, chunk, req.abortSignal)
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
  const gamFiles = getGams(req.body.tracks)

  console.log('graphFile ', graphFile)
  console.log('gbwtFile ', gbwtFile)
  console.log('nodeFile ', nodeFile)
  console.log('bedFile ', req.body.bedFile)
  console.log('gamFiles ', gamFiles)

  req.withGam = gamFiles.length > 0
  req.withGbwt = gbwtFile !== undefined
  req.withNode = nodeFile !== undefined

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
  req.removeSequences = Boolean(req.body.removeSequences)

  // We always need a range-version of the region, to fill in req.region, to
  // generate the region part of the response with the range.
  const rangeRegion = convertRegionToRangeRegion(parsedRegion)

  req.error = ''
  // The per-request directory vg writes into, which is ours to remove.
  let scratchDir = undefined
  // Whether chunkix.py cuts the graph out of a tabix-indexed pangenome
  // (experimental), rather than vg.
  const tabix = chunkPath === '' && graphFile?.endsWith('.pos.bed.gz')
  try {
    let graphJSON
    if (chunkPath !== '') {
      req.chunkDir = chunkPath
      const chunkGraph = `${chunkPath}/chunk.vg`
      graphJSON = await runPipeline(
        req,
        req.simplify
          ? [vgStage(['simplify', chunkGraph]), vgViewGraphStage('-')]
          : [vgViewGraphStage(chunkGraph)],
      )
    } else {
      assertGraphFile(graphFile)
      const dir = path.join(SCRATCH_DATA_PATH, `tmp-${randomUUID()}`)
      const files = { graphFile, gbwtFile, nodeFile, gamFiles }
      const stages = tabix
        ? [chunkixStage(req, dir, files, rangeRegion)]
        : [
            vgStage(vgChunkArgs(req, dir, files, parsedRegion, rangeRegion)),
            ...(req.simplify ? [vgStage(['simplify', '-'])] : []),
            vgViewGraphStage('-'),
          ]
      await fs.promises.mkdir(dir)
      scratchDir = req.chunkDir = dir
      console.time(`chunk-${reqId}`)
      graphJSON = await runPipeline(req, stages)
      console.timeEnd(`chunk-${reqId}`)
    }

    if (tabix) {
      // chunkix writes the graph to a file, with the path we reference first.
      const graphFileJSON = `${req.chunkDir}/chunk.graph.json`
      setGraph(req, await fs.promises.readFile(graphFileJSON, 'utf-8'))
      req.region = [rangeRegion.start, rangeRegion.end]
    } else {
      setGraph(req, graphJSON)
      req.region = responseRegion(rangeRegion)
      req.graph.path = organizePathsTargetFirst(parsedRegion, req.graph.path)
    }

    await processAnnotationFile(req)
    const gam = req.withGam ? await processGamFiles(req) : []
    await processRegionFile(req)
    const coloredNodes = await processNodeColorsFile(req)

    res.json({
      // TODO: Any standard error output will make an error response.
      error: req.error,
      graph: req.graph,
      gam,
      region: req.region,
      coloredNodes,
      nameMap: req.nameMap,
    })
    console.timeEnd(`request-duration-${reqId}`)
  } finally {
    if (scratchDir !== undefined) {
      await fs.promises
        .rm(scratchDir, { recursive: true, force: true })
        .catch(err => {
          console.error('Could not remove chunk directory ' + scratchDir, err)
        })
    }
  }
}

function vgViewGraphStage(input) {
  return vgStage(['view', '-j', input], { reportStderr: false })
}

// Parse the JSON graph a chunking pipeline produced into req.graph.
function setGraph(req, graphJSON) {
  if (graphJSON === '') {
    throw new VgExecutionError('Chunking produced an empty graph')
  }
  req.graph = parseSubprocessJSON(graphJSON, 'the graph')
  if (req.removeSequences) {
    removeNodeSequencesInPlace(req.graph)
  }
}

// The region a vg chunk response covers: none for a node query, and in base
// path coordinates for a query on a path with a subrange.
function responseRegion(rangeRegion) {
  if (rangeRegion.contig === 'node') {
    return [null, null]
  }
  const subrangeStart = getSubrangeStart(rangeRegion.contig)
  return [rangeRegion.start + subrangeStart, rangeRegion.end + subrangeStart]
}

// The chunkix.py stage that cuts `rangeRegion` out of a tabix-indexed
// pangenome (experimental) into `dir`.
function chunkixStage(
  req,
  dir,
  { graphFile, gbwtFile, nodeFile, gamFiles },
  rangeRegion,
) {
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

  const args = [
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
    `${dir}/chunk`,
  ]
  for (const gafFile of gamFiles) {
    if (!gafFile.endsWith('.gaf.gz')) {
      if (gafFile.endsWith('.gam')) {
        throw new BadRequestError(
          'Tabix-index mode only works with indexed GAF files',
        )
      }
      throw new BadRequestError("GAF file doesn't end .gaf.gz: " + gafFile)
    }
    if (!isAllowedPath(gafFile)) {
      throw new BadRequestError('GAF file path not allowed: ' + gafFile)
    }
    args.push('-a', gafFile)
  }
  args.push('-r', stringifyRangeRegion(rangeRegion))
  return { name: 'chunkix', command: 'python3', args, reportStderr: true }
}

// The vg chunk arguments that cut the region and its reads out of the graph
// into `dir`.
function vgChunkArgs(
  req,
  dir,
  { graphFile, gbwtFile, gamFiles },
  parsedRegion,
  rangeRegion,
) {
  const args = ['chunk']
  if (req.withGbwt) {
    if (graphFile.endsWith('.gbz') && graphFile === gbwtFile) {
      // The GBZ's own haplotypes
      args.push('-x', graphFile)
    } else if (!graphFile.endsWith('.gbz') && gbwtFile.endsWith('.gbz')) {
      throw new BadRequestError('Cannot use gbz as haplotype alone.')
    } else {
      if (!endsWithExtensions(gbwtFile, HAPLOTYPE_EXTENSIONS_VG)) {
        throw new BadRequestError(
          "GBWT file doesn't end in .gbwt or .gbz: " + gbwtFile,
        )
      }
      if (!isAllowedPath(gbwtFile)) {
        throw new BadRequestError('GBWT file path not allowed: ' + gbwtFile)
      }
      args.push('--no-embedded-haplotypes', '-x', graphFile)
      args.push('--gbwt-name', gbwtFile)
    }
  } else if (graphFile.endsWith('.gbz')) {
    args.push('-x', graphFile, '--no-embedded-haplotypes')
  } else {
    args.push('-x', graphFile)
  }

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
      anyGam = true
    } else {
      anyGaf = true
    }
    args.push('-a', gamFile)
  }
  if (anyGam && anyGaf) {
    throw new BadRequestError(
      'Reads must be either GAM files or GAF files, not mix both.',
    )
  }
  if (anyGaf) {
    args.push('-F', '-g')
  }
  if (anyGam) {
    args.push('-g')
  }

  // A node ID query looks like 'node:1-10'.
  if (parsedRegion.contig === 'node') {
    if (parsedRegion.distance !== undefined) {
      args.push('-r', parsedRegion.start, '-c', parsedRegion.distance)
    } else {
      args.push('-r', `${parsedRegion.start}:${parsedRegion.end}`, '-c', 20)
    }
  } else {
    args.push('-c', '20', '-p', stringifyRangeRegion(rangeRegion))
  }
  args.push('-T', '-b', `${dir}/chunk`, '-E', `${dir}/regions.tsv`)
  return args
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

// Send errors that handlers throw, reject with or pass to next() to the user.
function returnErrorMiddleware(err, req, res, next) {
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
async function getChunkName(bed, parsedRegion, signal) {
  let chunk = ''
  const regionInfo = await getBedRegions(bed, signal)

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
async function getChunkPath(bed, chunk, signal) {
  const chunkPath = bedChunkLocalPath(bed, chunk)

  if (isValidURL(bed)) {
    // download the rest of the chunk
    await retrieveChunk(bed, chunk, true, signal)
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

// Give each path the haplotype frequency the chunk's annotate.txt lists for it.
async function processAnnotationFile(req) {
  console.time(`processing annotation file-${req.reqId}`)
  let annotationFile = undefined
  for (const file of await fs.promises.readdir(req.chunkDir)) {
    if (file.endsWith('annotate.txt')) {
      annotationFile = req.chunkDir + '/' + file
    }
  }
  if (annotationFile === undefined) {
    throw new VgExecutionError('annotation file not created')
  }
  console.log(`annotationFile: ${annotationFile}`)

  // A graph with no paths comes back from vg view / chunkix without a path
  // field at all, and everything downstream wants to iterate it.
  req.graph.path ??= []

  const lines = await readLines(annotationFile)
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

// The reads in each of the chunk's read files, in track order.
async function processGamFiles(req) {
  console.time(`processing gam files-${req.reqId}`)
  const graphFile = getFirstFileOfType(req.body.tracks, fileTypes.GRAPH)
  // chunkix writes JSON; vg chunk writes GAM or GAF.
  const tabix = graphFile?.endsWith('.pos.bed.gz')
  const gamFiles = []
  for (const file of await fs.promises.readdir(req.chunkDir)) {
    if (
      tabix
        ? file.endsWith('annot.json')
        : file.endsWith('.gam') || file.endsWith('.gaf')
    ) {
      gamFiles.push(req.chunkDir + '/' + file)
    }
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

  // Let every file finish before reporting a failure, so no vg process
  // outlives the request.
  const results = await Promise.allSettled(
    gamFiles.map(gamFile => readGamFile(req, gamFile)),
  )
  console.timeEnd(`processing gam files-${req.reqId}`)
  const failure = results.find(result => result.status === 'rejected')
  if (failure !== undefined) {
    throw failure.reason
  }
  return results.map(result => result.value)
}

// Read the "region" file, a BED inside the chunk that records the path and
// start offset that defined the chunk, and mark the targeted path with it.
async function processRegionFile(req) {
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
    throw new BadRequestError('Path to region file not allowed: ' + regionFile)
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
}

// The nodes the chunk's nodeColors.tsv, if any, asks to highlight.
async function processNodeColorsFile(req) {
  const nodeColorsFile = `${req.chunkDir}/nodeColors.tsv`
  if (!isAllowedPath(nodeColorsFile)) {
    throw new BadRequestError(
      'Path to node colors file not allowed: ' + nodeColorsFile,
    )
  }
  return fs.existsSync(nodeColorsFile) ? readLines(nodeColorsFile) : []
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
function runProcessLines(cmd, args, onLine, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { signal })
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

function runVgLines(args, onLine, signal) {
  return runProcessLines(find_vg(), args, onLine, signal)
}

api.post(
  '/getPathInfo',
  withDataDirectoriesInUse(async (req, res, next) => {
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

    const signal = requestSignal(res)
    try {
      if (graphFile.endsWith('.pos.bed.gz')) {
        // pgtabix mode: names only, lengths/cyclicity not available
        const names = []
        await runProcessLines(
          'tabix',
          ['-l', graphFile],
          line => {
            names.push(line)
          },
          signal,
        )
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
        runVgLines(
          ['paths', '-E', '-x', graphFile],
          line => {
            lengthLines.push(line)
          },
          signal,
        ),
        // vg paths -C outputs: name\tdirected-(a)cyclic\tundirected-(a)cyclic
        runVgLines(
          ['paths', '-C', '-x', graphFile],
          line => {
            if (line && !line.startsWith('_')) {
              const [name, directed, undirected] = line.split('\t')
              if (
                directed === 'directed-cyclic' ||
                undirected === 'undirected-cyclic'
              ) {
                cyclicNames.add(name)
              }
            }
          },
          signal,
        ),
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
  }),
)

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
// by itself; the NAT64 and IPv4-compatible forms need rules of their own, and
// the 6to4, Teredo and local-use NAT64 prefixes, which relay to IPv4
// addresses they embed, are refused whole.
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
  ['2002::', 16],
  ['2001::', 32],
  ['64:ff9b:1::', 48],
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
const downloadFile = async (fileURL, destination, maxBytes, signal) => {
  if (!isAllowedPath(destination)) {
    throw new BadRequestError(
      'Download destination path not allowed: ' + destination,
    )
  }

  const written = await fetchToFile(fileURL, maxBytes, destination, signal)
  if (!written) {
    // file has already been downloaded and has not been updated since last fetch
    console.log('File has already been downloaded at ', destination)
  }
}

// Decoders for the compressed bodies we accept, by Content-Encoding.
const DECODERS = {
  gzip: () => zlib.createGunzip(),
  br: () => zlib.createBrotliDecompress(),
}

// Start a size- and host-checked GET, following redirects, that `signal` or
// config.fetchTimeout aborts. Returns the response and its body as the
// streams to pipe it through to decode it. `existingLocation`, when it names
// a file already on disk, makes the request conditional so an unchanged file
// isn't re-downloaded.
async function beginValidatedFetch(url, maxBytes, existingLocation, signal) {
  const headers = { 'Accept-Encoding': Object.keys(DECODERS).join(', ') }
  if (existingLocation !== undefined && fs.existsSync(existingLocation)) {
    headers['If-None-Match'] = ETagMap.get(url) ?? '-1'
  }
  const fetchSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(config.fetchTimeout * 1000),
  ])

  console.log('Fetching URL:', url)
  try {
    let location = url
    let response = await getPublic(location, headers, fetchSignal)
    for (
      let redirects = 0;
      REDIRECT_STATUSES.has(response.statusCode) &&
      response.headers.location !== undefined;
      redirects++
    ) {
      response.destroy()
      if (redirects === MAX_REDIRECTS) {
        throw new BadRequestError(
          `Fetch request for ${url} failed: more than ${MAX_REDIRECTS} redirects`,
        )
      }
      location = new URL(response.headers.location, location).toString()
      response = await getPublic(location, headers, fetchSignal)
    }

    if (response.statusCode === 304) {
      console.log('file not modified since last fetch')
      response.destroy()
      return { notModified: true, response }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy()
      throw new BadRequestError(
        `Fetch request for ${url} failed: ` + response.statusCode,
      )
    }

    const contentLength = response.headers['content-length']
    if (contentLength !== undefined && Number(contentLength) > maxBytes) {
      response.destroy()
      throw new BadRequestError(
        `Fetch request for ${url} failed: its Content-Length is more than the ${maxBytes} bytes allowed`,
      )
    }

    const encoding = response.headers['content-encoding'] ?? 'identity'
    const body = [response]
    if (encoding !== 'identity') {
      const decoder = DECODERS[encoding]
      if (decoder === undefined) {
        response.destroy()
        throw new BadRequestError(
          `Fetch request for ${url} failed: unsupported Content-Encoding ${encoding}`,
        )
      }
      body.push(decoder())
    }

    return { notModified: false, response, body }
  } catch (e) {
    if (e instanceof TubeMapError) {
      throw e
    }
    throw new BadRequestError(`Fetch request for ${url} failed: ${e.message}`)
  }
}

// A stream stage that passes a response body through until more than
// maxBytes have arrived.
function byteLimit(url, maxBytes) {
  let bytesRead = 0
  return new Transform({
    transform(chunk, encoding, callback) {
      bytesRead += chunk.length
      if (bytesRead > maxBytes) {
        callback(
          new BadRequestError(
            `Fetch request for ${url} failed: it sent more than the ${maxBytes} bytes allowed`,
          ),
        )
      } else {
        callback(null, chunk)
      }
    },
  })
}

// Download a URL straight to a file, without ever holding the whole body in
// memory. Returns true if the file was written, or false if our copy on disk
// was already current.
async function fetchToFile(url, maxBytes, destination, signal) {
  const { notModified, response, body } = await beginValidatedFetch(
    url,
    maxBytes,
    destination,
    signal,
  )
  if (notModified) {
    return false
  }
  console.log('Save to:', destination)
  // Concurrent requests may be downloading the same file, or running vg on
  // the copy already there, so only a complete file replaces it.
  const partial = `${destination}.${randomUUID()}.part`
  try {
    await pipelineAsync(
      ...body,
      byteLimit(url, maxBytes),
      fs.createWriteStream(partial),
    )
    await fs.promises.rename(partial, destination)
  } catch (e) {
    await fs.promises.rm(partial, { force: true })
    throw e
  }
  if (response.headers.etag !== undefined) {
    ETagMap.set(url, response.headers.etag)
  }
  return true
}

const MAX_TEXT_FETCH_BYTES = 10 * 1024 * 1024

// Download a small text document (a BED file, a chunk index) as a string.
async function fetchText(url, signal) {
  const maxBytes = MAX_TEXT_FETCH_BYTES
  const { body } = await beginValidatedFetch(url, maxBytes, undefined, signal)
  const chunks = []
  await pipelineAsync(...body, byteLimit(url, maxBytes), async source => {
    for await (const chunk of source) {
      chunks.push(chunk)
    }
  })
  return Buffer.concat(chunks).toString('utf-8')
}

const MAX_CHUNK_FILES = 100

// Download files for the specified relative chunk path, for the BED file at
// the given URL.
//
// includeContent only downloads the tracks.json file when set to false. If
// true, all files listed in chunk_contents.txt will be downloaded.
// includeContent is false when we select a region, we only need the track names
// includeContent is true when the go button is pressed and a getChunkedData request is called
const retrieveChunk = async (bedURL, chunk, includeContent, signal) => {
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

  const chunkContent = await fetchText(chunkContentURL, signal)
  const fileNames = chunkContent.split('\n').filter(fileName => fileName !== '')
  if (fileNames.length > MAX_CHUNK_FILES) {
    throw new BadRequestError(
      `Chunk index at ${chunkContentURL} lists ${fileNames.length} files, more than the ${MAX_CHUNK_FILES} allowed`,
    )
  }

  // A chunk's files share one budget of maxFileSizeBytes.
  let bytesLeft = config.maxFileSizeBytes
  for (const fileName of fileNames) {
    if (fileName !== sanitize(fileName)) {
      // Make sure we don't do things like get out of the directory.
      throw new BadRequestError(
        `Chunk index at ${chunkContentURL} contains disallowed filename ${fileName}`,
      )
    }

    // download only the tracks.json file if the includeContent flag is false
    if (includeContent || fileName == 'tracks.json') {
      const chunkFilePath = path.resolve(chunkDir, fileName)
      await downloadFile(
        new URL(fileName, chunkContentURL).toString(),
        chunkFilePath,
        bytesLeft,
        signal,
      )
      bytesLeft -= (await fs.promises.stat(chunkFilePath)).size
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
async function getChunkTracks(bedFile, chunk, signal) {
  if (isValidURL(bedFile)) {
    await retrieveChunk(bedFile, chunk, false, signal)
  }
  return readChunkTracks(bedChunkLocalPath(bedFile, chunk))
}

// Expects a request with a bed file and a chunk name
// Returns tracks retrieved from getChunkTracks
api.post(
  '/getChunkTracks',
  withDataDirectoriesInUse(async (req, res) => {
    console.log('received request for chunk tracks')
    if (!req.body.bedFile || !req.body.chunk) {
      throw new BadRequestError(
        `Invalid request format: bedFile ${req.body.bedFile}, chunk ${req.body.chunk}`,
      )
    }
    assertBedFileReadable(req.body.bedFile)
    const tracks = await getChunkTracks(
      req.body.bedFile,
      req.body.chunk,
      requestSignal(res),
    )
    res.json({ tracks: tracks })
  }),
)

api.post(
  '/getBedRegions',
  withDataDirectoriesInUse(async (req, res) => {
    console.log('received request for bedRegions')
    if (req.body.bedFile) {
      res.json({
        bedRegions: await getBedRegions(req.body.bedFile, requestSignal(res)),
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
async function getBedRegions(bed, signal) {
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
    bed_data = await fetchText(bed, signal)
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
