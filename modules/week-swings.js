// utils
const regCronIncAfterSixThirty = require('../utils/reg-cron-after-630');
const getMultipleHistoricals = require('../app-actions/get-multiple-historicals');
const executeStrategy = require('../app-actions/execute-strategy');

// const mapLimit = require('promise-map-limit');

const DEFAULT_OPTS = {
    BUFFERS: [ 10, 20, 30 ],
    MIN_SWINGS: [ 4, 5, 6 ],
    MIN_DIFF: 120
};

const trendFilter = async (Robinhood, trend) => {

    let cheapBuys = trend
        .filter(stock => {
            return Number(stock.quote_data.last_trade_price) < 6 &&
                Number(stock.quote_data.last_trade_price) > .2;
        });

    let allHistoricals = await getMultipleHistoricals(
        Robinhood,
        cheapBuys.map(buy => buy.ticker),
        'interval=10minute&span=week'
    );

    const withHistoricals = cheapBuys.map((buy, i) => ({
        ...buy,
        historicals: allHistoricals[i]
    }));

    const generateSwing = (buys, bufferSize, minDiff, minSwings) => {
        console.log(minSwings, 'minSwings');
        return buys.map(buy => {
            const { historicals } = buy;
            const closePrices = historicals.map(hist => hist.close_price);

            const [max, min] = [
                Math.max(...closePrices),
                Math.min(...closePrices)
            ];
            const diff = max - min;
            const inLowSegment = (price, bs) => price < min + (diff * (bs || bufferSize) / 100);
            const inHighSegment = price => price > max - (diff * bufferSize / 100);

            let lastSegment; // 2 = high, 1 = low
            let numSwings = 0;
            historicals.forEach(hist => {
                let newSegment;
                if (inLowSegment(hist.close_price)) {
                    newSegment = 1;
                } else if (inHighSegment(hist.close_price)) {
                    newSegment = 2;
                }
                if (newSegment && lastSegment !== newSegment) {
                    numSwings++;
                    console.log(buy.ticker, 'now', newSegment);
                    console.log('closing at ', hist.close_price, hist.begins_at);
                }
                lastSegment = newSegment || lastSegment;
            });

            return {
                ticker: buy.ticker,
                max,
                min,
                numSwings,
                isInLowSegment: inLowSegment(Number(buy.last_trade_price), bufferSize + 20),
                diffRatio: Math.round(max / min * 100),
                daysInLow: (() => {

                    let numDays = 0;
                    historicals.reverse().some(hist => {
                        numDays++;
                        return !inLowSegment(hist.close_price);
                    });
                    return numDays;

                })()
            };
        })
            .filter(buy => buy.isInLowSegment && buy.numSwings >= minSwings)
            .filter(buy => buy.diffRatio > minDiff)
            .sort((a, b) => b.numSwings - a.numSwings);
    };

    const stockResults = {};
    const handleSwings = (swings, { bufferSize }) => {
        swings.forEach(({ ticker, diffRatio, numSwings, daysInLow }) => {
            const title = `buffer: ${bufferSize}`;
            const points = diffRatio * numSwings * (35 - bufferSize);
            stockResults[ticker] = (stockResults[ticker] || []).concat({
                diffRatio,
                numSwings,
                daysInLow,
                swingTitle: title,
                points
            });
        });
    };

    const {
        BUFFERS: buffers,
        MIN_DIFF: minDiff,
        MIN_SWINGS: minSwings
    } = DEFAULT_OPTS;
    buffers.forEach(bufferSize => {
        minSwings.forEach(minSwing => {
            const swings = generateSwing(withHistoricals, bufferSize, minDiff, minSwing);
            handleSwings(swings, {
                bufferSize
            });
        });
    });
    // aggregate ticker swings
    Object.keys(stockResults).forEach(ticker => {
        const swings = stockResults[ticker];
        const totalPoints = swings
            .map(swing => swing.points)
            .reduce((acc, val) => acc + val, 0);
        stockResults[ticker] = {
            totalPoints,
            swings
        };
    });
    // order by totalPoints
    return Object.keys(stockResults)
        .sort((a, b) => stockResults[b].totalPoints - stockResults[a].totalPoints);

};

const weekSwings = {
    trendFilter,
    init: Robinhood => {
        // runs at init
        regCronIncAfterSixThirty(Robinhood, {
            name: 'execute week-swings strategy',
            run: [1, 169, 273], // 10:41am, 11:31am
            // run: [],
            fn: async (Robinhood, min) => {
                await executeStrategy(Robinhood, trendFilter, min, 0.3, 'week-swings');
            }
        });
    }
};

module.exports = weekSwings;
