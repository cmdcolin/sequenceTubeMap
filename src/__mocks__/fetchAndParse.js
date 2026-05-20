import {
  bedRegions,
  pathNames,
  mountedFileNames,
  chunkedData,
} from './data/index.js'

export const fetchAndParse = async path => {
  if (path.match(/getBedRegions/)) {
    return bedRegions
  } else if (path.match(/getPathNames/)) {
    return pathNames
  } else if (path.match(/getFilenames/)) {
    return mountedFileNames
  } else if (path.match(/getChunkedData/)) {
    return chunkedData
  }
}
