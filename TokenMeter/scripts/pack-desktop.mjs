// Use the current manifest; do not re-pin desktop packages to retired rc.2 peers.
process.argv = [process.argv[0], process.argv[1], 'TokenMeter']
await import('../../scripts/pack-dsh-desktop.mjs')
