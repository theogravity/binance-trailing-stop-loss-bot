import * as ccxt from 'ccxt'
import { BigNumber } from 'bignumber.js'
import SlackBot from 'slackbots'

// create a bot
const bot = new SlackBot({
  token: '<your slack bot token>',
  name: 'trade-notifier'
})

const BINANCE_API_KEY = '<your api key>'
const BINANCE_API_SECRET = '<your api secret>'

const SLACK_USER = '<your slack username>'

export const command = 'sell-stop-limit'
export const describe = 'Performs a stop limit'

export function builder (yargs) {
  yargs
    .options({
      'sell.initialStopPrice': {
        describe: 'Use a custom init stop price instead of market price',
        type: 'number'
      },
      'sell.stopOffsetPrice': {
        describe: '(Initial market price - stopOffset) = stop price',
        type: 'number',
        default: -1
      },
      'sell.reduceStopOffsetPriceBy': {
        describe: 'Reduce the stop price gap by a % each advance',
        type: 'number'
      },
      'sell.reduceStopOffsetPriceByMax': {
        describe: 'Max % that reduceStopOffsetPriceBy can approach',
        type: 'number',
        default: 0
      },
      'sell.limitOffsetPrice': {
        describe: '(stop price - limitOffset) = limit',
        default: 0,
        type: 'number'
      },
      'sell.quantity': {
        describe: 'Quantity to sell.',
        type: 'number'
      },
      'sell.interval': {
        type: 'number',
        describe: 'How often to check for new prices in seconds',
        default: 1
      }
    })
}

export async function handler (params) {
  let {
    tradePair,
    sell: {
      initialStopPrice,
      stopOffsetPrice,
      limitOffsetPrice,
      reduceStopOffsetPriceBy,
      reduceStopOffsetPriceByMax,
      interval,
      quantity
    },
    simulate
  } = params

  if (!stopOffsetPrice) {
    console.error('stopOffsetPrice must be > 0')
  }

  const Binance = ccxt['binance']

  const exchange = new Binance({
    apiKey: BINANCE_API_KEY,
    secret: BINANCE_API_SECRET,
    timeout: 30000,
    'enableRateLimit': true
  })

  const sellSymbol = tradePair.split('/')[0]
  let availableQuantity = await exchange.fetchBalance()
  availableQuantity = new BigNumber(availableQuantity[sellSymbol].free)

  if (quantity) {
    quantity = new BigNumber(quantity)
    if (!simulate && quantity.isGreaterThan(availableQuantity)) {
      console.error(`Insufficient quantity for trading`)
      console.error(`Available: ${availableQuantity.toString()}`)
      console.error(`Specified: ${quantity.toString()}`)
      process.exit(-1)
    }
  } else {
    quantity = availableQuantity
  }

  let fee = null
  let initPrice = null
  let lastPrice = null
  let stopPrice = null
  let limitPrice = null
  let offsetPctRaisedBy = 0

  stopOffsetPrice = new BigNumber(stopOffsetPrice)
  limitOffsetPrice = new BigNumber(limitOffsetPrice)

  setInterval(async () => {
    const { info } = await exchange.fetchTicker(tradePair)
    const currentPrice = new BigNumber(info.lastPrice)

    if (simulate) {
      console.log('--Simulated--')
    } else {
      console.log('-------------')
    }
    console.log('Time:', interval++)

    if (lastPrice === null) {
      console.log('Starting values')

      initPrice = new BigNumber(info.lastPrice)

      if (initialStopPrice) {
        initPrice = new BigNumber(initialStopPrice)
      }

      lastPrice = new BigNumber(info.lastPrice)
      stopPrice = lastPrice.minus(stopOffsetPrice)
      limitPrice = stopPrice.minus(limitOffsetPrice)
      fee = await exchange.calculateFee(tradePair, null, 'sell', quantity.toNumber(), limitPrice.toNumber(), 'maker')
    } else if (currentPrice.isGreaterThan(lastPrice)) {
      console.log('>>> Advancing stop price')

      if (reduceStopOffsetPriceBy &&
        (offsetPctRaisedBy + reduceStopOffsetPriceBy) <= reduceStopOffsetPriceByMax) {
        offsetPctRaisedBy += reduceStopOffsetPriceBy
      }

      lastPrice = new BigNumber(info.lastPrice)
      stopPrice = lastPrice.minus(stopOffsetPrice).plus(stopOffsetPrice.multipliedBy(offsetPctRaisedBy).dividedBy(100))
      limitPrice = stopPrice.minus(limitOffsetPrice)
      fee = await exchange.calculateFee(tradePair, null, 'sell', quantity.toNumber(), limitPrice.toNumber(), 'maker')
    }

    let lastChangeStr = currentPrice.minus(initPrice)
    lastChangeStr = lastChangeStr.isNegative() ? lastChangeStr.toString() : `+${lastChangeStr.toString()}`

    let lastChangePctStr = currentPrice.minus(initPrice).dividedBy(initPrice).multipliedBy(100)
    lastChangePctStr = lastChangePctStr.isNegative() ? lastChangePctStr.toFixed(4).toString()
      : `+${lastChangePctStr.toFixed(4).toString()}`

    let stopPriceChangeStr = currentPrice.minus(stopPrice)
    stopPriceChangeStr = stopPriceChangeStr.isNegative() ? stopPriceChangeStr.toString()
      : `+${stopPriceChangeStr.toString()}`

    console.log('Pair:', tradePair)
    console.log('Avail Qty:', availableQuantity.toString())
    console.log('Sell Qty:', quantity.toString())
    console.log(`Est Fee: ${fee.cost} ${fee.currency}`)
    console.log('Start Price:', initPrice.toString())
    console.log('Init Stop:', initPrice.minus(stopOffsetPrice).toString())
    console.log('')
    console.log('Last High:', lastPrice.toString())
    console.log('Current:', currentPrice.toString(), `(Chng: ${lastChangeStr} / ${lastChangePctStr}%)`)
    console.log('C.Value:', currentPrice.multipliedBy(quantity).toString())
    console.log('')
    console.log('Stop:', stopPrice.toString(), `(Gap: ${stopPriceChangeStr}) (GapRaised %: ${offsetPctRaisedBy} / ${reduceStopOffsetPriceByMax})`)
    console.log('Limit:', limitPrice.toString())
    console.log('L.Value:', limitPrice.multipliedBy(quantity).toString())

    if (currentPrice.isLessThanOrEqualTo(stopPrice)) {
      console.log('')
      console.log(`Stop price triggered: ${stopPrice.toString()}`)
      console.log(`Executing limit order @ ${limitPrice.toString()}`)
      console.log(`Quantity: ${quantity.toString()} ${sellSymbol}`)
      console.log('')

      try {
        bot.postMessageToUser(SLACK_USER, `Stop price triggered: ${stopPrice.toString()}`).then(() => {}).catch((e) => {
          console.error('Could not post trigger message to slack')
          console.error(e)
        })
        await exchange.createOrder(tradePair, 'limit', 'sell', quantity.toNumber(), limitPrice.toNumber(), {
          test: simulate ? true : undefined
        })
      } catch (e) {
        console.error(e)
        process.exit(-1)
      }

      process.exit(0)
    }

    console.log('-------------')
    console.log('')
  }, 1000 * interval)
}
