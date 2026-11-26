// Compatibility entrypoint. Preparation only unless --apply is explicitly given.
// Never export predictions without capturing/validating the shared weather input.
import {runCli} from './generate_prediction_snapshot.mjs'
await runCli()
