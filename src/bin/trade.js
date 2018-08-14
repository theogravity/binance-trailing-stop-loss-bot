#!/usr/bin/env node

import yargs from 'yargs'

function execCli () {
  let cli = yargs
    .wrap(120)
    .options({
      'tradePair': {
        type: 'string',
        demandOption: true
      },
      'simulate': {
        describe: 'If enabled, simulates the trade without execution',
        type: 'boolean',
        default: false
      }
    })
    .commandDir('cmds')
    .help()

  // eslint-disable-next-line no-unused-expressions
  cli.argv
}

execCli()
