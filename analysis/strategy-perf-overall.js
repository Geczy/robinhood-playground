// gets current strategy performance of picks TODAY
const cTable = require('console.table');

const fs = require('mz/fs');
const login = require('../rh-actions/login');
const { analyzeDay } = require('../app-actions/record-strat-perfs');
const jsonMgr = require('../utils/json-mgr');
const avgArray = require('../utils/avg-array');

let Robinhood;

class HashTable {
    constructor() {
        this.hashes = {};
    }
    put ( key, value ) {
        this.hashes[ JSON.stringify( key ) ] = value;
    }
    get ( key ) {
        return this.hashes[ JSON.stringify( key ) ];
    }
    keys () {
        return Object.keys(this.hashes)
            .map(hash => JSON.parse(hash));
    }
    print () {
        console.log(JSON.stringify(this.hashes, null, 2));
    }
}

(async () => {

    Robinhood = await login();

    let files = await fs.readdir('./strat-perfs');

    let sortedFiles = files
        .map(f => f.split('.')[0])
        .sort((a, b) => new Date(a) - new Date(b));



    let threeMostRecent = sortedFiles.slice(-2);
    console.log(threeMostRecent);

    const stratResults = new HashTable();
    for (let day of threeMostRecent) {

        const dayStrats = await jsonMgr.get(`./strat-perfs/${day}.json`);
        Object.keys(dayStrats).forEach(period => {

            const sellMin = Number(period.substring(period.lastIndexOf('-') + 1));
            dayStrats[period].forEach(stratPerf => {
                const split = stratPerf.strategyName.split('-');
                const buyMin = Number(split.pop());
                const strategyName = split.join('-');
                const key = {
                    strategyName,
                    buyMin,
                    // sellMin
                };
                stratResults.put(key, (stratResults.get(key) || []).concat(stratPerf.avgTrend));
            });

        });
    }

    stratResults.keys().forEach(keyObj => {
        const arrayOfTrends = stratResults.get(keyObj);
        stratResults.put(keyObj, {
            avgTrend: avgArray(arrayOfTrends),
            count: arrayOfTrends.length,
            trends: arrayOfTrends
        });
    });

    const allPerfs = [];
    stratResults.keys().forEach(keyObj => {
        const strategyPerformance = stratResults.get(keyObj);
        allPerfs.push({
            ...keyObj,
            ...strategyPerformance
        });
    });
    // stratResults.print();

    // console.log('all', allPerfs)

    const sortedFiltered = allPerfs
        .filter(perf => perf.count >= 3)
        // .filter(perf => !perf.trends.some(t => t < 0))
        .sort((a, b) => b.avgTrend - a.avgTrend);

    // console.log(sortedFiltered);


    console.table(
        sortedFiltered
            .filter(({ strategyName }) => {
                const lastChunk = strategyName.substring(strategyName.lastIndexOf('-') + 1);
                return !['single', 'first3'].includes(lastChunk);
            })
            .map(({ strategyName, avgTrend, buyMin }) => ({
                name: strategyName + '-' + buyMin,
                avgTrend
            }))
    );

})();
