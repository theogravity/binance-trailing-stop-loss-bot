# trading-bot-example

Something I built in hours to impl trailing stop losses on the sell side via Binance.

# Disclaimer

Code is really bad, use at your own risk. The code will have bugs, the numbers may
be inaccurate, etc. I take no responsibility for any losses or damage you may
incur running this code.

I OFFER NO SUPPORT FOR THIS CODE.

## Installation

### Install modules

(it is not published on npm)

`npm i`

### Configure API keys

open `sell-stop-limit.cmd.js` and find the appropriate places where it asks for an API key at the
top of the file.

You will need the following

- Binance API key / secret
- (optional) Slack bot token / your slack username that the bot can message you with

## Usage

`npm run trade sell-stop-limit --help`

Note: This bot only creates a limit order when stop loss is reached. It does *not*
create a stop-loss order (it does the stop loss tracking itself)

### Example usage

- Sets the trading pair to XLM/USDT
- Maintains the stop loss price to be (`Market price - 0.01600`)
- Sets the limit price on stop loss trigger to (`Stop price - 0.00100`)
- When the price advances, reduce the stop loss gap by `0.75%`, up to a max of `80%`
- Simulate the trade (does not actually execute the order when stop loss is triggered)

```
npm run trade sell-stop-limit --tradePair XLM/USDT \
--sell.stopOffsetPrice 0.01600 --sell.limitOffsetPrice 0.00100 \
--sell.reduceStopOffsetPriceBy .75 --sell.reduceStopOffsetPriceByMax 80 \
--simulate
```

