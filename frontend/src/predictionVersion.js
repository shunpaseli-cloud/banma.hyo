import version from './data/prediction_version.json'
export const SNAPSHOT_META=version
export function versionStatus(expected,published){return typeof published?.version!=='string'?'unverified':published.version===expected?'current':'mismatch'}
